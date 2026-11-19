import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveRaiseFor } from "../src/services/proxyBidService.js";

const lot = (over = {}) => ({
    auctionType: "reserve", reservePrice: 5000, currentPrice: 1000, currentBidder: "a",
    proxyBids: [{ bidder: "a", bidderUsername: "a", maxAmount: 10000, isActive: true }],
    ...over,
});

test("leading proxy whose max covers the reserve is lifted to the reserve", () => {
    assert.equal(reserveRaiseFor(lot()).amount, 5000);
});

test("max exactly at the reserve still lifts", () => {
    assert.equal(reserveRaiseFor(lot({ proxyBids: [{ bidder: "a", maxAmount: 5000, isActive: true }] })).amount, 5000);
});

test("no raise when the max is below the reserve", () => {
    assert.equal(reserveRaiseFor(lot({ proxyBids: [{ bidder: "a", maxAmount: 4999, isActive: true }] })), null);
});

test("no raise when the reserve is already met, there is no reserve, or it's not a reserve auction", () => {
    assert.equal(reserveRaiseFor(lot({ currentPrice: 5000 })), null);
    assert.equal(reserveRaiseFor(lot({ reservePrice: 0 })), null);
    assert.equal(reserveRaiseFor(lot({ auctionType: "standard" })), null);
});

test("only the leader's own, active proxy counts", () => {
    assert.equal(reserveRaiseFor(lot({ currentBidder: "b" })), null, "leader has no proxy");
    assert.equal(reserveRaiseFor(lot({ proxyBids: [{ bidder: "a", maxAmount: 10000, isActive: false }] })), null);
    assert.equal(reserveRaiseFor(lot({ currentBidder: null })), null);
});
