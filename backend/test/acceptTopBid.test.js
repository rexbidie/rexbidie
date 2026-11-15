// Accept the highest bid after the reserve isn't met – rules and link tokens.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT_HOURS,
  acceptTopBidState,
  bindingBidsFrom,
  signAcceptToken,
  topBidDetails,
  verifyAcceptToken,
} from "../src/utils/acceptTopBid.js";

const SELLER = "64b000000000000000000001";
const TOP = "64b000000000000000000002";
const OTHER = "64b000000000000000000003";
const hoursAgo = (h) => new Date(Date.now() - h * 36e5);

const lot = (over = {}) => ({
  _id: "64b0000000000000000000aa",
  seller: SELLER,
  auctionType: "reserve",
  reservePrice: 7400,
  startPrice: 3500,
  currentPrice: 4150,
  currentBidder: TOP,
  bidCount: 3,
  status: "reserve_not_met",
  winner: null,
  endDate: hoursAgo(1),
  bids: [
    { bidder: TOP, amount: 3500, timestamp: hoursAgo(3) },
    { bidder: OTHER, amount: 4000, timestamp: hoursAgo(2) },
    { bidder: TOP, amount: 4150, timestamp: hoursAgo(1.5) },
  ],
  ...over,
});

beforeEach(() => {
  process.env.ACCESS_TOKEN_SECRET = "test-secret";
  process.env.ACCEPT_TOP_BID_BIDS_FROM = hoursAgo(48).toISOString();
  delete process.env.ACCEPT_TOP_BID;
});

test("off until the binding-bids date is set, and with ACCEPT_TOP_BID=off", () => {
  delete process.env.ACCEPT_TOP_BID_BIDS_FROM;
  assert.equal(bindingBidsFrom(), null);
  assert.equal(acceptTopBidState(lot()).allowed, false);

  process.env.ACCEPT_TOP_BID_BIDS_FROM = "2026-11-01";
  process.env.ACCEPT_TOP_BID = "off";
  assert.equal(acceptTopBidState(lot()).allowed, false);
});

test("allowed at the top bid within the window", () => {
  const state = acceptTopBidState(lot());
  assert.equal(state.allowed, true);
  assert.equal(state.amount, 4150);
  assert.equal(state.bidderId, TOP);
});

test("top bid is the final visible price, not an earlier bid", () => {
  const d = topBidDetails(lot());
  assert.equal(d.amount, 4150);
  assert.equal(d.bidderId, TOP);
});

test(`closed ${ACCEPT_HOURS} hours after the end`, () => {
  assert.match(acceptTopBidState(lot({ endDate: hoursAgo(ACCEPT_HOURS + 0.1) })).reason, /within 24 hours/);
  assert.equal(acceptTopBidState(lot({ endDate: hoursAgo(ACCEPT_HOURS - 0.1) })).allowed, true);
});

test("bids placed before the terms changed can't be accepted", () => {
  process.env.ACCEPT_TOP_BID_BIDS_FROM = hoursAgo(1).toISOString();
  assert.match(acceptTopBidState(lot()).reason, /before top bids became binding/);
});

test("only unsold reserve lots with bids", () => {
  assert.equal(acceptTopBidState(lot({ status: "sold", winner: TOP })).allowed, false);
  assert.equal(acceptTopBidState(lot({ status: "active" })).allowed, false);
  assert.equal(acceptTopBidState(lot({ auctionType: "standard" })).allowed, false);
  assert.equal(acceptTopBidState(lot({ bids: [], bidCount: 0, currentBidder: null })).allowed, false);
});

test("not while a Last Chance purchase is going through", () => {
  assert.equal(acceptTopBidState(lot({ postAuctionBin: { status: "processing" } })).allowed, false);
  assert.equal(acceptTopBidState(lot({ postAuctionBin: { status: "live" } })).allowed, true);
});

test("link token round-trips and carries the price", () => {
  const token = signAcceptToken(lot());
  const data = verifyAcceptToken(token);
  assert.deepEqual(data, { auctionId: "64b0000000000000000000aa", sellerId: SELLER, amount: 4150 });
});

test("tampered or wrong-secret tokens are refused", () => {
  const token = signAcceptToken(lot());
  assert.throws(() => verifyAcceptToken(token.slice(0, -2) + "xx"), /isn't valid/);
  process.env.ACCESS_TOKEN_SECRET = "other";
  assert.throws(() => verifyAcceptToken(token), /isn't valid/);
});

test("no token once the window has passed", () => {
  assert.equal(signAcceptToken(lot({ endDate: hoursAgo(ACCEPT_HOURS + 1) })), null);
});
