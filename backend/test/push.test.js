import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFcmMessage, notify, notifyLater, __resetPushForTests } from "../src/utils/push.js";

test("FCM message carries the tap-through URL, sound and badge", () => {
    const msg = buildFcmMessage("tok123", {
        title: "You've been outbid",
        body: "Tractor: new highest bid €5,000",
        url: "/auction/abc",
        type: "outbid",
        badge: 3,
    });
    assert.equal(msg.message.token, "tok123");
    assert.equal(msg.message.notification.title, "You've been outbid");
    assert.deepEqual(msg.message.data, { url: "/auction/abc", type: "outbid" });
    assert.equal(msg.message.apns.payload.aps.badge, 3);
    assert.equal(msg.message.android.notification.channel_id, "rexbid_default");
});

test("long text is shortened to fit a phone notification", () => {
    const msg = buildFcmMessage("t", { title: "x".repeat(500), body: "y".repeat(500) });
    assert.ok(msg.message.notification.title.length <= 120);
    assert.ok(msg.message.notification.body.length <= 240);
    assert.equal(msg.message.data.url, "/");
    assert.equal(msg.message.apns.payload.aps.badge, undefined);
});

test("notify does nothing (and does not throw) without a database", async () => {
    __resetPushForTests();
    const result = await notify({ email: "someone@example.com", title: "Hello" });
    assert.equal(result, null);
    assert.doesNotThrow(() => notifyLater({ email: "x@example.com", title: "Hi" }));
});

test("PUSH_ENABLED=false switches notifications off", async () => {
    process.env.PUSH_ENABLED = "false";
    try {
        assert.equal(await notify({ userId: "507f1f77bcf86cd799439011", title: "Hi" }), null);
    } finally {
        delete process.env.PUSH_ENABLED;
    }
});
