import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.REFRESH_TOKEN_SECRET ||= "test-refresh-secret";
const { startSession, rotateSession, endSession, endAllSessions, hashToken } = await import("../src/utils/sessions.js");

const fakeUser = () => ({
    _id: "507f1f77bcf86cd799439011",
    sessions: [],
    refreshToken: undefined,
    generateAccessToken: () => "access",
});
const days = (token) => {
    const { iat, exp } = jwt.decode(token);
    return Math.round((exp - iat) / 86400);
};

test("each sign-in gets its own session, so phone and website both stay signed in", () => {
    const user = fakeUser();
    const web = startSession(user, { rememberMe: false });
    const phone = startSession(user, { rememberMe: true });
    assert.equal(user.sessions.length, 2);
    assert.ok(rotateSession(user, web.refreshToken, jwt.decode(web.refreshToken)));
    assert.ok(rotateSession(user, phone.refreshToken, jwt.decode(phone.refreshToken)));
});

test("keep me signed in lasts 90 days, otherwise 7, and refreshing keeps the choice", () => {
    const user = fakeUser();
    const short = startSession(user, { rememberMe: false });
    const long = startSession(user, { rememberMe: true });
    assert.equal(days(short.refreshToken), 7);
    assert.equal(days(long.refreshToken), 90);
    const next = rotateSession(user, long.refreshToken, jwt.decode(long.refreshToken));
    assert.equal(days(next.refreshToken), 90);
});

test("only hashes are stored", () => {
    const user = fakeUser();
    const { refreshToken } = startSession(user);
    assert.equal(user.sessions[0].hash, hashToken(refreshToken));
    assert.ok(!JSON.stringify(user.sessions).includes(refreshToken));
});

test("an unknown or signed-out token is refused", () => {
    const user = fakeUser();
    const a = startSession(user);
    const b = startSession(user);
    endSession(user, a.refreshToken);
    assert.equal(rotateSession(user, a.refreshToken, jwt.decode(a.refreshToken)), null);
    assert.ok(rotateSession(user, b.refreshToken, jwt.decode(b.refreshToken)));
    endAllSessions(user);
    assert.equal(user.sessions.length, 0);
});

test("a just-replaced token still works briefly (two tabs refreshing together)", () => {
    const user = fakeUser();
    const first = startSession(user);
    assert.ok(rotateSession(user, first.refreshToken, jwt.decode(first.refreshToken)));
    assert.ok(rotateSession(user, first.refreshToken, jwt.decode(first.refreshToken)));
});

test("sign-ins from before this change (single refreshToken field) still refresh", () => {
    const user = fakeUser();
    const legacy = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
    user.refreshToken = legacy;
    const next = rotateSession(user, legacy, jwt.decode(legacy));
    assert.ok(next);
    assert.equal(user.refreshToken, undefined);
    assert.equal(user.sessions.length, 1);
});

test("at most 10 devices are remembered", () => {
    const user = fakeUser();
    for (let i = 0; i < 14; i += 1) startSession(user);
    assert.equal(user.sessions.length, 10);
});
