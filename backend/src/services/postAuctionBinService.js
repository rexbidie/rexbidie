// Last Chance after the auction: starting, buying, ending and notifications.
// Rules live in utils/postAuctionBin.js.

import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import Watchlist from "../models/watchlist.model.js";
import Comment from "../models/comment.model.js";
import Sale from "../models/sale.model.js";
import { calculateCommission } from "../utils/commissionCalculator.js";
import { BIN_HOURS, binIsLive, binPriceError, topBidOf } from "../utils/postAuctionBin.js";
import {
  auctionWonAdminEmail,
  postAuctionBinBuyerEmail,
  postAuctionBinSellerEmail,
  sendAuctionEndedSellerEmail,
  sendAuctionWonEmail,
} from "../utils/nodemailer.js";
import { broadcastAuctionChange } from "./realtimeService.js";

const SELLER_FIELDS = "email firstName companyName username userType currency";
const idStr = (v) => (v && typeof v === "object" ? v._id ?? v : v)?.toString?.();

const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Everyone to tell when a lot goes on Last Chance (deduplicated, seller excluded). */
const audienceFor = async (auction) => {
  const sellerId = idStr(auction.seller);
  const topBidderId = topBidOf(auction) > 0 ? idStr(auction.currentBidder) : null;

  const bidderIds = (auction.bids || []).map((b) => idStr(b.bidder)).filter(Boolean);
  const watcherIds = (await Watchlist.find({ auction: auction._id }).distinct("user")).map(String);
  const askerIds = (await Comment.find({ auction: auction._id, parentComment: null, status: "active" }).distinct("user")).map(String);

  const ids = [...new Set([...bidderIds, ...watcherIds, ...askerIds])].filter((id) => id !== sellerId);
  const users = await User.find({ _id: { $in: ids }, isActive: { $ne: false } }).select("email firstName").lean();
  // Top bidder first.
  users.sort((a, b) => (String(b._id) === topBidderId) - (String(a._id) === topBidderId));
  return { users, topBidderId };
};

const notifyLive = async (auction) => {
  const bin = auction.postAuctionBin;
  const currency = auction.baseCurrency || "EUR";
  const seller = await User.findById(auction.seller).select(SELLER_FIELDS).lean();
  if (seller) {
    postAuctionBinSellerEmail(seller, auction, "live", { price: bin.price, currency, endsAt: bin.endsAt }).catch((e) =>
      console.error("BIN seller email failed:", e)
    );
  }
  const { users, topBidderId } = await audienceFor(auction);
  for (const u of users) {
    await postAuctionBinBuyerEmail(u, auction, {
      price: bin.price,
      currency,
      endsAt: bin.endsAt,
      isTopBidder: String(u._id) === topBidderId,
    }).catch((e) => console.error("BIN buyer email failed:", e));
  }
  return users.length;
};

/**
 * Puts a reserve-not-met lot on Last Chance for BIN_HOURS.
 * @param {import("mongoose").Document} auction
 */
export const startBin = async (auction, price, { startedBy = "seller" } = {}) => {
  const error = binPriceError(auction, price, { atEnd: true });
  if (error) throw httpError(400, error);
  if (auction.status !== "reserve_not_met" || auction.winner) throw httpError(400, "This lot can't go on Last Chance.");

  const now = new Date();
  auction.postAuctionBin = {
    price: Math.round(Number(price) * 100) / 100,
    status: "live",
    startedAt: now,
    endsAt: new Date(now.getTime() + BIN_HOURS * 36e5),
    topBidAtStart: topBidOf(auction),
    note: startedBy === "auto" ? "Started automatically when the reserve wasn't met" : undefined,
  };
  await auction.save();

  try {
    const { default: agendaService } = await import("./agendaService.js");
    await agendaService.scheduleBinEnd?.(auction._id, auction.postAuctionBin.endsAt);
  } catch (e) {
    console.error("Could not schedule Last Chance end (the 15-minute sweep will catch it):", e.message);
  }

  broadcastAuctionChange(auction._id);
  notifyLive(auction).catch((e) => console.error("BIN notifications failed:", e));
  return auction;
};

/**
 * Called when an auction ends with the reserve not met.
 * Returns true when Last Chance started automatically (a price was set in advance).
 */
export const handleReserveNotMet = async (auctionId) => {
  const auction = await Auction.findById(auctionId);
  if (!auction || auction.status !== "reserve_not_met" || auction.auctionType !== "reserve") return false;
  const seller = await User.findById(auction.seller).select(SELLER_FIELDS).lean();
  const bin = auction.postAuctionBin || {};

  if (bin.status === "scheduled" && bin.price) {
    const error = binPriceError(auction, bin.price, { atEnd: true });
    if (!error) {
      await startBin(auction, bin.price, { startedBy: "auto" });
      return true;
    }
    auction.postAuctionBin.status = "not_started";
    auction.postAuctionBin.note = error;
    await auction.save();
    if (seller) postAuctionBinSellerEmail(seller, auction, "not_started", { reason: error }).catch(() => {});
    return false;
  }

  // No price set in advance: invite the seller, unless Last Chance can't work
  // because the top bid is already within 10% of the reserve.
  if (!bin.status && seller && !binPriceError(auction, Math.max(1, topBidOf(auction) + 1), { atEnd: true })) {
    postAuctionBinSellerEmail(seller, auction, "invite").catch(() => {});
    await Auction.updateOne({ _id: auction._id }, { $set: { "postAuctionBin.invitedAt": new Date() } });
  }
  return false;
};

/** Buys a lot on Last Chance. First buyer to confirm wins. */
export const buyBin = async (auctionId, buyer, expectedPriceInBase) => {
  const now = new Date();
  const claimed = await Auction.findOneAndUpdate(
    {
      _id: auctionId,
      status: "reserve_not_met",
      winner: null,
      seller: { $ne: buyer._id },
      "postAuctionBin.status": "live",
      "postAuctionBin.endsAt": { $gt: now },
    },
    { $set: { "postAuctionBin.status": "processing" } },
    { new: true }
  );
  if (!claimed) {
    const lot = await Auction.findById(auctionId).select("seller").lean();
    if (lot && idStr(lot.seller) === idStr(buyer._id)) throw httpError(400, "You can't buy your own lot.");
    throw httpError(409, "Sorry, this lot has just been sold or its Last Chance has ended.");
  }

  try {
    const price = claimed.postAuctionBin.price;
    if (expectedPriceInBase != null && Math.abs(Number(expectedPriceInBase) - price) > 0.5) {
      throw httpError(409, "The price has changed. Please refresh the page and try again.");
    }

    claimed.currentPrice = price;
    claimed.currentBidder = buyer._id;
    claimed.winner = buyer._id;
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
      if (o.status === "pending") {
        o.status = "rejected";
        o.sellerResponse = "Offer closed - item bought on Last Chance";
      }
    }

    claimed.postAuctionBin.status = "sold";
    claimed.postAuctionBin.soldTo = buyer._id;
    claimed.postAuctionBin.soldAt = now;
    claimed.postAuctionBin.endedAt = now;
    await claimed.save(); // creates the sale record (auction model hooks)
  } catch (error) {
    // Put it back on Last Chance so someone else can buy it.
    await Auction.updateOne(
      { _id: auctionId, "postAuctionBin.status": "processing" },
      { $set: { "postAuctionBin.status": "live" } }
    );
    throw error;
  }

  try {
    const { default: agendaService } = await import("./agendaService.js");
    await agendaService.cancelBinJobs?.(auctionId);
  } catch { /* the sweep ignores sold lots */ }

  broadcastAuctionChange(auctionId);

  // Same emails as any other sale.
  (async () => {
    const sold = await Auction.findById(auctionId)
      .populate("seller", "email phone username companyName firstName lastName currency userType")
      .populate("winner", "email phone username companyName firstName lastName address currency");
    await sendAuctionWonEmail(sold);
    await sendAuctionEndedSellerEmail(sold);
    const admins = await User.find({ userType: "admin" }).select("email currency");
    for (const admin of admins) await auctionWonAdminEmail(admin.email, admin.currency, sold, sold.winner);
  })().catch((e) => console.error("Last Chance sale emails failed:", e));

  return claimed;
};

/** Ends Last Chance windows that have run out. Safe to run repeatedly. */
export const expireBins = async (now = new Date()) => {
  const due = await Auction.find({
    "postAuctionBin.status": { $in: ["live", "processing"] },
    "postAuctionBin.endsAt": { $lte: now },
  });
  let expired = 0;
  for (const auction of due) {
    // A purchase that's mid-way gets a minute to finish.
    if (auction.postAuctionBin.status === "processing" && now - auction.postAuctionBin.endsAt < 60 * 1000) continue;
    const soldOtherwise = auction.status !== "reserve_not_met" || !!auction.winner;
    auction.postAuctionBin.status = soldOtherwise ? "cancelled" : "expired";
    auction.postAuctionBin.endedAt = now;
    if (soldOtherwise) auction.postAuctionBin.note = "Lot sold another way during Last Chance";
    await auction.save();
    broadcastAuctionChange(auction._id);
    if (!soldOtherwise) {
      expired += 1;
      const seller = await User.findById(auction.seller).select(SELLER_FIELDS).lean();
      if (seller) postAuctionBinSellerEmail(seller, auction, "expired").catch(() => {});
    }
  }
  return expired;
};

export const isLive = binIsLive;

/**
 * Admin: reverses a Last Chance purchase that hasn't been paid (e.g. a test or
 * accidental purchase). Cancels any Stripe payment request, removes the sale
 * record (a copy is kept on the lot), returns the lot to "reserve not met" and,
 * if asked, puts it back on Last Chance for the time it had left.
 * @param {{ reason: string, relist: boolean, notifySeller: boolean }} opts
 */
export const undoBinPurchase = async (auctionId, admin, { reason, relist = true, notifySeller = true } = {}) => {
  if (!reason?.trim()) throw httpError(400, "Add a reason");
  const auction = await Auction.findById(auctionId);
  if (!auction) throw httpError(404, "Lot not found");
  const bin = auction.postAuctionBin || {};
  if (bin.status !== "sold" || auction.status !== "sold") throw httpError(400, "This lot wasn't bought on Last Chance.");
  if (auction.paymentStatus === "completed") throw httpError(409, "This sale has been paid. Refund it before undoing.");

  const sale = await Sale.findOne({ auction: auction._id });
  if (sale) {
    if (!["sold", "request_sent", "failed"].includes(sale.status)) {
      throw httpError(409, `The sale is already ${sale.status.replace("_", " ")}, so it can't be undone here.`);
    }
    const piId = sale.stripe?.paymentIntentId;
    if (piId) {
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.amount_received > 0 || pi.status === "succeeded") {
        throw httpError(409, "Money has already arrived for this sale in Stripe. Check Stripe before undoing.");
      }
      if (!["canceled", "succeeded"].includes(pi.status)) await stripe.paymentIntents.cancel(piId);
    }
  }

  const now = new Date();
  const buyerId = bin.soldTo || auction.winner;
  // Time it had left when it was bought; at least 24 hours if it's put back.
  const remainingMs = Math.max(
    24 * 36e5,
    new Date(bin.endsAt || now).getTime() - new Date(bin.soldAt || now).getTime()
  );

  // Back to how it was after the auction: top bid and bidder from the bids.
  const bids = (auction.bids || []).filter((b) => !b.isBuyNow).sort((a, b) => b.amount - a.amount);
  auction.status = "reserve_not_met";
  auction.winner = null;
  auction.finalPrice = undefined;
  auction.currentPrice = bids[0]?.amount ?? auction.startPrice;
  auction.currentBidder = bids[0]?.bidder ?? null;
  for (const f of ["commissionAmount", "sellerCommissionAmount", "bidderCommissionAmount", "commissionType", "commissionValue", "featuredPremiumAmount"]) {
    auction[f] = undefined;
  }
  auction.paymentStatus = "pending";

  const record = {
    buyer: buyerId,
    price: bin.price,
    boughtAt: bin.soldAt,
    saleReference: sale?.reference,
    reason: reason.trim(),
    by: admin._id,
    at: now,
  };
  auction.postAuctionBin.undone = [...(bin.undone || []), record];
  auction.postAuctionBin.soldTo = undefined;
  auction.postAuctionBin.soldAt = undefined;
  if (relist) {
    auction.postAuctionBin.status = "live";
    auction.postAuctionBin.endsAt = new Date(now.getTime() + remainingMs);
    auction.postAuctionBin.endedAt = undefined;
  } else {
    auction.postAuctionBin.status = "cancelled";
    auction.postAuctionBin.endedAt = now;
  }
  auction.postAuctionBin.note = `Purchase undone by RexBid: ${reason.trim()}`;
  await auction.save();
  if (sale) await Sale.deleteOne({ _id: sale._id });

  if (relist) {
    try {
      const { default: agendaService } = await import("./agendaService.js");
      await agendaService.scheduleBinEnd?.(auction._id, auction.postAuctionBin.endsAt);
    } catch { /* the 15-minute sweep covers it */ }
  }
  broadcastAuctionChange(auction._id);

  if (notifySeller) {
    const seller = await User.findById(auction.seller).select(SELLER_FIELDS).lean();
    if (seller) {
      postAuctionBinSellerEmail(seller, auction, relist ? "undone_relisted" : "undone", {
        price: bin.price,
        currency: auction.baseCurrency || "EUR",
        endsAt: auction.postAuctionBin.endsAt,
      }).catch((e) => console.error("Undo seller email failed:", e));
    }
  }
  return { auction, saleRemoved: !!sale, endsAt: relist ? auction.postAuctionBin.endsAt : null };
};

/** Admin: recent Last Chance sales (for the undo list). */
export const recentBinSales = async (days = 14) => {
  const since = new Date(Date.now() - days * 864e5);
  return Auction.find({ "postAuctionBin.status": "sold", "postAuctionBin.soldAt": { $gte: since } })
    .select("title baseCurrency postAuctionBin paymentStatus status winner seller")
    .populate("winner", "firstName lastName companyName email")
    .populate("seller", "firstName lastName companyName email")
    .sort({ "postAuctionBin.soldAt": -1 })
    .lean();
};
