// Buying a reserve lot outright while its auction is live (utils/liveBuyNow.js).

import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { calculateCommission } from "../utils/commissionCalculator.js";
import { CLOSE_CUTOFF_HOURS, liveBuyNowState } from "../utils/liveBuyNow.js";
import {
  auctionWonAdminEmail,
  liveBuyNowBidderEmail,
  sendAuctionEndedSellerEmail,
  sendAuctionWonEmail,
} from "../utils/nodemailer.js";
import { broadcastAuctionChange } from "./realtimeService.js";

const idStr = (v) => (v && typeof v === "object" ? v._id ?? v : v)?.toString?.();
const httpError = (status, message) => Object.assign(new Error(message), { status });

const UNAVAILABLE = {
  none: "Buy It Now isn't offered on this lot.",
  sold: "Sorry, this lot has just been bought.",
  not_live: "Buy It Now is only available while the auction is live.",
  processing: "Sorry, someone else is buying this lot right now.",
  closing_soon: `Buy It Now closes ${CLOSE_CUTOFF_HOURS} hours before the auction ends. You can still bid.`,
  bidding_close_to_reserve: "Bidding is now close to the reserve, so Buy It Now has closed. You can still bid.",
};

/**
 * Buys the lot at its Buy It Now price. Only one purchase can go through, and
 * no bid can be saved while it does (see placeBid / placeBidDirect).
 * @param {string} auctionId
 * @param {object} buyer   the logged-in user
 * @param {number|null} expectedPriceInBase  price the buyer saw, to catch changes
 */
export const buyLive = async (auctionId, buyer, expectedPriceInBase = null) => {
  const now = new Date();
  const lot = await Auction.findById(auctionId);
  if (!lot) throw httpError(404, "Listing not found");
  if (idStr(lot.seller) === idStr(buyer._id)) throw httpError(400, "You can't buy your own lot.");

  const state = liveBuyNowState(lot, now);
  if (!state.available) throw httpError(409, UNAVAILABLE[state.reason] || UNAVAILABLE.not_live);

  const price = state.price;
  if (expectedPriceInBase != null && Math.abs(Number(expectedPriceInBase) - price) > 0.5) {
    throw httpError(409, "The Buy It Now price has changed. Please refresh the page and try again.");
  }

  // Claim the lot only if nothing changed since we checked it.
  const closesAfter = new Date(now.getTime() + CLOSE_CUTOFF_HOURS * 60 * 60 * 1000);
  const claimed = await Auction.findOneAndUpdate(
    {
      _id: lot._id,
      status: "active",
      auctionType: "reserve",
      winner: null,
      currentPrice: lot.currentPrice,
      bidCount: lot.bidCount,
      reservePrice: lot.reservePrice,
      endDate: { $gt: closesAfter },
      "liveBuyNow.price": price,
      "liveBuyNow.status": { $nin: ["processing", "sold"] },
    },
    { $set: { "liveBuyNow.status": "processing" } },
    { new: true }
  );
  if (!claimed) throw httpError(409, "Sorry, this lot has just changed. Please refresh the page.");

  // Bidders to tell afterwards (everyone who bid, except the buyer).
  const bidderIds = [...new Set((claimed.bids || []).map((b) => idStr(b.bidder)).filter(Boolean))]
    .filter((id) => id !== idStr(buyer._id) && id !== idStr(claimed.seller));

  try {
    claimed.bids.push({
      bidder: buyer._id,
      bidderUsername: buyer.username || buyer.companyName || "Buyer",
      amount: price,
      timestamp: now,
      isBuyNow: true,
    });
    claimed.currentPrice = price;
    claimed.currentBidder = buyer._id;
    claimed.winner = buyer._id;
    claimed.finalPrice = price;
    claimed.status = "sold_buy_now";
    claimed.endDate = now;

    const commission = await calculateCommission(price, claimed.isFeatured, claimed.baseCurrency);
    claimed.commissionAmount = commission.commissionAmount;
    claimed.sellerCommissionAmount = commission.sellerCommissionAmount;
    claimed.bidderCommissionAmount = commission.bidderCommissionAmount;
    claimed.commissionType = commission.commissionType;
    claimed.commissionValue = commission.commissionValue;
    claimed.featuredPremiumAmount = commission.featuredPremium;

    for (const p of claimed.proxyBids || []) p.isActive = false;
    for (const o of claimed.offers || []) {
      if (o.status === "pending") {
        o.status = "rejected";
        o.sellerResponse = "Offer closed - item bought on Buy It Now";
      }
    }

    claimed.liveBuyNow.status = "sold";
    claimed.liveBuyNow.soldTo = buyer._id;
    claimed.liveBuyNow.soldAt = now;
    await claimed.save(); // creates the sale record (auction model hooks)
  } catch (error) {
    // Put the lot back so bidding (or another buyer) can carry on.
    await Auction.updateOne(
      { _id: lot._id, "liveBuyNow.status": "processing", status: "active" },
      { $set: { "liveBuyNow.status": null } }
    );
    throw error;
  }

  try {
    const { default: agendaService } = await import("./agendaService.js");
    await agendaService.cancelAuctionJobs(lot._id);
  } catch (err) {
    console.error("Live Buy It Now: could not cancel auction jobs:", err?.message);
  }

  broadcastAuctionChange(lot._id);

  // Same emails as any other sale, plus a note to the other bidders.
  (async () => {
    const sold = await Auction.findById(lot._id)
      .populate("seller", "email phone username companyName firstName lastName currency userType")
      .populate("winner", "email phone username companyName firstName lastName address currency");
    await sendAuctionWonEmail(sold);
    await sendAuctionEndedSellerEmail(sold);
    const admins = await User.find({ userType: "admin" }).select("email currency");
    for (const admin of admins) await auctionWonAdminEmail(admin.email, admin.currency, sold, sold.winner);
    if (bidderIds.length) {
      const bidders = await User.find({ _id: { $in: bidderIds } }).select("email firstName companyName username");
      for (const b of bidders) {
        await liveBuyNowBidderEmail(b.email, b.firstName || b.companyName || b.username, sold)
          .catch((e) => console.error("Live Buy It Now bidder email failed:", e?.message));
      }
    }
  })().catch((e) => console.error("Live Buy It Now sale emails failed:", e));

  return claimed;
};
