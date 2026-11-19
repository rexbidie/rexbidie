// Stripe Money: RexBid's commission payment by payment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLedger } from "../src/services/commissionLedgerService.js";

const NOW = new Date("2026-11-19T12:00:00Z");
const unix = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const CLEARED = unix("2026-11-18T00:00:00Z");
const LATER = unix("2026-11-23T00:00:00Z");

const ch = (id, amount, txn, o = {}) => ({ id, status: "succeeded", paid: true, amount, amount_refunded: 0, created: unix("2026-11-15T20:00:00Z"), balance_transaction: txn, metadata: {}, ...o });
const bt = (id, amount, fee, available_on) => ({ id, amount, fee, net: amount - fee, available_on });

const charges = [
    ch("ch_sale", 63600, "t1", { payment_intent: "pi_sale" }),                                    // card checkout
    ch("ch_feat", 3000, "t2", { metadata: { type: "listing_extras_prepaid" } }),                   // Featured fee
    ch("ch_odd", 10000, "t3", { description: "Something else" }),                                  // can't match
    ch("ch_ref", 245100, "t4", { payment_intent: "pi_ref", amount_refunded: 245100 }),             // refunded sale
    ch("ch_gbp", 10000, "t5", { metadata: { auctionId: "AUC_GBP" } }),                             // £ card payment, matched by auction
];
const balanceTxns = [bt("t1", 63600, 1000, CLEARED), bt("t2", 3000, 70, LATER), bt("t3", 10000, 150, CLEARED), bt("t4", 245100, 50, CLEARED), bt("t5", 11800, 200, CLEARED)];
const sales = [
    { _id: "S1", reference: "WOO-1", title: "Woods", status: "paid", currency: "EUR", itemPrice: 600, vat: { amount: 0 }, sellerFee: 30, total: 636, payment: { transactionId: "pi_sale" } },
    { _id: "S2", reference: "200-1", title: "Refunded", status: "failed", currency: "EUR", itemPrice: 2300, vat: { amount: 0 }, sellerFee: 100, total: 2451, stripe: { paymentIntentId: "pi_ref" } },
    { _id: "S3", reference: "GBP-1", title: "Quad", status: "payout_due", currency: "GBP", itemPrice: 85, vat: { amount: 0 }, sellerFee: 5, total: 100, auction: "AUC_GBP" },
];

test("each payment is split into the seller's and RexBid's share", () => {
    const l = buildLedger({ charges, balanceTxns, sales, transfers: [], now: NOW });
    const row = (id) => l.rows.find((r) => r.chargeId === id);
    assert.equal(row("ch_sale").connectFee, 4.34); // (570 × 0.25% + €0.10 + €2) + 23% VAT
    assert.deepEqual([row("ch_sale").sellerShare, row("ch_sale").rexbidShare, row("ch_sale").toSend], [570, 51.66, 51.66]); // 636 − 10 − 570 − 4.34
    assert.deepEqual([row("ch_feat").kind, row("ch_feat").rexbidShare, row("ch_feat").cleared], ["fee", 29.3, false]);
    assert.deepEqual([row("ch_odd").kind, row("ch_odd").rexbidShare, row("ch_odd").toSend], ["check", null, 0]);
    assert.equal(row("ch_ref").toSend, 0); // refunded, failed sale: nothing to send
    assert.equal(row("ch_gbp").sellerShare, 94.4); // £80 at the rate Stripe used (1.18)
    assert.equal(row("ch_gbp").rexbidShare, 18.73); // 118 − 2 − 94.4 − 2.87 Connect fees
    assert.equal(l.readyNow, 70.39); // cleared: 51.66 + 18.73
    assert.deepEqual(l.days.map((d) => [d.date, d.toSend]), [["2026-11-18", 70.39], ["2026-11-23", 29.3]]);
    assert.equal(l.toCheck, 1);
});

test("what's been sent is taken off, and marked payments are set aside", () => {
    const transfers = [
        { kind: "payout", items: [{ chargeId: "ch_sale", amount: 20 }] },
        { kind: "marked", items: [{ chargeId: "ch_gbp", amount: 18.73 }, { chargeId: "ch_odd", amount: 0 }] },
    ];
    const l = buildLedger({ charges, balanceTxns, sales, transfers, now: NOW });
    const row = (id) => l.rows.find((r) => r.chargeId === id);
    assert.equal(row("ch_sale").toSend, 31.66);
    assert.equal(row("ch_gbp").toSend, 0);
    assert.equal(row("ch_gbp").settled, true);
    assert.equal(l.toCheck, 0);
    assert.equal(l.readyNow, 31.66);
});

test("over €15,000: no Connect fees, and the seller's share goes to BOI too (they're paid from BOI)", () => {
    const big = [ch("ch_big", 1600000, "tb", { payment_intent: "pi_big" })];
    const bts = [bt("tb", 1600000, 2000, CLEARED)];
    const s = [{ _id: "SB", reference: "BIG-1", title: "Tractor", status: "paid", currency: "EUR", itemPrice: 15500, vat: { amount: 0 }, sellerFee: 300, total: 16000, payment: { transactionId: "pi_big" } }];
    const l = buildLedger({ charges: big, balanceTxns: bts, sales: s, transfers: [], now: NOW });
    const r = l.rows[0];
    assert.deepEqual([r.sellerViaBank, r.connectFee, r.sellerShare, r.rexbidShare, r.sellerToBank, r.toSend], [true, 0, 15200, 780, 15200, 15980]);
    assert.equal(l.readyForSellersViaBank, 15200);
    // Already paid through Stripe Connect: fees apply, seller's share stays in Stripe.
    const viaConnect = buildLedger({ charges: big, balanceTxns: bts, sales: [{ ...s[0], payout: { method: "stripe_connect" } }], transfers: [], now: NOW }).rows[0];
    assert.equal(viaConnect.sellerViaBank, false);
    assert.equal(viaConnect.toSend, viaConnect.rexbidShare);
});
