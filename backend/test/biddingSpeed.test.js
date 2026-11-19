// Sale-night bidding: remembered card checks and the once-a-night Buyer Terms agreement.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_CHECK_TTL_MS,
  forgetPaymentVerified,
  paymentRecentlyVerified,
  rememberPaymentVerified,
} from "../src/utils/paymentCheckCache.js";
import { buyerTermsCurrent, buyerTermsUpdate } from "../src/utils/buyerTerms.js";

const bidder = (over = {}) => ({ _id: "u1", paymentMethodId: "pm_1", stripeCustomerId: "cus_1", ...over });

afterEach(() => {
  delete process.env.BUYER_TERMS_EVERY_NIGHT;
});

test("card check is remembered for 10 minutes, then checked again", () => {
  const now = 1_000_000;
  const u = bidder();
  assert.equal(paymentRecentlyVerified(u, now), false);
  rememberPaymentVerified(u, now);
  assert.equal(paymentRecentlyVerified(u, now + PAYMENT_CHECK_TTL_MS - 1), true);
  assert.equal(paymentRecentlyVerified(u, now + PAYMENT_CHECK_TTL_MS + 1), false);
});

test("a new card or Stripe customer is checked again", () => {
  const now = 2_000_000;
  rememberPaymentVerified(bidder(), now);
  assert.equal(paymentRecentlyVerified(bidder({ paymentMethodId: "pm_2" }), now), false);
  assert.equal(paymentRecentlyVerified(bidder({ stripeCustomerId: "cus_2" }), now), false);
  forgetPaymentVerified(bidder());
  assert.equal(paymentRecentlyVerified(bidder(), now), false);
});

test("users without a card are never remembered", () => {
  rememberPaymentVerified({ _id: "u2" });
  assert.equal(paymentRecentlyVerified({ _id: "u2" }), false);
});

test("Buyer Terms: asked every 30 minutes, but never in the lot's last 10 minutes", () => {
  const agreed = new Date("2026-11-19T20:30:00Z");
  const u = { buyerTerms: { acceptedAt: agreed } };
  const at = (min) => new Date(agreed.getTime() + min * 60000);
  assert.equal(buyerTermsCurrent(u, at(29)), true);
  assert.equal(buyerTermsCurrent(u, at(31)), false);
  // 31 minutes on, but the lot closes in 8 minutes: don't ask.
  assert.equal(buyerTermsCurrent(u, at(31), { lotEndsAt: at(39) }), true);
  // Lot closes in 12 minutes: ask.
  assert.equal(buyerTermsCurrent(u, at(31), { lotEndsAt: at(43) }), false);
  // Never agreed at all: always ask, even near the end.
  assert.equal(buyerTermsCurrent({}, at(1), { lotEndsAt: at(5) }), false);
});

test("Buyer Terms: once per account when BUYER_TERMS_EVERY_NIGHT=false", () => {
  process.env.BUYER_TERMS_EVERY_NIGHT = "false";
  const u = { buyerTerms: { acceptedAt: new Date("2026-01-01T10:00:00Z") } };
  assert.equal(buyerTermsCurrent(u, new Date("2026-11-17T19:00:00Z")), true);
});

test("Buyer Terms: agreement is recorded with time, lot and browser", () => {
  const now = new Date("2026-11-17T19:00:00Z");
  const upd = buyerTermsUpdate({ now, auctionId: "a1", ip: "1.2.3.4", userAgent: "x".repeat(500) });
  assert.equal(upd.$set["buyerTerms.acceptedAt"], now);
  const entry = upd.$push["buyerTerms.history"].$each[0];
  assert.equal(entry.auction, "a1");
  assert.equal(entry.ip, "1.2.3.4");
  assert.equal(entry.userAgent.length, 300);
  assert.equal(upd.$push["buyerTerms.history"].$slice, -200);
});
