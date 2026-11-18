// Run with: npm test   (node --test test/*.test.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAuctionForViewer } from "../src/utils/publicAuction.js";

const SELLER = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BIDDER = "bbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER = "cccccccccccccccccccccccc";
const WINNER = "dddddddddddddddddddddddd";

const sample = () => ({
  _id: "x1",
  title: "Test tractor",
  startPrice: 1000,
  currentPrice: 1500,
  reservePrice: 2000,
  convertedReservePrice: 2000,
  seller: { _id: SELLER, username: "dealer", companyName: "Dealer Ltd", email: "s@example.com", phone: "+353000" },
  winner: { _id: WINNER, username: "win", email: "w@example.com", phone: "+353111" },
  currentBidder: { _id: OTHER, username: "other" },
  bids: [{ bidder: { _id: OTHER, username: "other", email: "o@example.com" }, amount: 1500 }],
  proxyBids: [
    { bidder: OTHER, bidderUsername: "other", maxAmount: 5000, isActive: true },
    { bidder: BIDDER, bidderUsername: "me", maxAmount: 3000, isActive: true },
  ],
  offers: [
    { buyer: OTHER, amount: 1800, status: "pending" },
    { buyer: BIDDER, amount: 1700, status: "rejected" },
  ],
  participants: [{ user: OTHER, email: "p@example.com", phoneNumber: "+353222" }],
  transactionId: "pi_123",
  paymentMethod: "card",
  commissionAmount: 45,
  featuredPremiumAmount: 30,
});

const secretsGone = (out) => {
  const json = JSON.stringify(out);
  for (const s of ["s@example.com", "+353000", "w@example.com", "+353111", "o@example.com", "p@example.com", "+353222", "5000", "pi_123"]) {
    assert.ok(!json.includes(s), `leaked ${s}`);
  }
  assert.equal(out.reservePrice, undefined);
  assert.equal(out.convertedReservePrice, undefined);
  assert.equal(out.featuredPremiumAmount, undefined);
};

test("anonymous visitor sees no private data", () => {
  const out = sanitizeAuctionForViewer(sample(), null);
  secretsGone(out);
  assert.deepEqual(out.proxyBids, []);
  assert.deepEqual(out.offers, []);
  assert.deepEqual(out.participants, []);
  assert.equal(out.commissionAmount, undefined);
  assert.equal(out.hasReserve, true);
  assert.equal(out.reserveMet, false);
  assert.equal(out.reserveProgress, undefined); // buyers get a badge, never a percentage
  assert.equal(out.reserveStatus, "not_met");
  assert.equal(out.offerCount, 2);
  assert.equal(out.pendingOfferCount, 1);
  assert.equal(out.participantCount, 1);
  assert.equal(out.seller.companyName, "Dealer Ltd");
});

test("logged-in bidder sees only their own proxy bid and offers", () => {
  const out = sanitizeAuctionForViewer(sample(), { _id: BIDDER, userType: "bidder" });
  secretsGone(out);
  assert.equal(out.proxyBids.length, 1);
  assert.equal(out.proxyBids[0].maxAmount, 3000);
  assert.equal(out.offers.length, 1);
  assert.equal(out.offers[0].amount, 1700);
});

test("seller and admin get the full record", () => {
  for (const viewer of [{ _id: SELLER, userType: "seller" }, { _id: OTHER, userType: "admin" }]) {
    const out = sanitizeAuctionForViewer(sample(), viewer);
    assert.equal(out.reservePrice, 2000);
    assert.equal(out.proxyBids.length, 2);
    assert.equal(out.offers.length, 2);
    assert.equal(out.reserveMet, false);
  }
});

test("winner keeps payment fields but not other secrets", () => {
  const out = sanitizeAuctionForViewer(sample(), { _id: WINNER, userType: "bidder" });
  assert.equal(out.transactionId, "pi_123");
  assert.equal(out.commissionAmount, 45);
  assert.equal(out.reservePrice, undefined);
  assert.ok(!JSON.stringify(out.proxyBids).includes("5000"));
  assert.equal(out.seller.email, undefined);
});

test("no reserve and reserve met", () => {
  const noRes = sanitizeAuctionForViewer({ ...sample(), reservePrice: 0 }, null);
  assert.equal(noRes.hasReserve, false);
  assert.equal(noRes.reserveMet, true);
  const met = sanitizeAuctionForViewer({ ...sample(), currentPrice: 2500 }, null);
  assert.equal(met.reserveMet, true);
  assert.equal(met.reserveStatus, "met");
  assert.equal(noRes.reserveStatus, null);
});

test("reserve badge: close to reserve only within 10% in the last 3 hours; sellers still get the figure", () => {
  const hours = (h) => new Date(Date.now() + h * 3600 * 1000);
  // sample: bid 1500 of reserve 2000 (75%)
  const at = (price, h, viewer = null) => sanitizeAuctionForViewer({ ...sample(), currentPrice: price, bidCount: 3, endDate: hours(h) }, viewer);
  assert.equal(at(1850, 2).reserveStatus, "close");
  assert.equal(at(1850, 5).reserveStatus, "not_met");
  assert.equal(at(1500, 2).reserveStatus, "not_met");
  assert.equal(at(2000, 30).reserveStatus, "met");
  assert.equal(at(1850, 5, { _id: SELLER, userType: "seller" }).reserveProgress, 90);
});
