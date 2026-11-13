import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * Sign-in sessions, one per device / browser.
 *
 * Before, a user had a single refresh token, so signing in on a phone signed
 * them out of the website (and the other way round) about 15 minutes later.
 * Now each sign-in gets its own refresh token, stored only as a hash in
 * user.sessions.
 *
 * "Keep me signed in" (always on in the app) makes the session last
 * REMEMBER_ME_REFRESH_EXPIRY (default 90 days) instead of REFRESH_TOKEN_EXPIRY
 * (default 7 days). Either way it slides: each refresh starts the period again.
 */

const MAX_SESSIONS = 10;
// A refresh token that was just replaced still works briefly, so two tabs
// refreshing at the same moment don't sign the user out.
const ROTATION_GRACE_MS = 60 * 1000;

export const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const expiryFor = (rememberMe) =>
    rememberMe ? process.env.REMEMBER_ME_REFRESH_EXPIRY || "90d" : process.env.REFRESH_TOKEN_EXPIRY || "7d";

const signRefreshToken = (userId, rememberMe) =>
    jwt.sign(
        // jti makes every token unique, even two issued in the same second.
        { id: userId, rm: rememberMe ? 1 : 0, jti: crypto.randomBytes(8).toString("hex") },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: expiryFor(rememberMe) },
    );

const prune = (sessions, now = Date.now()) =>
    (sessions || [])
        .filter((s) => s.expiresAt && new Date(s.expiresAt).getTime() > now)
        .filter((s) => !s.rotatedAt || new Date(s.rotatedAt).getTime() + ROTATION_GRACE_MS > now)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

const addSession = (user, refreshToken, rememberMe) => {
    const { exp } = jwt.decode(refreshToken);
    const list = prune(user.sessions);
    list.unshift({
        hash: hashToken(refreshToken),
        rememberMe: !!rememberMe,
        createdAt: new Date(),
        expiresAt: new Date(exp * 1000),
    });
    user.sessions = list.slice(0, MAX_SESSIONS);
};

/** New sign-in. Returns { accessToken, refreshToken }; the caller saves the user. */
export const startSession = (user, { rememberMe = false } = {}) => {
    const accessToken = user.generateAccessToken();
    const refreshToken = signRefreshToken(user._id, rememberMe);
    addSession(user, refreshToken, rememberMe);
    return { accessToken, refreshToken };
};

/**
 * Swap a refresh token for new tokens. Returns null if the token isn't a
 * current session (signed out, password changed, expired…).
 * The caller has already verified the JWT signature and saves the user.
 */
export const rotateSession = (user, oldToken, decoded) => {
    const now = Date.now();
    const hash = hashToken(oldToken);
    const sessions = prune(user.sessions, now);
    const current = sessions.find((s) => s.hash === hash);
    // Sessions from before this change were kept in user.refreshToken.
    const legacy = !current && user.refreshToken && user.refreshToken === oldToken;
    if (!current && !legacy) {
        user.sessions = sessions;
        return null;
    }

    const rememberMe = current ? !!current.rememberMe : !!decoded?.rm;
    if (current && !current.rotatedAt) current.rotatedAt = new Date(now);
    if (legacy) user.refreshToken = undefined;
    user.sessions = sessions;

    const accessToken = user.generateAccessToken();
    const refreshToken = signRefreshToken(user._id, rememberMe);
    addSession(user, refreshToken, rememberMe);
    return { accessToken, refreshToken };
};

/** Sign out everywhere (password change / reset, account deletion). */
export const endAllSessions = (user) => {
    user.sessions = [];
    user.refreshToken = undefined;
};

/** Sign out one device. */
export const endSession = (user, refreshToken) => {
    if (!refreshToken) return;
    const hash = hashToken(refreshToken);
    user.sessions = (user.sessions || []).filter((s) => s.hash !== hash);
    if (user.refreshToken === refreshToken) user.refreshToken = undefined;
};
