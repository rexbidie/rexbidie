import { test } from "node:test";
import assert from "node:assert/strict";
import {
    PREPAID_TYPE,
    isPaidPrepaidExtras,
    pickReusablePayment,
    findReusablePrepaidPayment,
    listUnusedPrepaidPayments,
} from "../src/utils/prepaidExtras.js";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const secs = (iso) => Math.floor(Date.parse(iso) / 1000);
const pi = (id, over = {}) => ({
    id,
    status: "succeeded",
    amount: 7000,
    currency: "eur",
    created: secs("2026-11-15T07:35:00Z"),
    metadata: { type: PREPAID_TYPE, sellerId: "seller1" },
    latest_charge: { refunded: false, amount_refunded: 0 },
    ...over,
});

test("only succeeded, unrefunded listing-extras payments count", () => {
    assert.ok(isPaidPrepaidExtras(pi("a")));
    assert.ok(!isPaidPrepaidExtras(pi("b", { status: "requires_payment_method" })));
    assert.ok(!isPaidPrepaidExtras(pi("c", { metadata: { type: "listing_promotion", sellerId: "seller1" } })));
    assert.ok(!isPaidPrepaidExtras(pi("d", { latest_charge: { refunded: true, amount_refunded: 7000 } })));
    assert.ok(!isPaidPrepaidExtras(pi("e", { latest_charge: { refunded: false, amount_refunded: 1000 } })));
    assert.ok(isPaidPrepaidExtras(pi("f", { latest_charge: "ch_123" })));
});

test("reuses the seller's matching unused payment, newest first", () => {
    const intents = [
        pi("older", { created: secs("2026-11-15T07:30:00Z") }),
        pi("newer", { created: secs("2026-11-15T07:40:00Z") }),
        pi("other-seller", { metadata: { type: PREPAID_TYPE, sellerId: "seller2" } }),
        pi("wrong-amount", { amount: 4000 }),
        pi("gbp", { currency: "gbp" }),
    ];
    const got = pickReusablePayment(intents, { sellerId: "seller1", amountCents: 7000, currency: "EUR", now: NOW });
    assert.equal(got.id, "newer");
});

test("skips payments already used by a listing or too old", () => {
    const intents = [pi("used"), pi("old", { created: secs("2026-09-01T00:00:00Z") })];
    assert.equal(
        pickReusablePayment(intents, { sellerId: "seller1", amountCents: 7000, currency: "EUR", usedIds: new Set(["used"]), now: NOW }),
        null
    );
});

const fakeAuctionModel = (usedIds) => ({
    find: () => ({
        select: () => ({ lean: async () => usedIds.map((id) => ({ extrasPayment: { paymentIntentId: id } })) }),
    }),
});

test("findReusablePrepaidPayment asks Stripe for the customer's payments", async () => {
    let asked;
    const stripe = {
        paymentIntents: {
            list: async (params) => {
                asked = params;
                return { data: [pi("used"), pi("free", { created: secs("2026-11-15T07:20:00Z") })] };
            },
        },
    };
    const got = await findReusablePrepaidPayment({
        stripe,
        AuctionModel: fakeAuctionModel(["used"]),
        customerId: "cus_1",
        sellerId: "seller1",
        amountCents: 7000,
        currency: "EUR",
    });
    assert.equal(asked.customer, "cus_1");
    assert.equal(got.id, "free");
    assert.equal(await findReusablePrepaidPayment({ stripe, AuctionModel: fakeAuctionModel([]), customerId: null, sellerId: "s", amountCents: 7000, currency: "EUR" }), null);
});

test("admin list shows paid payments no listing used", async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
    const stripe = {
        paymentIntents: {
            list: async () => ({
                has_more: false,
                data: [
                    pi("used", { created: hourAgo }),
                    pi("unused", { created: hourAgo, description: "Meta Boost (max)", customer: "cus_1" }),
                    pi("just-now", { created: Math.floor(Date.now() / 1000) }),
                    pi("refunded", { created: hourAgo, latest_charge: { refunded: true, amount_refunded: 7000 } }),
                ],
            }),
        },
    };
    const rows = await listUnusedPrepaidPayments({ stripe, AuctionModel: fakeAuctionModel(["used"]) });
    assert.deepEqual(rows.map((r) => r.paymentIntentId), ["unused"]);
    assert.equal(rows[0].amount, 70);
    assert.equal(rows[0].currency, "EUR");
    assert.equal(rows[0].customerId, "cus_1");
});
