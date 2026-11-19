import Auction from "../models/auction.model.js";
import { planBidRetraction } from "../utils/bidRetraction.js";
import { processProxyBids } from "./proxyBidService.js";
import { broadcastAuctionChange } from "./realtimeService.js";

const idOf = (v) => (v && typeof v === "object" ? v._id ?? v.id : v)?.toString?.();

/**
 * Retracts every bid a bidder has placed on a live lot and switches off their
 * proxy bid, then lets the remaining proxy bids compete again.
 * Rules: utils/bidRetraction.js. Keeps a record in auction.retractedBids.
 *
 * @returns {Promise<{ auction: object, removedCount: number, previousPrice: number, previousBidder: string|null }>}
 */
export const retractBids = async ({ auctionId, bidderId, reason = "", admin, maxRetries = 3 }) => {
  for (let attempt = 1; ; attempt++) {
    const auction = await Auction.findById(auctionId).lean();
    if (!auction) throw new Error("Auction not found");

    const now = new Date();
    const plan = planBidRetraction(auction, bidderId, now);

    const removed = plan.removedBids;
    const record = {
      bidder: plan.retractedProxy?.bidder ?? removed[0]?.bidder ?? bidderId,
      bidderUsername: removed[0]?.bidderUsername || plan.retractedProxy?.bidderUsername || "",
      bids: removed.map((b) => ({
        amount: b.amount,
        timestamp: b.timestamp,
        isProxyBid: !!b.isProxyBid,
      })),
      proxyMaxAmount: plan.retractedProxy?.maxAmount ?? null,
      reason: String(reason || "").trim().slice(0, 1000),
      priceBefore: auction.currentPrice,
      priceAfter: plan.currentPrice,
      retractedBy: admin?._id ?? null,
      retractedAt: now,
    };

    // Only write if nothing has changed since the lot was read
    // (a new bid, a proxy change, or Buy It Now going through).
    const updated = await Auction.findOneAndUpdate(
      {
        _id: auction._id,
        status: "active",
        endDate: { $gt: now },
        updatedAt: auction.updatedAt,
        "liveBuyNow.status": { $ne: "processing" },
      },
      {
        $set: {
          bids: plan.keptBids,
          proxyBids: plan.proxyBids,
          currentPrice: plan.currentPrice,
          currentBidder: plan.currentBidder,
          bidCount: plan.bidCount,
          lastBidTime: plan.lastBidTime,
        },
        $push: { retractedBids: record },
      },
      { new: true },
    );

    if (!updated) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }
      throw new Error("The lot changed while retracting (a new bid came in). Please try again.");
    }

    // Remaining proxy bids may now outbid the new leader.
    await processProxyBids(auction._id);
    broadcastAuctionChange(auction._id);

    const final = await Auction.findById(auction._id).lean();
    return {
      auction: final,
      removedCount: removed.length,
      previousPrice: auction.currentPrice,
      previousBidder: idOf(auction.currentBidder) || null,
    };
  }
};
