// Last Chance after the auction – pricing rules and public data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { binIsLive, binPriceError, binStartState, maxBinPrice, topBidOf } from "../src/utils/postAuctionBin.js";
import { sanitizeAuctionForViewer } from "../src/utils/publicAuction.js";

const lot = (over = {}) => ({
  auctionType: "reserve",
  reservePrice: 20000,
  startPrice: 1000,
  currentPrice: 15000,
  bidCount: 6,
  status: "reserve_not_met",
  endDate: new Date(),
  ...over,
});

test("max price is 10% below the reserve", () => {
  assert.equal(maxBinPrice(20000), 18000);
  assert.equal(maxBinPrice(12345), 11110);
});

test("price must be 10% below reserve and above the top bid", () => {
  assert.equal(binPriceError(lot(), 18000), null);
  assert.equal(binPriceError(lot(), 16500), null);
  assert.match(binPriceError(lot(), 18001), /at least 10% below/);
  assert.match(binPriceError(lot(), 15000), /higher than the top bid/);
  assert.match(binPriceError(lot(), 500), /starting price|top bid/);
});

test("blocked when the top bid is already within 10% of the reserve", () => {
  assert.match(binPriceError(lot({ currentPrice: 18500 }), 18000), /already within 10%/);
});

test("no bids: price only has to beat the starting price", () => {
  const l = lot({ bidCount: 0, currentPrice: 1000 });
  assert.equal(topBidOf(l), 0);
  assert.equal(binPriceError(l, 1000), null);
  assert.match(binPriceError(l, 900), /starting price/);
});

test("set in advance: top bid isn't checked until the end", () => {
  assert.equal(binPriceError(lot({ status: "active", currentPrice: 17000 }), 16000, { atEnd: false }), null);
});

test("only reserve lots", () => {
  assert.match(binPriceError(lot({ auctionType: "standard", reservePrice: 0 }), 100), /only available for lots with a reserve/);
});

test("start window and one use per lot", () => {
  assert.equal(binStartState(lot({ status: "active" })).mode, "schedule");
  assert.equal(binStartState(lot()).mode, "start");
  const old = lot({ endDate: new Date(Date.now() - 73 * 36e5) });
  assert.equal(binStartState(old).allowed, false);
  assert.equal(binStartState(lot({ postAuctionBin: { status: "expired" } })).allowed, false);
  assert.equal(binStartState(lot({ status: "sold" })).allowed, false);
});

test("live check", () => {
  const future = new Date(Date.now() + 36e5);
  assert.equal(binIsLive(lot({ postAuctionBin: { status: "live", endsAt: future } })), true);
  assert.equal(binIsLive(lot({ postAuctionBin: { status: "live", endsAt: new Date(Date.now() - 1000) } })), false);
  assert.equal(binIsLive(lot({ winner: "x", postAuctionBin: { status: "live", endsAt: future } })), false);
});

test("public data: scheduled price and buyer are hidden", () => {
  const scheduled = sanitizeAuctionForViewer(lot({ status: "active", postAuctionBin: { status: "scheduled", price: 17000 } }), null);
  assert.equal(scheduled.postAuctionBin, undefined);
  const live = sanitizeAuctionForViewer(lot({ postAuctionBin: { status: "live", price: 17000, endsAt: new Date(), soldTo: "u1", note: "x" } }), null);
  assert.equal(live.postAuctionBin.price, 17000);
  assert.equal(live.postAuctionBin.soldTo, undefined);
  assert.equal(live.postAuctionBin.note, undefined);
});

test("an admin invitation gives the seller a fresh 72 hours", async () => {
  const { startDeadlineFor } = await import("../src/utils/postAuctionBin.js");
  const ended = lot({ endDate: new Date(Date.now() - 80 * 36e5) });
  assert.equal(binStartState(ended).allowed, false);
  const invited = lot({ endDate: ended.endDate, postAuctionBin: { startDeadline: new Date(Date.now() + 70 * 36e5) } });
  assert.equal(binStartState(invited).allowed, true);
  assert.ok(startDeadlineFor(invited) > new Date());
});

test("seller invite email lists each lot and links to Last Chance", async () => {
  const { renderBinInviteEmail } = await import("../src/utils/nodemailer.js");
  const { subject, html } = renderBinInviteEmail(
    { firstName: "Pat", userType: "seller" },
    [{ _id: "a1", title: "MF 5613 <tractor>", currency: "EUR", topBid: 15000, maxPrice: 18000 }],
    { deadline: new Date("2026-11-14T18:00:00Z") }
  );
  assert.match(subject, /Last Chance/);
  assert.match(html, /\/last-chance/);
  assert.match(html, /\/seller\/auctions\/all/);
  assert.match(html, /MF 5613 &lt;tractor&gt;/);
  assert.match(html, /€18,000/);
});
