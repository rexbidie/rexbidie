// Buying Featured or Meta Boost for a listing after it was created (the
// listing's 3-dot menu). Card payment through Stripe; once paid, Featured puts
// the listing in Featured Ads straight away and Meta Boost is recorded for
// RexBid to run (admins are emailed). Prices: utils/listingExtras.js.

import Stripe from "stripe";
import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { calculateListingExtras } from "../utils/listingExtras.js";
import { listingPromotionAdminEmail } from "../utils/nodemailer.js";
import { broadcastAuctionChange } from "./realtimeService.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Meta needs time to review ads, so Meta Boost isn't sold this close to the end. */
export const META_BOOST_MIN_HOURS_BEFORE_CLOSE = 48;

const PROMOTABLE = ["draft", "approved", "active"];

const ensureCustomer = async (seller) => {
  if (seller.stripeCustomerId) {
    try {
      const c = await stripe.customers.retrieve(seller.stripeCustomerId);
      if (c && !c.deleted) return c.id;
    } catch (err) {
      if (err?.code !== "resource_missing") throw err;
    }
  }
  const c = await stripe.customers.create({
    email: seller.email,
    name: `${seller.firstName || ""} ${seller.lastName || ""}`.trim() || seller.username,
    metadata: { userId: seller._id.toString() },
  });
  await User.findByIdAndUpdate(seller._id, { stripeCustomerId: c.id });
  return c.id;
};

const isFeaturedPaid = (a) => a.isFeatured || (a.featuredRequested && a.extrasPayment?.status === "completed") ||
  (a.promotions || []).some((p) => p.kind === "featured" && p.status === "completed");

/** What this listing can still buy, with prices in its currency. */
export const promotionOptions = (auction, now = new Date()) => {
  const prices = calculateListingExtras({ featuredRequested: true, metaBoostPackage: "boost", currency: auction.baseCurrency || "EUR" });
  const plus = calculateListingExtras({ metaBoostPackage: "plus", currency: auction.baseCurrency || "EUR" });
  const max = calculateListingExtras({ metaBoostPackage: "max", currency: auction.baseCurrency || "EUR" });
  const hoursLeft = auction.endDate ? (new Date(auction.endDate) - now) / 36e5 : Infinity;
  const timed = auction.auctionType === "standard" || auction.auctionType === "reserve";
  return {
    currency: auction.baseCurrency || "EUR",
    featured: { price: prices.featured.amount, available: PROMOTABLE.includes(auction.status) && !isFeaturedPaid(auction), already: isFeaturedPaid(auction) },
    metaBoost: {
      prices: { boost: prices.metaBoost.amount, plus: plus.metaBoost.amount, max: max.metaBoost.amount },
      available: PROMOTABLE.includes(auction.status) && !auction.metaBoostPackage && (!timed || hoursLeft >= META_BOOST_MIN_HOURS_BEFORE_CLOSE),
      already: auction.metaBoostPackage || null,
      tooLate: timed && hoursLeft < META_BOOST_MIN_HOURS_BEFORE_CLOSE,
    },
  };
};

/** Starts a card payment for Featured and/or a Meta Boost package. */
export const startPromotion = async (auction, seller, { featured = false, metaBoostPackage = "" } = {}) => {
  if (!PROMOTABLE.includes(auction.status)) {
    throw httpError(400, auction.status === "awaiting_payment"
      ? "Complete the payment for this listing's extras first."
      : "This listing can't be promoted in its current state.");
  }
  const opts = promotionOptions(auction);
  const wantFeatured = featured === true || featured === "true";
  const pkg = ["boost", "plus", "max"].includes(metaBoostPackage) ? metaBoostPackage : "";
  if (!wantFeatured && !pkg) throw httpError(400, "Choose Feature this ad or a Meta Boost package.");
  if (wantFeatured && !opts.featured.available) throw httpError(400, "This listing is already featured.");
  if (pkg && !opts.metaBoost.available) {
    throw httpError(400, opts.metaBoost.tooLate
      ? `Meta Boost needs at least ${META_BOOST_MIN_HOURS_BEFORE_CLOSE} hours before the auction ends.`
      : "This listing already has a Meta Boost.");
  }

  const extras = calculateListingExtras({ featuredRequested: wantFeatured, metaBoostPackage: pkg, currency: auction.baseCurrency || "EUR" });
  const promotion = {
    kind: wantFeatured && pkg ? "featured_meta" : wantFeatured ? "featured" : "meta",
    featured: wantFeatured,
    metaBoostPackage: pkg || null,
    amount: extras.total,
    currency: extras.currency,
    lineItems: extras.lineItems,
    status: "pending",
    createdAt: new Date(),
  };
  auction.promotions = [...(auction.promotions || []), promotion];
  await auction.save();
  const saved = auction.promotions[auction.promotions.length - 1];

  const customerId = await ensureCustomer(seller);
  const pi = await stripe.paymentIntents.create(
    {
      amount: Math.round(extras.total * 100),
      currency: extras.currency.toLowerCase(),
      customer: customerId,
      description: `${extras.lineItems.map((l) => l.label).join(" + ")} for "${auction.title}"`,
      payment_method_types: ["card"],
      metadata: { type: "listing_promotion", auctionId: auction._id.toString(), promotionId: saved._id.toString(), sellerId: seller._id.toString() },
    },
    { idempotencyKey: `listing_promotion_${saved._id}` }
  );
  await Auction.updateOne({ _id: auction._id, "promotions._id": saved._id }, { $set: { "promotions.$.paymentIntentId": pi.id } });

  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    amount: extras.total,
    currency: extras.currency,
    lineItems: extras.lineItems,
  };
};

/** Marks a promotion paid and applies it (webhook or confirm call). Safe to call twice. */
export const applyPaidPromotion = async (paymentIntent) => {
  const { auctionId, promotionId } = paymentIntent.metadata || {};
  if (!auctionId || !promotionId) return null;
  const now = new Date();
  // Only the first call does the work.
  const claimed = await Auction.findOneAndUpdate(
    { _id: auctionId, promotions: { $elemMatch: { _id: promotionId, status: { $ne: "completed" } } } },
    { $set: { "promotions.$.status": "completed", "promotions.$.paidAt": now, "promotions.$.paymentIntentId": paymentIntent.id } },
    { new: true }
  );
  if (!claimed) return null;
  const promo = claimed.promotions.id(promotionId);
  const set = {};
  if (promo.featured) Object.assign(set, { featuredRequested: true, isFeatured: true });
  if (promo.metaBoostPackage) set.metaBoostPackage = promo.metaBoostPackage;
  await Auction.updateOne({ _id: auctionId }, { $set: set });
  broadcastAuctionChange(auctionId);

  try {
    const admins = await User.find({ userType: "admin" }).select("email");
    for (const admin of admins) {
      await listingPromotionAdminEmail(admin.email, claimed, promo).catch((e) => console.error("Promotion email failed:", e?.message));
    }
  } catch (err) {
    console.error("Could not email admins about a promotion:", err?.message);
  }
  return promo;
};

/** Seller's browser confirms after Stripe says the card payment succeeded. */
export const confirmPromotion = async (auction, paymentIntentId) => {
  const promo = (auction.promotions || []).find((p) => p.paymentIntentId === paymentIntentId);
  if (!promo) throw httpError(404, "Payment not found for this listing.");
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== "succeeded") throw httpError(400, `Payment not completed yet (${pi.status}).`);
  await applyPaidPromotion(pi);
  return Auction.findById(auction._id);
};

export { isFeaturedPaid };
