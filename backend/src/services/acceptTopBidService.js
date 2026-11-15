// Seller accepts the highest bid after the reserve wasn't met.
// Rules and the link token live in utils/acceptTopBid.js.

import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { calculateCommission } from "../utils/commissionCalculator.js";
import { acceptTopBidState, verifyAcceptToken } from "../utils/acceptTopBid.js";
import {
  auctionWonAdminEmail,
  sendAuctionEndedSellerEmail,
  sendAuctionWonEmail,
} from "../utils/nodemailer.js";
import { broadcastAuctionChange } from "./realtimeService.js";

const httpError = (status, message) => Object.assign(new Error(message), { status });
const idStr = (v) => (v && typeof v === "object" ? v._id ?? v : v)?.toString?.();

/** Loads the lot behind a link and checks it can still be accepted at the linked price. */
const loadForToken = async (token) => {
  const { auctionId, sellerId, amount } = verifyAcceptToken(token);
  const auction = await Auction.findById(auctionId);
  if (!auction || idStr(auction.seller) !== sellerId) throw httpError(404, "We couldn't find this listing.");

  if (auction.acceptedTopBid?.status === "accepted" && auction.status === "sold") {
    return { auction, alreadyAccepted: true, amount: auction.acceptedTopBid.amount };
  }
  const state = acceptTopBidState(auction);
  if (!state.allowed) throw httpError(409, state.reason);
  if (Math.abs(state.amount - amount) > 0.005) {
    throw httpError(409, "The highest bid on this lot has changed since we emailed you. Please contact RexBid.");
  }

  const bidder = await User.findById(state.bidderId).select("isActive deletedAt");
  if (!bidder || bidder.isActive === false || bidder.deletedAt || idStr(bidder._id) === sellerId) {
    throw httpError(409, "The top bidder's account is no longer active, so this bid can't be accepted. Please contact RexBid.");
  }
  return { auction, state };
};

/** What the confirm page shows. */
export const previewAcceptTopBid = async (token) => {
  const { auction, state, alreadyAccepted, amount } = await loadForToken(token);
  const price = alreadyAccepted ? amount : state.amount;
  const commission = await calculateCommission(price, auction.isFeatured, auction.baseCurrency);
  const photo = (auction.photos || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  return {
    auctionId: auction._id,
    title: auction.title,
    photo: photo?.thumbUrl || photo?.url || null,
    currency: auction.baseCurrency || "EUR",
    amount: price,
    sellerFee: commission.sellerCommissionAmount || 0,
    sellerReceives: Math.round((price - (commission.sellerCommissionAmount || 0)) * 100) / 100,
    bidCount: auction.bidCount || 0,
    endedAt: auction.endDate,
    deadline: state?.deadline || null,
    binLive: auction.postAuctionBin?.status === "live",
    alreadyAccepted: !!alreadyAccepted,
  };
};

/** Sells the lot to the top bidder at their top bid. Binding. */
export const acceptTopBid = async (token) => {
  const { auction, state, alreadyAccepted } = await loadForToken(token);
  if (alreadyAccepted) return { auction, alreadyAccepted: true };

  // Claim the lot so a Last Chance purchase (or a second click) can't sell it at
  // the same moment. If Last Chance is live it is closed in the same step.
  const binStatus = auction.postAuctionBin?.status ?? null;
  const binWasLive = binStatus === "live";
  const filter = {
    _id: auction._id,
    seller: auction.seller,
    status: "reserve_not_met",
    winner: null,
    currentPrice: state.amount,
    currentBidder: auction.currentBidder,
    "acceptedTopBid.status": { $nin: ["processing", "accepted"] },
    "postAuctionBin.status": binStatus,
  };
  const set = { "acceptedTopBid.status": "processing" };
  if (binWasLive) set["postAuctionBin.status"] = "processing";
  const claimed = await Auction.findOneAndUpdate(filter, { $set: set }, { new: true });
  if (!claimed) throw httpError(409, "This lot has just changed (it may have sold on Last Chance). Please refresh the page.");

  const now = new Date();
  try {
    const price = state.amount;
    claimed.winner = claimed.currentBidder;
    claimed.finalPrice = price;
    claimed.status = "sold";

    const commission = await calculateCommission(price, claimed.isFeatured, claimed.baseCurrency);
    claimed.commissionAmount = commission.commissionAmount;
    claimed.sellerCommissionAmount = commission.sellerCommissionAmount;
    claimed.bidderCommissionAmount = commission.bidderCommissionAmount;
    claimed.commissionType = commission.commissionType;
    claimed.commissionValue = commission.commissionValue;
    claimed.featuredPremiumAmount = commission.featuredPremium;

    for (const o of claimed.offers || []) {
      if (o.status === "pending" || o.status === "countered") {
        o.status = "rejected";
        o.sellerResponse = "Offer closed - the seller accepted the highest bid";
      }
    }

    if (binWasLive) {
      claimed.postAuctionBin.status = "cancelled";
      claimed.postAuctionBin.endedAt = now;
      claimed.postAuctionBin.note = "Seller accepted the highest bid";
    }
    claimed.acceptedTopBid = {
      status: "accepted",
      amount: price,
      bidder: claimed.currentBidder,
      acceptedAt: now,
      binWasLive,
    };
    await claimed.save(); // creates the sale record (auction model hooks)
  } catch (error) {
    const undo = { "acceptedTopBid.status": null };
    if (binWasLive) undo["postAuctionBin.status"] = "live";
    await Auction.updateOne({ _id: auction._id, "acceptedTopBid.status": "processing" }, { $set: undo });
    throw error;
  }

  if (binWasLive) {
    try {
      const { default: agendaService } = await import("./agendaService.js");
      await agendaService.cancelBinJobs?.(auction._id);
    } catch { /* the sweep ignores sold lots */ }
  }

  broadcastAuctionChange(auction._id);

  // Same emails as any other sale: buyer "you won" + payment, seller "item sold", admins.
  (async () => {
    const sold = await Auction.findById(auction._id)
      .populate("seller", "email phone username companyName firstName lastName currency userType")
      .populate("winner", "email phone username companyName firstName lastName address currency");
    await sendAuctionWonEmail(sold);
    await sendAuctionEndedSellerEmail(sold);
    const admins = await User.find({ userType: "admin" }).select("email currency");
    for (const admin of admins) await auctionWonAdminEmail(admin.email, admin.currency, sold, sold.winner);
  })().catch((e) => console.error("Accept-top-bid sale emails failed:", e));

  return { auction: claimed, alreadyAccepted: false };
};
