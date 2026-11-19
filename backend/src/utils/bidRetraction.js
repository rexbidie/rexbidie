// Retracting a bidder's bids on a live lot (admin only).
//
// Section 58(2) of the Sale of Goods Act 1893 lets a bidder withdraw a bid
// until the auction closes. When that happens every bid the bidder placed on
// the lot is taken out, and their proxy (maximum) bid is switched off.
//
// Other bidders' proxy bids that were placed *after* the retracted bidder's
// first bid were only ever raised to compete with that bidder, so they are
// taken out too. Their proxies stay active and the normal proxy cascade
// (services/proxyBidService.js) re-bids them against what is left. That way
// no one is left paying more than they would have without the retracted bids.
//
// Manual bids from other bidders are always kept: each was a real bid that was
// above the asking price when it was placed.

const idOf = (v) => (v && typeof v === "object" ? v._id ?? v.id : v)?.toString?.();
const timeOf = (b) => new Date(b?.timestamp ?? 0).getTime();

/**
 * Works out the state of a lot after a bidder's bids are retracted.
 * Pure: does not touch the database.
 *
 * @param {object} auction  plain auction (bids, proxyBids, startPrice, status, endDate)
 * @param {string} bidderId the bidder whose bids are being retracted
 * @param {Date}   [now]
 * @returns {{
 *   removedBids: object[], droppedProxyBids: object[], keptBids: object[],
 *   proxyBids: object[], retractedProxy: object|null,
 *   currentPrice: number, currentBidder: any, bidCount: number, lastBidTime: Date|null,
 * }}
 * @throws Error with a message fit to show the admin
 */
export const planBidRetraction = (auction, bidderId, now = new Date()) => {
  if (!auction) throw new Error("Auction not found");
  const target = idOf(bidderId);
  if (!target) throw new Error("Choose the bidder whose bids you want to retract.");

  if (auction.status !== "active") {
    throw new Error("Bids can only be retracted while the auction is live.");
  }
  if (auction.endDate && new Date(auction.endDate).getTime() <= now.getTime()) {
    throw new Error("This auction has already closed, so bids can no longer be retracted.");
  }
  if (auction.liveBuyNow?.status === "processing") {
    throw new Error("This lot is being bought on Buy It Now. Please try again in a moment.");
  }

  const bids = [...(auction.bids || [])].sort((a, b) => timeOf(a) - timeOf(b));
  const proxies = auction.proxyBids || [];

  const removedBids = bids.filter((b) => idOf(b.bidder) === target);
  const targetProxy = proxies.find((p) => idOf(p.bidder) === target && p.isActive) || null;

  if (removedBids.length === 0 && !targetProxy) {
    throw new Error("This bidder has no bids on this lot.");
  }

  // Proxies that will bid again by themselves after the retraction.
  const activeOtherProxyIds = new Set(
    proxies.filter((p) => p.isActive && idOf(p.bidder) !== target).map((p) => idOf(p._id)),
  );

  const firstRemovedAt = removedBids.length ? timeOf(removedBids[0]) : Infinity;

  const keptBids = [];
  const droppedProxyBids = [];
  for (const b of bids) {
    if (idOf(b.bidder) === target) continue;
    const reactiveProxyBid =
      b.isProxyBid && timeOf(b) >= firstRemovedAt && activeOtherProxyIds.has(idOf(b.proxyBidId));
    if (reactiveProxyBid) droppedProxyBids.push(b);
    else keptBids.push(b);
  }

  const top = keptBids[keptBids.length - 1] || null;

  // Each proxy's "current bid" is now its highest kept bid.
  const proxyBids = proxies.map((p) => {
    const pid = idOf(p._id);
    const isTarget = idOf(p.bidder) === target;
    const highestKept = keptBids
      .filter((b) => idOf(b.proxyBidId) === pid)
      .reduce((max, b) => Math.max(max, Number(b.amount) || 0), 0);
    return {
      ...p,
      isActive: isTarget ? false : p.isActive,
      currentBid: highestKept,
      updatedAt: isTarget || p.currentBid !== highestKept ? now : p.updatedAt,
    };
  });

  return {
    removedBids,
    droppedProxyBids,
    keptBids,
    proxyBids,
    retractedProxy: targetProxy,
    currentPrice: top ? Number(top.amount) : Number(auction.startPrice) || 0,
    currentBidder: top ? top.bidder : null,
    bidCount: keptBids.length,
    lastBidTime: top ? top.timestamp : null,
  };
};
