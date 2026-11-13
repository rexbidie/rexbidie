// Last Chance after the auction (Nov 2026).
//
// When a reserve lot ends without meeting its reserve, the seller can offer it
// at a fixed price for 48 hours on the public Last Chance page. Rules:
//   - the price must be at least 10% below the original reserve
//   - the price must be above the highest bid (otherwise the seller should
//     sell to the top bidder instead)
//   - the first buyer to confirm buys it; the normal sale process follows
//
// The seller can set the price in advance while the lot is upcoming or live
// (it then starts automatically if the reserve isn't met), or within
// START_WINDOW_HOURS after the auction ends. Each lot gets one 48-hour window.

export const BIN_DISCOUNT = 0.1;          // at least 10% below reserve
export const BIN_HOURS = 48;              // how long it stays on the page
export const START_WINDOW_HOURS = 72;     // how long after the end the seller can start it

const round2 = (n) => Math.round(n * 100) / 100;

/** Highest price allowed: 10% below the reserve, rounded down to a whole unit. */
export const maxBinPrice = (reservePrice) => Math.floor((Number(reservePrice) || 0) * (1 - BIN_DISCOUNT));

/** Highest bid on the lot (0 when there were no bids). */
export const topBidOf = (auction) => (Number(auction?.bidCount) > 0 || (auction?.bids || []).length > 0)
  ? Number(auction.currentPrice) || 0
  : 0;

/**
 * Checks a proposed Last Chance price (in the lot's own currency).
 * @param {object} auction raw auction
 * @param {number} price
 * @param {{ atEnd?: boolean }} opts atEnd: the auction has finished, so the top bid is final
 * @returns {string|null} a message for the seller, or null if the price is allowed
 */
export const binPriceError = (auction, price, { atEnd = true } = {}) => {
  if (!auction || auction.auctionType !== "reserve" || !(Number(auction.reservePrice) > 0)) {
    return "Last Chance after the auction is only available for lots with a reserve.";
  }
  const p = round2(Number(price));
  if (!Number.isFinite(p) || p <= 0) return "Please enter a price.";

  const max = maxBinPrice(auction.reservePrice);
  if (p > max) {
    return `The Last Chance price must be at least 10% below your reserve, so no more than ${max.toLocaleString("en-IE")}.`;
  }
  const minStart = Number(auction.startPrice) || 0;
  if (p < minStart) return `The Last Chance price can't be below the starting price (${minStart.toLocaleString("en-IE")}).`;

  if (atEnd) {
    const top = topBidOf(auction);
    if (top > 0 && max <= top) {
      return "The top bid is already within 10% of your reserve, so Last Chance isn't available. Contact RexBid if you'd like to sell to the top bidder.";
    }
    if (top > 0 && p <= top) {
      return `The Last Chance price must be higher than the top bid (${top.toLocaleString("en-IE")}).`;
    }
  }
  return null;
};

/** Latest time the seller can start Last Chance after the auction. */
export const startDeadlineFor = (auction) => {
  const byEnd = new Date(new Date(auction?.endDate || 0).getTime() + START_WINDOW_HOURS * 36e5);
  const extra = auction?.postAuctionBin?.startDeadline ? new Date(auction.postAuctionBin.startDeadline) : null;
  return extra && extra > byEnd ? extra : byEnd;
};

/** Can the seller start (or schedule) Last Chance on this lot right now? */
export const binStartState = (auction, now = new Date()) => {
  if (!auction || auction.auctionType !== "reserve") return { allowed: false, mode: null, reason: "Only lots with a reserve can use Last Chance after the auction." };
  const bin = auction.postAuctionBin || {};
  if (["live", "sold", "expired", "cancelled"].includes(bin.status)) {
    return { allowed: false, mode: null, reason: "Last Chance has already been used for this lot." };
  }
  if (["draft", "approved", "active"].includes(auction.status)) {
    return { allowed: true, mode: "schedule" };
  }
  if (auction.status === "reserve_not_met") {
    if (now.getTime() > startDeadlineFor(auction).getTime()) {
      return { allowed: false, mode: null, reason: `Last Chance has to be started within ${START_WINDOW_HOURS} hours of the auction ending. You can relist the lot instead.` };
    }
    return { allowed: true, mode: "start" };
  }
  return { allowed: false, mode: null, reason: "Last Chance isn't available for this lot." };
};

/** Is the lot on Last Chance right now? */
export const binIsLive = (auction, now = new Date()) =>
  auction?.status === "reserve_not_met" &&
  !auction?.winner &&
  auction?.postAuctionBin?.status === "live" &&
  new Date(auction.postAuctionBin.endsAt).getTime() > now.getTime();
