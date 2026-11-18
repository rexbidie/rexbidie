// Admin → Stripe Money: what can safely go to the bank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise } from "../src/services/stripeMoneyService.js";

const NOW = new Date("2026-11-18T12:00:00Z");
const unix = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const sale = (id, o) => ({ _id: id, reference: id, title: id, status: "paid", currency: "EUR", vat: { amount: 0 }, buyerFee: 0, ...o });

const balance = { available: [{ currency: "eur", amount: 100000 }], pending: [{ currency: "eur", amount: 48000 }] };
const balanceTxns = [
    { id: "txn_a", amount: 33000, net: 32000, fee: 1000, currency: "eur", status: "available", available_on: unix("2026-11-15T00:00:00Z") },
    { id: "txn_b", amount: 49000, net: 48000, fee: 1000, currency: "eur", status: "pending", available_on: unix("2026-11-20T00:00:00Z") },
    { id: "txn_d", amount: 11800, net: 11400, fee: 400, currency: "eur", status: "available", available_on: unix("2026-11-14T00:00:00Z") },
];
const charges = [
    { status: "succeeded", payment_intent: "pi_a", balance_transaction: "txn_a" },
    { status: "succeeded", payment_intent: "pi_b", balance_transaction: "txn_b" },
    { status: "succeeded", payment_intent: "pi_d", balance_transaction: "txn_d" },
];
const sales = [
    sale("A", { itemPrice: 320, sellerFee: 20, total: 330, buyerFee: 10, payment: { transactionId: "pi_a" } }),     // cleared: hold 300
    sale("B", { itemPrice: 420, sellerFee: 20, total: 490, buyerFee: 70, stripe: { paymentIntentId: "pi_b" } }),   // clears 20 Nov: 400
    sale("C", { itemPrice: 900, sellerFee: 50, total: 950, payment: { transactionId: "BOI-123", method: "bank_transfer" } }), // outside Stripe
    sale("D", { currency: "GBP", itemPrice: 85, sellerFee: 5, total: 100, buyerFee: 15, payment: { transactionId: "pi_d" } }), // £80 at 1.18
];

test("safe to send = available − cleared sellers' money − €100 buffer", () => {
    const s = summarise({ balance, balanceTxns, charges, sales, now: NOW, rates: null });
    assert.equal(s.available, 1000);
    assert.equal(s.heldForSellers, 394.4); // 300 + £80 × 1.18
    assert.equal(s.heldLater, 400);
    assert.equal(s.safeToSend, 505.6);
    const c = s.sales.find((r) => r.id === "C");
    assert.equal(c.viaStripe, false);
    assert.equal(c.holdEur, 0);
});

test("coming available splits what clears into sellers' money and RexBid's", () => {
    const s = summarise({ balance, balanceTxns, charges, sales, now: NOW, rates: null });
    assert.deepEqual(s.upcoming, [{ date: "2026-11-20", clears: 480, forSellers: 400, forRexBid: 80 }]);
    assert.equal(s.sales.find((r) => r.id === "B").cleared, false);
});

test("never below zero; an old Stripe payment counts as cleared", () => {
    const s = summarise({
        balance: { available: [{ currency: "eur", amount: 20000 }], pending: [] },
        balanceTxns: [], charges: [], now: NOW, rates: null,
        sales: [sale("E", { itemPrice: 500, sellerFee: 0, total: 500, payment: { transactionId: "pi_old" } })],
    });
    assert.equal(s.heldForSellers, 500);
    assert.equal(s.safeToSend, 0);
});
