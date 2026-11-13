// Paid listing extras (Featured / Meta Boost) and the listing's status.
//
// A listing with unpaid extras is "awaiting_payment": not submitted, not in the
// admin approval queue and it can't go live. Once paid it moves on as normal:
// auctions go to admin approval (and admins are emailed), Buy It Now and
// giveaway listings go live. The seller can also drop the extras and submit
// without them.

import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { auctionSubmittedForApprovalEmail } from "../utils/nodemailer.js";
import { broadcastAuctionChange } from "./realtimeService.js";

const goesLiveWithoutApproval = (auction) =>
  auction.auctionType === "buy_now" || auction.auctionType === "giveaway";

/** Status a listing moves to once nothing is owed for extras. */
const submittedStatus = (auction) => (goesLiveWithoutApproval(auction) ? "active" : "draft");

const notifyAdmins = async (auction) => {
  try {
    const seller = await User.findById(auction.seller).select("username companyName firstName lastName email phone");
    const admins = await User.find({ userType: "admin" }).select("email");
    for (const admin of admins) {
      await auctionSubmittedForApprovalEmail(admin.email, auction, seller)
        .catch((e) => console.error("Listing submitted email failed:", e?.message));
    }
  } catch (err) {
    console.error("Could not notify admins of submitted listing:", err?.message);
  }
};

/** After extras are paid (webhook or confirm endpoint). Safe to call twice. */
export const onExtrasPaid = async (auction) => {
  const firstTime = auction.extrasPayment.status !== "completed";
  auction.extrasPayment.status = "completed";
  if (!auction.extrasPayment.paidAt) auction.extrasPayment.paidAt = new Date();
  // Paid Featured shows in Featured Ads (once the listing is live).
  if (auction.featuredRequested && !auction.isFeatured) auction.isFeatured = true;

  let submitted = false;
  if (auction.status === "awaiting_payment") {
    auction.status = submittedStatus(auction);
    submitted = true;
  } else if (goesLiveWithoutApproval(auction) && auction.status === "draft") {
    auction.status = "active"; // listings created before awaiting_payment existed
  }
  if (firstTime || submitted) await auction.save();

  if (submitted && auction.status === "draft") await notifyAdmins(auction);
  if (auction.status === "active") broadcastAuctionChange(auction._id);
  return auction;
};

/** Seller drops the unpaid extras and submits the listing without them. */
export const submitWithoutExtras = async (auction) => {
  if (auction.status !== "awaiting_payment") {
    throw Object.assign(new Error("This listing isn't waiting for payment."), { status: 400 });
  }
  if (auction.extrasPayment?.status === "completed") {
    throw Object.assign(new Error("The extras are already paid."), { status: 400 });
  }
  const piId = auction.extrasPayment?.paymentIntentId;
  auction.featuredRequested = false;
  auction.metaBoostPackage = "";
  auction.extrasPayment = { amount: 0, currency: auction.extrasPayment?.currency || "EUR", status: "not_required", lineItems: [] };
  auction.status = submittedStatus(auction);
  await auction.save();

  if (piId) {
    try {
      const { default: Stripe } = await import("stripe");
      await new Stripe(process.env.STRIPE_SECRET_KEY).paymentIntents.cancel(piId);
    } catch { /* already cancelled or never confirmed */ }
  }
  if (auction.status === "draft") await notifyAdmins(auction);
  else broadcastAuctionChange(auction._id);
  return auction;
};

/**
 * Listings created before this change sit in "draft" with unpaid extras. Move
 * them to awaiting_payment so they leave the approval queue. Idempotent.
 */
export const moveUnpaidExtrasDrafts = async () => {
  const res = await Auction.updateMany(
    {
      status: "draft",
      "extrasPayment.amount": { $gt: 0 },
      "extrasPayment.status": { $in: ["pending", "failed"] },
    },
    { $set: { status: "awaiting_payment" } }
  );
  if (res.modifiedCount) console.log(`Moved ${res.modifiedCount} unpaid-extras listing(s) to awaiting payment`);
  return res.modifiedCount;
};
