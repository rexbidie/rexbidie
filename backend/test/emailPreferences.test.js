import { test } from "node:test";
import assert from "node:assert/strict";
import { canEmailUser, preferencesUpdate, wantsCategory, EMAIL_CATEGORY, CATEGORY_KEYS } from "../src/utils/emailPreferences.js";

const bidder = (preferences = {}) => ({ userType: "bidder", preferences });

test("payments, auction won, offer accepted and item sold are always sent", () => {
    const allOff = bidder({ emailUpdates: false, email: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, false])) });
    for (const type of ["paymentCompleted", "sendAuctionWon", "offerAccepted", "sendAuctionEndedSeller", "payoutCompleted", "resetPassword"]) {
        assert.equal(canEmailUser(allOff, type), true, type);
    }
});

test("each optional email can be switched off by its category", () => {
    for (const [type, category] of Object.entries(EMAIL_CATEGORY)) {
        assert.equal(canEmailUser(bidder(), type), true, `${type} on by default`);
        assert.equal(canEmailUser(bidder({ email: { [category]: false } }), type), false, `${type} off with ${category}`);
    }
});

test("switching off one category leaves the others on", () => {
    const user = bidder({ email: { watchlist: false } });
    assert.equal(canEmailUser(user, "watchlist"), false);
    assert.equal(canEmailUser(user, "outbid"), true);
});

test("the old master switch still turns off every optional email", () => {
    assert.equal(canEmailUser(bidder({ emailUpdates: false }), "outbid"), false);
    assert.equal(canEmailUser(bidder({ emailUpdates: false }), "offerCountered"), false);
});

test("app notifications have their own switches", () => {
    const user = bidder({ emailUpdates: false, push: { bidding: false } });
    assert.equal(wantsCategory(user, "bidding", "push"), false);
    assert.equal(wantsCategory(user, "reminders", "push"), true); // email master switch doesn't affect push
});

test("preference updates only accept known categories and true/false", () => {
    assert.deepEqual(
        preferencesUpdate({ email: { outbid: false, watchlist: false, hacked: true }, push: { bidding: "no", reminders: false } }),
        { "preferences.email.watchlist": false, "preferences.push.reminders": false },
    );
    assert.equal(preferencesUpdate({ email: { nope: true } }), null);
    assert.deepEqual(preferencesUpdate({ emailUpdates: true }), { "preferences.emailUpdates": true });
});
