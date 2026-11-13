import axios from "axios";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Device from "../models/device.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";

/**
 * App notifications: saved to the in-app inbox and, when Firebase is set up,
 * pushed to the user's phones.
 *
 * Render settings:
 *   FCM_SERVICE_ACCOUNT  Firebase service-account key (the JSON file's contents,
 *                        or the same base64-encoded). Without it, notifications
 *                        are still saved to the inbox but nothing is pushed.
 *   PUSH_ENABLED=false   Pauses pushes and new inbox entries.
 *
 * Every function here is best-effort: a failure is logged and never stops the
 * email or the request that triggered it.
 */

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let serviceAccount;
const getServiceAccount = () => {
    if (serviceAccount !== undefined) return serviceAccount;
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    serviceAccount = null;
    if (!raw) return null;
    try {
        const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
        const parsed = JSON.parse(text);
        if (parsed.client_email && parsed.private_key && parsed.project_id) serviceAccount = parsed;
        else console.error("[push] FCM_SERVICE_ACCOUNT is missing client_email, private_key or project_id");
    } catch (err) {
        console.error("[push] FCM_SERVICE_ACCOUNT could not be read:", err.message);
    }
    return serviceAccount;
};

let cachedToken = null; // { value, expiresAt }
const getAccessToken = async (sa) => {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
        { iss: sa.client_email, scope: FCM_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
        sa.private_key,
        { algorithm: "RS256" },
    );
    const { data } = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
        { timeout: 10_000 },
    );
    cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    return cachedToken.value;
};

const isEnabled = () => String(process.env.PUSH_ENABLED || "true").toLowerCase() !== "false";
const dbReady = () => mongoose.connection.readyState === 1;

const truncate = (s, n) => {
    const str = String(s ?? "");
    return str.length > n ? `${str.slice(0, n - 1)}…` : str;
};

/** Build the FCM v1 message for one device. Exported for tests. */
export const buildFcmMessage = (token, { title, body, url, type, badge }) => ({
    message: {
        token,
        notification: { title: truncate(title, 120), body: truncate(body, 240) },
        data: { url: String(url || "/"), type: String(type || "general") },
        android: { priority: "high", notification: { channel_id: "rexbid_default", sound: "default" } },
        apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default", ...(Number.isInteger(badge) ? { badge } : {}) } },
        },
    },
});

const sendToDevices = async (userId, payload) => {
    const sa = getServiceAccount();
    if (!sa) return 0;
    const devices = await Device.find({ user: userId }).select("token").lean();
    if (!devices.length) return 0;

    const accessToken = await getAccessToken(sa);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    let sent = 0;
    await Promise.all(devices.map(async ({ token }) => {
        try {
            await axios.post(endpoint, buildFcmMessage(token, payload), {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 10_000,
            });
            sent += 1;
        } catch (err) {
            const status = err.response?.status;
            const code = err.response?.data?.error?.details?.find?.((d) => d.errorCode)?.errorCode;
            // App uninstalled or token replaced: forget the device.
            if (status === 404 || code === "UNREGISTERED" || code === "INVALID_ARGUMENT") {
                await Device.deleteOne({ token }).catch(() => {});
            } else {
                console.error(`[push] send failed (${status || err.code}):`, err.response?.data?.error?.message || err.message);
            }
        }
    }));
    return sent;
};

const resolveUserId = async ({ user, userId, email }) => {
    const direct = userId || user?._id || (user && mongoose.isValidObjectId(user) ? user : null);
    if (direct) return direct;
    if (email) {
        const u = await User.findOne({ email: String(email).toLowerCase().trim() }).select("_id").lean();
        return u?._id || null;
    }
    return null;
};

/**
 * Notify one user. Pass `userId`, `user` (document or id) or `email`.
 * Returns the saved notification, or null if nothing was done.
 */
export const notify = async ({ user, userId, email, type, title, body = "", url = "/", dedupeKey } = {}) => {
    if (!isEnabled() || !dbReady() || !title) return null;
    try {
        const id = await resolveUserId({ user, userId, email });
        if (!id) return null;

        let saved;
        try {
            saved = await Notification.create({ user: id, type: type || "general", title, body, url, dedupeKey });
        } catch (err) {
            if (err?.code === 11000) return null; // already notified
            throw err;
        }

        const badge = await Notification.countDocuments({ user: id, readAt: null }).catch(() => undefined);
        await sendToDevices(id, { title, body, url, type, badge });
        return saved;
    } catch (err) {
        console.error("[push] notify failed:", err.message);
        return null;
    }
};

/** Fire-and-forget version for use next to emails: never awaits, never throws. */
export const notifyLater = (args) => {
    try {
        Promise.resolve(notify(args)).catch(() => {});
    } catch {
        /* never let a notification break the caller */
    }
};

export const __resetPushForTests = () => {
    serviceAccount = undefined;
    cachedToken = null;
};
