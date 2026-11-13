// Buy It Now while a reserve auction is live (Nov 2026).
//
// A seller can add a Buy It Now price to a reserve lot. Anyone allowed to bid
// can buy the lot outright at that price while the auction is live, until:
//   - bidding reaches 90% of the reserve (the auction is doing its job), or
//   - the last 12 hours before the auction closes (when most bidding happens).
// After either point the option is gone for good on that lot.
//
// Rules:
//   - reserve auctions only (not no-reserve auctions)
//   - the price must be at least 15% above the reserve
//   - once there are bids it can't be added or raised (lowering is fine)
//
// Buying ends the auction straight away and the normal sale process follows.
// Separate from Buy It Now after an unsold auction (utils/postAuctionBin.js).

export const MIN_ABOVE_RESERVE = 0.15;  // price at least 15% above the reserve
export const CUTOFF_RESERVE_SHARE = 0.9; // gone once bidding reaches 90% of the reserve
export const CLOSE_CUTOFF_HOURS = 12;    // gone in the last 12 hours

const HOUR = 60 * 60 * 1000;

/** Lowest Buy It Now price allowed for a reserve: 15% above, rounded up to a whole unit. */
export const minLivePrice = (reservePrice) =>
  Math.ceil((Number(reservePrice) || 0) * (1 + MIN_ABOVE_RESERVE) - 1e-9);

/** When the Buy It Now option closes because the auction is nearly over. */
export const liveBuyNowClosesAt = (endDate) =>
  endDate ? new Date(new Date(endDate).getTime() - CLOSE_CUTOFF_HOURS * HOUR) : null;

/** Bid level at which the option closes (90% of the reserve). */
export const cutoffBid = (reservePrice) => (Number(reservePrice) || 0) * CUTOFF_RESERVE_SHARE;

/**
 * Error message for a proposed price, or null when it's fine.
 * `previous` is the price already on the lot; `bidCount` its bids so far.
 */
export const livePriceError = ({ auctionType, reservePrice, price, previous = null, bidCount = 0 }) => {
  if (price == null || price === "" || Number(price) === 0) return null; // no Buy It Now
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return "Enter a valid Buy It Now price.";
  if (auctionType !== "reserve") return "Buy It Now during the auction is only available on reserve auctions.";
  const reserve = Number(reservePrice) || 0;
  if (reserve <= 0) return "Set a reserve price before adding a Buy It Now price.";
  const min = minLivePrice(reserve);
  if (p < min) return `The Buy It Now price must be at least 15% above the reserve (${min} or more).`;
  if (Number(bidCount) > 0) {
    const prev = Number(previous) || 0;
    if (!prev) return "A Buy It Now price can't be added once bidding has started.";
    if (p > prev) return "The Buy It Now price can't be raised once bidding has started.";
  }
  return null;
};

/**
 * Whether the lot can be bought right now, and if not, why.
 * Works on a document or a plain object (prices in the lot's own currency).
 */
export const liveBuyNowState = (auction, now = new Date()) => {
  const price = Number(auction?.liveBuyNow?.price) || 0;
  if (!price || auction?.auctionType !== "reserve") return { offered: false, available: false, reason: "none" };
  const closesAt = liveBuyNowClosesAt(auction.endDate);
  const base = { offered: true, price, closesAt };
  if (auction.liveBuyNow?.status === "sold" || auction.status === "sold_buy_now") return { ...base, available: false, reason: "sold" };
  if (auction.status !== "active" || auction.winner) return { ...base, available: false, reason: "not_live" };
  if (auction.liveBuyNow?.status === "processing") return { ...base, available: false, reason: "processing" };
  if (!closesAt || now >= closesAt) return { ...base, available: false, reason: "closing_soon" };
  const hasBids = Number(auction.bidCount) > 0;
  if (hasBids && Number(auction.currentPrice) >= cutoffBid(auction.reservePrice)) {
    return { ...base, available: false, reason: "bidding_close_to_reserve" };
  }
  return { ...base, available: true, reason: null };
};
