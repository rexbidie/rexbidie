import { model, Schema } from "mongoose";
import mongoose from "mongoose";
import agendaService from "../services/agendaService.js";
import { calculateCommission } from "../utils/commissionCalculator.js";

// Create a separate schema for offers

const offerSchema = new Schema(
  {
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyerUsername: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    isPostAuction: { type: Boolean, default: false },
    // NEW FIELDS FOR REACTIVATION
    canBeReactivated: {
      type: Boolean,
      default: true,
    },
    reactivatedAt: {
      type: Date,
    },
    // EXISTING FIELDS
    message: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "countered",
        "expired",
        "withdrawn",
      ],
      default: "pending",
    },
    sellerResponse: {
      type: String,
      trim: true,
    },
    counterOffer: {
      amount: Number,
      message: String,
    },
    negotiationHistory: [
      {
        by: { type: Schema.Types.ObjectId, ref: "User" },
        role: { type: String, enum: ["buyer", "seller", "admin"] },
        type: { type: String, enum: ["offer", "counter", "accept", "reject"] },
        amount: Number,
        message: String,
        at: { type: Date, default: Date.now },
      },
    ],
    expiresAt: {
      type: Date,
      default: function () {
        // Offers expire after 15 days by default
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 360);
        return expiryDate;
      },
    },
  },
  {
    timestamps: true,
  },
);

const auctionSchema = new Schema(
  {
    // Basic Auction Info
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subTitle: {
      type: String,
      trim: true,
    },
    specifications: {
      type: Map,
      of: Schema.Types.Mixed,
      default: new Map(),
    },
    description: {
      type: String,
      required: true,
    },
    categories: [
      {
        type: String,
        required: true,
      },
    ],
    auctionDate: {
      type: Schema.Types.ObjectId,
      ref: "AuctionDate",
      default: null,
    },
    location: {
      type: String,
      trim: true,
    },
    videoLink: {
      type: String,
      trim: true,
    },

    // Features field (replaces avionics for cars)
    features: {
      type: String,
      default: "",
    },

    // Seller Information
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sellerUsername: {
      type: String,
      required: true,
    },

    // Pricing & Bidding
    startPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    currentPrice: {
      type: Number,
      default: function () {
        return this.startPrice;
      },
    },
    baseCurrency: {
      type: String,
      enum: ['EUR', 'GBP'],
      required: true,
      default: 'EUR'
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    bidIncrement: {
      type: Number,
      required: false,
      min: 0,
    },
    reservePrice: {
      type: Number,
      min: 0,
    },
    buyNowPrice: {
      // NEW: Buy Now Price
      type: Number,
      min: 0,
    },
    auctionType: {
      type: String,
      enum: ["standard", "reserve", "buy_now", "giveaway"], // ADDED 'giveaway'
      required: true,
    },
    allowOffers: {
      // NEW: Allow users to make offers
      type: Boolean,
      default: false,
    },
    // Buy It Now after the auction (utils/postAuctionBin.js). Used when a reserve
    // lot ends without meeting its reserve. Price is in the lot's own currency.
    postAuctionBin: {
      price: { type: Number, min: 0 },
      status: {
        type: String,
        // scheduled: set in advance, starts if the reserve isn't met
        // live: on the Buy It Now page; processing: a purchase is going through
        // not_started: the scheduled price wasn't valid once the auction ended
        enum: [null, "scheduled", "live", "processing", "sold", "expired", "cancelled", "not_started"],
        default: null,
      },
      startedAt: Date,
      endsAt: Date,
      topBidAtStart: Number,
      soldTo: { type: Schema.Types.ObjectId, ref: "User" },
      soldAt: Date,
      endedAt: Date,
      note: String,
      // Seller emailed an invitation to use Buy It Now (automatic or from Admin → Buy It Now).
      invitedAt: Date,
      // Latest time the seller can start it (defaults to 72 hours after the end;
      // an admin invitation gives a fresh 72 hours from the email).
      startDeadline: Date,
      // Purchases reversed by an admin (e.g. a test or accidental purchase).
      undone: [
        {
          buyer: { type: Schema.Types.ObjectId, ref: "User" },
          price: Number,
          boughtAt: Date,
          saleReference: String,
          reason: String,
          by: { type: Schema.Types.ObjectId, ref: "User" },
          at: Date,
        },
      ],
    },
    vatIncluded: {
      type: Boolean,
      default: false,
    },

    // Timing
    startDate: {
      type: Date,
      required: false,
    },
    endDate: {
      type: Date,
      required: false,
    },

    // Media - Updated for car auctions
    documents: [
      {
        url: String,
        publicId: String,
        filename: String,
        originalName: String,
        documentType: { type: String, default: "general" },
        caption: { type: String, default: "" },
      },
    ],
    photos: [
      {
        url: String,
        publicId: String,
        filename: String,
        order: { type: Number, default: 0 },
        caption: { type: String, default: "" },
        width: { type: Number },
        height: { type: Number },
        format: { type: String, default: "webp" },
        bytes: { type: Number },
        thumbUrl: { type: String },
        thumbPublicId: { type: String },
        thumbWidth: { type: Number },
        thumbHeight: { type: Number },
        thumbBytes: { type: Number },
      },
    ],
    serviceRecords: [
      {
        url: String,
        publicId: String,
        filename: String,
        originalName: String,
        order: { type: Number, default: 0 },
        caption: { type: String, default: "" },
        width: { type: Number },
        height: { type: Number },
        format: { type: String, default: "webp" },
        bytes: { type: Number },
        thumbUrl: { type: String },
        thumbPublicId: { type: String },
        thumbWidth: { type: Number },
        thumbHeight: { type: Number },
        thumbBytes: { type: Number },
      },
    ],

    // Bidding
    bids: [
      {
        bidder: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        bidderUsername: String,
        amount: Number,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        isBuyNow: {
          type: Boolean,
          default: false,
        },
        isProxyBid: { type: Boolean, default: false },
        proxyBidId: { type: Schema.Types.ObjectId },
      },
    ],
    currentBidder: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    bidCount: {
      type: Number,
      default: 0,
    },
    // ── Proxy Bidding — amounts stored in auction.baseCurrency ──
    proxyBids: [
      {
        bidder: { type: Schema.Types.ObjectId, ref: "User", required: true },
        bidderUsername: { type: String, required: true },
        maxAmount: { type: Number, required: true, min: 0 },
        currentBid: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    allowProxyBidding: { type: Boolean, default: true },
    proxyBidConfig: {
      maxBidPerUser: { type: Number, default: 1 },
      autoIncrease: { type: Boolean, default: true },
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },
    // Seller ticked "Feature my listing" (EUR 30).
    // An admin still decides and switches isFeatured on.
    featuredRequested: {
      type: Boolean,
      default: false,
    },
    // Paid Facebook & Instagram advert package the seller chose
    // ("boost" | "plus" | "max"), or "" for none. Prices live in
    // frontend/src/utils/fees.js (META_BOOST_PACKAGES). Card payment
    // at checkout is still to be wired up.
    metaBoostPackage: {
      type: String,
      enum: ["", "boost", "plus", "max"],
      default: "",
    },
    // ── Extras payment (charged upfront for Featured + Meta Boost) ──
    extrasPayment: {
      amount: { type: Number, default: 0 },
      currency: { type: String, enum: ['EUR', 'GBP'], default: 'EUR' },
      status: {
        type: String,
        enum: ['not_required', 'pending', 'completed', 'failed', 'refunded'],
        default: 'not_required',
      },
      paymentIntentId: { type: String },
      paidAt: { type: Date },
      lineItems: [
        { _id: false, id: String, label: String, amount: Number },
      ],
    },
    featuredPremiumAmount: {
      type: Number,
      default: 0,
    },

    // Offers - NEW: Array of offers
    offers: [offerSchema],

    participants: [{
      user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: false, // Not required since guest users can participate
      },
      email: {
        type: String,
        required: true,
      },
      phoneNumber: {
        type: String,
        required: true,
      },
      participatedAt: {
        type: Date,
        default: Date.now,
      },
      isWinner: {
        type: Boolean,
        default: false,
      },
    }],

    // Status
    status: {
      type: String,
      enum: [
        "draft",
        "active",
        "approved",
        "ended",
        "cancelled",
        "sold",
        "reserve_not_met",
        "sold_buy_now",
      ], // ADDED 'sold_buy_now'
      default: "draft",
    },
    winner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    finalPrice: {
      type: Number,
    },
    commissionAmount: {
      // Legacy total = sellerCommissionAmount + bidderCommissionAmount
      type: Number,
      default: 0,
    },
    sellerCommissionAmount: {
      type: Number,
      default: 0,
    },
    bidderCommissionAmount: {
      type: Number,
      default: 0,
    },
    commissionType: {
      type: String,
      enum: ["fixed", "percentage", "tiered", null],
      default: null,
    },
    commissionValue: {
      type: Number,
      default: 0,
    },
    bidPaymentRequired: {
      type: Boolean,
      default: true,
    },

    // Metadata
    views: {
      type: Number,
      default: 0,
    },
    watchlistCount: {
      type: Number,
      default: 0,
    },

    // Auto-extend auction if bids near end time
    autoExtend: {
      type: Boolean,
      default: true,
    },
    lastBidTime: Date,
    notifications: {
      ending30min: { type: Boolean, default: false },
      ending2hour: { type: Boolean, default: false },
      ending24hour: { type: Boolean, default: false },
      ending30minSentAt: Date,
      ending2hourSentAt: Date,
      ending24hourSentAt: Date,
      offerReceived: { type: Boolean, default: false },
      offerExpiring: { type: Boolean, default: false },
      reserveNudge: { type: Boolean, default: false },
      reserveNudgeSentAt: Date,
    },
    // In your auction.model.js schema
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "refunded",
        "cancelled",
      ],
      default: "pending",
    },
    purchaseEventSent: {
      type: Boolean,
      default: false,
    },
    paymentMethod: {
      type: String,
      enum: ["credit_card", "bank_transfer", "paypal", "other", null],
      default: null,
    },
    paymentCollectionPreference: {
      type: String,
      enum: ["bank_transfer", "credit_card", "buyer_decides"],
      required: true,
      default: "buyer_decides",
    },
    paymentDate: {
      type: Date,
    },
    transactionId: {
      type: String,
    },
    invoice: {
      url: String,
      publicId: String,
      filename: String,
      uploadedAt: Date,
      uploadedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better performance
auctionSchema.index({ status: 1, endDate: 1 });
auctionSchema.index({ seller: 1, createdAt: -1 });
auctionSchema.index({ category: 1, status: 1 });
auctionSchema.index({ startDate: 1, endDate: 1 });
auctionSchema.index({ "offers.status": 1 });
auctionSchema.index({ "postAuctionBin.status": 1, "postAuctionBin.endsAt": 1 });
auctionSchema.index({ "offers.expiresAt": 1 });
auctionSchema.index({ "proxyBids.bidder": 1, "proxyBids.isActive": 1 });
auctionSchema.index({ "proxyBids.maxAmount": -1 });

// Virtual for time remaining
auctionSchema.virtual("timeRemaining").get(function () {
  if (this.status !== "active") return 0;
  return Math.max(0, this.endDate - new Date());
});

// Add this virtual to your auction schema
auctionSchema.virtual('isTimedAuction').get(function () {
  // Only standard and reserve auctions have timers
  return this.auctionType === 'standard' || this.auctionType === 'reserve';
});

// Also add this for convenience
auctionSchema.virtual('isAlwaysAvailable').get(function () {
  // Buy now and giveaway are always available until purchased
  return this.auctionType === 'buy_now' || this.auctionType === 'giveaway';
});

// Virtual for VAT calculation
auctionSchema.virtual("hasVat").get(function () {
  return this.vatIncluded === true;
});

// Virtual for price including/excluding VAT
auctionSchema.virtual("priceWithVat").get(function () {
  if (!this.vatIncluded) return this.currentPrice;
  // If you have a VAT rate, you can calculate it here
  // For now, just return the current price
  return this.currentPrice;
});

// Check if auction is about to end
auctionSchema.methods.isEndingSoon = function () {
  return this.timeRemaining < 5 * 60 * 1000;
};

// Get ending soon auctions
auctionSchema.statics.getEndingSoonAuctions = function () {
  return this.find({
    status: "active",
    endDate: { $gt: new Date() },
    timeRemaining: { $lt: 15 * 60 * 1000 },
  });
};

auctionSchema.virtual("timeRemainingFormatted").get(function () {
  if (!this.isActive) return "Auction ended";

  const ms = this.timeRemaining;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
});

// Virtual for isActive
auctionSchema.virtual("isActive").get(function () {
  return this.status === "active" && new Date() < this.endDate;
});

// NEW: Virtual for isBuyNowAvailable
auctionSchema.virtual("isBuyNowAvailable").get(function () {
  return (
    this.buyNowPrice &&
    this.auctionType === "buy_now" &&
    this.status === "active" &&
    !this.winner
  );
});

// Method to place a bid
auctionSchema.methods.placeBid = async function (
  bidderId,
  bidderUsername,
  amount,
) {
  const now = new Date();

  // Safety net: if agenda job missed activation, activate now
  if (this.status === "draft" && now >= this.startDate && now < this.endDate) {
    this.status = "active";
    await agendaService.scheduleAuctionEnd(this._id, this.endDate);
  }

  if (this.status !== "active") {
    throw new Error("Auction is not active");
  }

  if (now >= this.endDate) {
    throw new Error("Auction has ended");
  }

  const minBid =
    this.bidCount === 0
      ? this.currentPrice
      : this.currentPrice + this.bidIncrement;
  if (amount < minBid) {
    throw new Error(`Bid must be at least $${minBid}`);
  }

  // Add bid
  this.bids.push({
    bidder: bidderId,
    bidderUsername,
    amount,
    timestamp: now,
    isBuyNow: false,
    isProxyBid: false,
    proxyBidId: null,
  });

  this.currentPrice = amount;
  this.currentBidder = bidderId;
  this.bidCount += 1;
  this.lastBidTime = now;

  // Auto-extend if bidding near end time (last 1 minute)
  if (this.autoExtend) {
    const timeRemaining = this.endDate - now;
    if (timeRemaining < 2 * 60 * 1000) {
      const newEndDate = new Date(this.endDate.getTime() + 1 * 60 * 1000);
      this.endDate = newEndDate;
      await agendaService.cancelAuctionJobs(this._id);
      await agendaService.scheduleAuctionEnd(this._id, newEndDate);
    }
  }

  return this.save();
};

auctionSchema.methods.buyNow = async function (buyerId, buyerUsername) {
  const now = new Date();

  if (this.status !== "active") {
    throw new Error("Auction is not active");
  }

  // MODIFIED: Allow giveaways to proceed without buyNowPrice
  if (this.auctionType !== "giveaway") {
    // Only check buyNowPrice for non-giveaway auctions
    if (!this.buyNowPrice) {
      throw new Error("Buy Now is not available for this auction");
    }
  }

  if (now >= this.endDate && this.auctionType !== "giveaway") {
    // Giveaways don't have end date restrictions
    throw new Error("Auction has ended");
  }

  // Add buy now as a bid with special flag
  this.bids.push({
    bidder: buyerId,
    bidderUsername: buyerUsername,
    amount: this.auctionType === "giveaway" ? 0 : this.buyNowPrice,
    timestamp: now,
    isBuyNow: true,
  });

  // Set auction as sold
  this.currentPrice = this.auctionType === "giveaway" ? 0 : this.buyNowPrice;
  this.currentBidder = buyerId;
  this.winner = buyerId;
  this.finalPrice = this.auctionType === "giveaway" ? 0 : this.buyNowPrice;
  this.status = "sold";
  this.endDate = now; // End auction immediately

  // Calculate and store commission (only for non-giveaway)
  if (this.auctionType !== "giveaway") {
    const commissionData = await calculateCommission(this.finalPrice, this.isFeatured, this.baseCurrency);
    this.commissionAmount = commissionData.commissionAmount;
    this.sellerCommissionAmount = commissionData.sellerCommissionAmount;
    this.bidderCommissionAmount = commissionData.bidderCommissionAmount;
    this.commissionType = commissionData.commissionType;
    this.commissionValue = commissionData.commissionValue;
    this.featuredPremiumAmount = commissionData.featuredPremium; // NEW
  }

  // Reject all pending offers (if any)
  this.offers.forEach((offer) => {
    if (offer.status === "pending") {
      offer.status = "rejected";
      offer.sellerResponse = "Offer rejected - item purchased via Buy Now";
    }
  });

  // Cancel any scheduled jobs
  await agendaService.cancelAuctionJobs(this._id);

  return this.save();
};

auctionSchema.methods.getTopUniqueBidders = function (limit = 2) {
  const highestByBidder = new Map();
  for (const bid of this.bids) {
    const id = bid.bidder?.toString();
    if (!id) continue;
    const prev = highestByBidder.get(id);
    if (!prev || bid.amount > prev.amount) {
      highestByBidder.set(id, { bidder: bid.bidder, amount: bid.amount });
    }
  }
  return Array.from(highestByBidder.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};

auctionSchema.methods.makeOffer = async function (
  buyerId,
  buyerUsername,
  amount,
  message = "",
) {
  const now = new Date();
  const isPostAuction = this.status === "reserve_not_met";

  // allowOffers is bypassed for post-auction (reserve_not_met) offers
  if (!this.allowOffers && !isPostAuction) {
    throw new Error("Offers are not allowed for this auction");
  }

  // Allowed on active OR reserve_not_met
  if (this.status !== "active" && !isPostAuction) {
    throw new Error("Auction is not active");
  }

  // End-date gate only for live auctions
  if (!isPostAuction && now >= this.endDate) {
    throw new Error("Auction has ended");
  }

  // Post-auction: only top 2 unique bidders may offer
  if (isPostAuction) {
    const top = this.getTopUniqueBidders(2);
    const eligible = top.some(
      (b) => b.bidder.toString() === buyerId.toString(),
    );
    if (!eligible) {
      throw new Error(
        "Only the top two bidders can make offers on this auction",
      );
    }
  }

  // One pending offer at a time (per bidder)
  const existingPendingOffer = this.offers.find(
    (offer) =>
      offer.buyer.toString() === buyerId.toString() &&
      offer.status === "pending",
  );
  if (existingPendingOffer) {
    throw new Error("You already have a pending offer for this auction");
  }

  // Post-auction offers never expire; regular offers expire in 15 days
  const expiresAt = isPostAuction
    ? null
    : new Date(now.getTime() + 360 * 60 * 60 * 1000);

  this.offers.push({
    buyer: buyerId,
    buyerUsername,
    amount,
    message,
    status: "pending",
    isPostAuction,
    expiresAt,
  });

  this.notifications.offerReceived = true;
  return this.save();
};

// NEW: Method to respond to an offer
auctionSchema.methods.respondToOffer = async function (
  offerId,
  response,
  counterAmount = null,
  counterMessage = "",
) {
  const offer = this.offers.id(offerId);

  if (!offer) {
    throw new Error("Offer not found");
  }

  if (offer.status !== "pending") {
    throw new Error("Offer has already been responded to");
  }

  if (offer.expiresAt && new Date() > offer.expiresAt) {
    offer.status = "expired";
    return this.save();
  }

  switch (response) {
    case "accept":
      // Accept the offer - end auction and mark as sold
      offer.status = "accepted";
      this.currentPrice = offer.amount;
      this.currentBidder = offer.buyer;
      this.winner = offer.buyer;
      this.finalPrice = offer.amount;
      this.status = "sold";
      this.endDate = new Date(); // End auction immediately

      // Calculate and store commission
      const commissionData = await calculateCommission(this.finalPrice, this.isFeatured, this.baseCurrency);
      this.commissionAmount = commissionData.commissionAmount;
      this.sellerCommissionAmount = commissionData.sellerCommissionAmount;
      this.bidderCommissionAmount = commissionData.bidderCommissionAmount;
      this.commissionType = commissionData.commissionType;
      this.commissionValue = commissionData.commissionValue;
      this.featuredPremiumAmount = commissionData.featuredPremium;

      // Reject all other pending offers
      this.offers.forEach((o) => {
        if (o.status === "pending" && o._id.toString() !== offerId) {
          o.status = "rejected";
          o.sellerResponse = "Offer rejected - auction sold to another buyer";
        }
      });

      // Cancel any scheduled jobs
      await agendaService.cancelAuctionJobs(this._id);
      break;

    case "reject":
      offer.status = "rejected";
      offer.sellerResponse = "Offer rejected";
      break;

    case "counter":
      if (!counterAmount) {
        throw new Error("Counter amount is required");
      }
      offer.status = "countered";
      offer.counterOffer = {
        amount: counterAmount,
        message: counterMessage,
        createdAt: new Date(),
      };
      // Give the buyer a fresh 15 days window to respond
      offer.expiresAt = new Date(Date.now() + 360 * 60 * 60 * 1000);
      break;

    default:
      throw new Error("Invalid response type");
  }

  return this.save();
};

// NEW: Method for buyer to respond to counter offer
auctionSchema.methods.respondToCounterOffer = async function (offerId, accept) {
  const offer = this.offers.id(offerId);

  if (!offer) {
    throw new Error("Offer not found");
  }

  if (offer.status !== "countered") {
    throw new Error("This offer is not in countered status");
  }

  if (offer.expiresAt && new Date() > offer.expiresAt) {
    offer.status = "expired";
    return this.save();
  }

  if (accept) {
    // Accept the counter offer
    offer.status = "accepted";
    this.currentPrice = offer.counterOffer.amount;
    this.currentBidder = offer.buyer;
    this.winner = offer.buyer;
    this.finalPrice = offer.counterOffer.amount;
    this.status = "sold";
    this.endDate = new Date();

    // Calculate and store commission
    const commissionData = await calculateCommission(this.finalPrice, this.isFeatured, this.baseCurrency);
    this.commissionAmount = commissionData.commissionAmount;
    this.sellerCommissionAmount = commissionData.sellerCommissionAmount;
    this.bidderCommissionAmount = commissionData.bidderCommissionAmount;
    this.commissionType = commissionData.commissionType;
    this.commissionValue = commissionData.commissionValue;
    this.featuredPremiumAmount = commissionData.featuredPremium;

    // Reject all other pending offers
    this.offers.forEach((o) => {
      if (o.status === "pending" && o._id.toString() !== offerId) {
        o.status = "rejected";
        o.sellerResponse = "Offer rejected - auction sold to another buyer";
      }
    });

    // Cancel any scheduled jobs
    await agendaService.cancelAuctionJobs(this._id);
  } else {
    // Reject the counter offer
    offer.status = "rejected";
    offer.sellerResponse = "Counter offer rejected by buyer";
  }

  return this.save();
};

// Buyer counters the seller's counter offer (starts a new round)
auctionSchema.methods.buyerCounterOffer = async function (offerId, buyerId, amount, message = "") {
  const offer = this.offers.id(offerId);
  if (!offer) throw new Error("Offer not found");

  // if (offer.buyer.toString() !== buyerId.toString()) {
  //   throw new Error("You can only counter your own offers");
  // }
  if (offer.status !== "countered") {
    throw new Error("You can only counter a seller's counter offer");
  }
  if (offer.expiresAt && new Date() > offer.expiresAt) {
    offer.status = "expired";
    return this.save();
  }
  if (!offer.counterOffer?.amount) {
    throw new Error("No seller counter offer to respond to");
  }
  if (amount <= 0) throw new Error("Invalid counter amount");
  // if (amount >= offer.counterOffer.amount) {
  //   throw new Error("Your counter must be lower than the seller's counter");
  // }

  // Record the previous round for audit
  offer.negotiationHistory.push({
    by: offer.buyer,
    role: "seller",
    type: "counter",
    amount: offer.counterOffer.amount,
    message: offer.counterOffer.message,
  });

  // Buyer's new active offer
  offer.negotiationHistory.push({
    by: buyerId,
    role: "buyer",
    type: "counter",
    amount,
    message,
  });

  offer.amount = amount;            // current active amount
  offer.message = message;          // latest message shown to seller
  offer.counterOffer = undefined;   // clear seller's counter
  offer.status = "pending";         // back to seller's turn
  offer.sellerResponse = "";        // reset
  offer.expiresAt = new Date(Date.now() + 360 * 60 * 60 * 1000); // fresh window

  return this.save();
};

// NEW: Method to withdraw an offer
auctionSchema.methods.withdrawOffer = async function (offerId, userId) {
  const offer = this.offers.id(offerId);

  if (!offer) {
    throw new Error("Offer not found");
  }

  if (offer.buyer._id.toString() !== userId.toString()) {
    throw new Error("You can only withdraw your own offers");
  }

  if (offer.status !== "pending") {
    throw new Error("Only pending offers can be withdrawn");
  }

  offer.status = "withdrawn";
  return this.save();
};

// NEW: Method to reactivate and accept a previously rejected offer
auctionSchema.methods.reactivateAndAcceptOffer = async function (
  offerId,
  userId,
  isAdmin = false,
) {
  const offer = this.offers.id(offerId);

  if (!offer) {
    throw new Error("Offer not found");
  }

  // Only allow reactivation of rejected offers
  if (offer.status !== "rejected") {
    throw new Error("Only rejected offers can be reactivated");
  }

  // For non-admin users, verify it's the seller
  if (!isAdmin && this.seller.toString() !== userId.toString()) {
    throw new Error("Only the seller or admin can reactivate offers");
  }

  // Check if offer can be reactivated
  if (!offer.canBeReactivated) {
    throw new Error("This offer cannot be reactivated");
  }

  // Check if auction is still active
  if (this.status !== "active") {
    throw new Error("Cannot reactivate offer on inactive auction");
  }

  // Reactivate and accept the offer
  const previousResponse = offer.sellerResponse || "";
  offer.status = "accepted";
  offer.sellerResponse = `${previousResponse ? previousResponse + " | " : ""
    }Reactivated and accepted by ${isAdmin ? "admin" : "seller"
    } on ${new Date().toLocaleDateString()}`;
  offer.reactivatedAt = new Date();

  // Update auction details
  this.currentPrice = offer.amount;
  this.currentBidder = offer.buyer;
  this.winner = offer.buyer;
  this.finalPrice = offer.amount;
  this.status = "sold";
  this.endDate = new Date();

  // Calculate and store commission
  const commissionData = await calculateCommission(this.finalPrice, this.isFeatured, this.baseCurrency);
  this.commissionAmount = commissionData.commissionAmount;
  this.sellerCommissionAmount = commissionData.sellerCommissionAmount;
  this.bidderCommissionAmount = commissionData.bidderCommissionAmount;
  this.commissionType = commissionData.commissionType;
  this.commissionValue = commissionData.commissionValue;
  this.featuredPremiumAmount = commissionData.featuredPremium;

  // Reject all other pending offers
  this.offers.forEach((o) => {
    if (o.status === "pending" && o._id.toString() !== offerId) {
      o.status = "rejected";
      o.sellerResponse = "Offer rejected - auction sold to another buyer";
    }
  });

  // Cancel any scheduled jobs
  await agendaService.cancelAuctionJobs(this._id);

  return this.save();
};

// Suggested model methods:
auctionSchema.methods.markPaymentProcessing = function () {
  this.paymentStatus = "processing";
  return this.save();
};

auctionSchema.methods.markPaymentCompleted = function (
  transactionId,
  paymentMethod,
) {
  this.paymentStatus = "completed";
  this.paymentDate = new Date();
  this.transactionId = transactionId;
  this.paymentMethod = paymentMethod;
  return this.save();
};

auctionSchema.methods.markPaymentFailed = function () {
  this.paymentStatus = "failed";
  return this.save();
};

auctionSchema.virtual("isPaymentPending").get(function () {
  return this.paymentStatus === "pending";
});

auctionSchema.virtual("isPaymentCompleted").get(function () {
  return this.paymentStatus === "completed";
});

auctionSchema.methods.attachInvoice = function (
  url,
  publicId,
  filename,
  uploadedBy,
) {
  this.invoice = {
    url,
    publicId,
    filename,
    uploadedAt: new Date(),
    uploadedBy,
  };
  return this.save();
};

auctionSchema.methods.removeInvoice = function () {
  this.invoice = undefined;
  return this.save();
};

auctionSchema.virtual("hasInvoice").get(function () {
  return !!(this.invoice && this.invoice.url);
});

// Method to check if reserve is met
auctionSchema.methods.isReserveMet = function () {
  if (this.auctionType !== "reserve") return true;
  return this.currentPrice >= this.reservePrice;
};

auctionSchema.methods.endAuction = async function () {
  if (this.status !== "active") return this;

  const now = new Date();
  let wasSold = false;

  // For standard auctions OR reserve auctions that met reserve
  if (this.bidCount > 0) {
    if (this.auctionType === "standard") {
      // Standard auction with bids - sold
      this.status = "sold";
      this.winner = this.currentBidder;
      this.finalPrice = this.currentPrice;
      wasSold = true;

      // Calculate and store commission
      const commissionData = await calculateCommission(this.finalPrice, this.isFeatured, this.baseCurrency);
      this.commissionAmount = commissionData.commissionAmount;
      this.sellerCommissionAmount = commissionData.sellerCommissionAmount;
      this.bidderCommissionAmount = commissionData.bidderCommissionAmount;
      this.commissionType = commissionData.commissionType;
      this.commissionValue = commissionData.commissionValue;
      this.featuredPremiumAmount = commissionData.featuredPremium;

    } else if (this.auctionType === "reserve") {
      // Reserve auction - check if reserve is met
      if (this.isReserveMet()) {
        this.status = "sold";
        this.winner = this.currentBidder;
        this.finalPrice = this.currentPrice;
        wasSold = true;

        // Calculate and store commission
        const commissionData = await calculateCommission(this.finalPrice, this.isFeatured, this.baseCurrency);
        this.commissionAmount = commissionData.commissionAmount;
        this.sellerCommissionAmount = commissionData.sellerCommissionAmount;
        this.bidderCommissionAmount = commissionData.bidderCommissionAmount;
        this.commissionType = commissionData.commissionType;
        this.commissionValue = commissionData.commissionValue;
        this.featuredPremiumAmount = commissionData.featuredPremium;
      } else {
        this.status = "reserve_not_met";
      }
    } else if (this.auctionType === "buy_now") {
      // Buy Now auction that ended normally (not via Buy Now)
      if (this.bidCount > 0) {
        this.status = "sold";
        this.winner = this.currentBidder;
        this.finalPrice = this.currentPrice;
        wasSold = true;

        // Calculate and store commission
        const commissionData = await calculateCommission(this.finalPrice, this.isFeatured, this.baseCurrency);
        this.commissionAmount = commissionData.commissionAmount;
        this.sellerCommissionAmount = commissionData.sellerCommissionAmount;
        this.bidderCommissionAmount = commissionData.bidderCommissionAmount;
        this.commissionType = commissionData.commissionType;
        this.commissionValue = commissionData.commissionValue;
        this.featuredPremiumAmount = commissionData.featuredPremium;

      } else {
        this.status = "ended";
      }
    }
  } else {
    // No bids - just end it
    this.status = "ended";
  }

  // Set actual end time
  this.endDate = now;

  // Also reject any pending offers when auction ends
  this.offers.forEach((offer) => {
    if (offer.status === "pending") {
      offer.status = "expired";
      offer.sellerResponse = "Offer expired - auction ended";
    }
  });

  await this.save();

  // Return result object
  return {
    wasSold,
    winner: this.winner,
    finalPrice: this.finalPrice,
    newStatus: this.status,
    commissionAmount: this.commissionAmount,
  };
};

// Static method to get active auctions
auctionSchema.statics.getActiveAuctions = function () {
  return this.find({
    status: "active",
    endDate: { $gt: new Date() },
  }).populate("seller", "username firstName lastName");
};

// NEW: Method to get auctions with offers for a specific user
auctionSchema.statics.getAuctionsWithOffersForUser = function (userId) {
  return this.find({
    $or: [{ seller: userId }, { "offers.buyer": userId }],
  }).populate("seller", "username firstName lastName");
};

// Pre-save middleware
auctionSchema.pre("save", function (next) {
  // Ensure current price is at least start price
  if (this.currentPrice < this.startPrice) {
    this.currentPrice = this.startPrice;
  }

  // Validate end date is after start date
  if (this.endDate && this.startDate && this.endDate <= this.startDate) {
    return next(new Error("End date must be after start date"));
  }

  // Validate buy now price is higher than start price
  if (this.buyNowPrice && this.buyNowPrice < this.startPrice) {
    return next(
      new Error("Buy Now price must be greater than or equal to start price"),
    );
  }

  // Validate buy now price is higher than reserve price for reserve auctions
  if (
    this.auctionType === "reserve" &&
    this.buyNowPrice &&
    this.buyNowPrice < this.reservePrice
  ) {
    return next(
      new Error("Buy Now price must be greater than or equal to reserve price"),
    );
  }

  if (!this.paymentCollectionPreference) {
    this.paymentCollectionPreference = "buyer_decides";
  }

  next();
});

// Pre-remove middleware
auctionSchema.pre("remove", async function (next) {
  try {
    await agendaService.cancelAuctionJobs(this._id);
    next();
  } catch (error) {
    next(error);
  }
});

// Update when auction dates change
auctionSchema.pre("save", async function (next) {
  if (this.isModified("startDate") || this.isModified("endDate")) {
    try {
      await agendaService.cancelAuctionJobs(this._id);
      if (this.status === "draft") {
        await agendaService.scheduleAuctionActivation(this._id, this.startDate);
      }
      if (this.status === "draft" || this.status === "active") {
        await agendaService.scheduleAuctionEnd(this._id, this.endDate);
      }
    } catch (error) {
      console.error("Error rescheduling agenda jobs:", error);
    }
  }
  next();
});

// ── GA4: detect transition to "sold" ─────────────────────
auctionSchema.pre("save", async function (next) {
  if (this.isNew) return next();
  if (!this.isModified("status")) return next();

  try {
    // Fetch the previous status from the DB
    const original = await this.constructor
      .findById(this._id)
      .select("status")
      .lean();

    if (original) {
      const wasSold = ["sold", "sold_buy_now"].includes(original.status);
      const isNowSold = ["sold", "sold_buy_now"].includes(this.status);

      if (!wasSold && isNowSold && this.winner) {
        this.$locals.justBecameSold = true;
      }
    }
  } catch (err) {
    console.error("pre-save sold-transition check failed:", err);
  }

  next();
});

auctionSchema.post("save", async function (doc) {
  if (doc.$locals?.justBecameSold) {
    doc.$locals.justBecameSold = false;
    try {
      const { trackAuctionWon } = await import("../utils/ga4.js");
      await trackAuctionWon(doc._id);
    } catch (err) {
      console.error("auction_won tracking failed:", err);
    }
  }
});

// ── GA4: detect transition to paymentStatus "completed" ──────
auctionSchema.pre("save", async function (next) {
  if (this.isNew) return next();
  if (!this.isModified("paymentStatus")) return next();
  if (this.paymentStatus !== "completed") return next();
  if (this.purchaseEventSent) return next();

  try {
    // Fetch the previous status from the DB
    const original = await this.constructor
      .findById(this._id)
      .select("paymentStatus")
      .lean();

    if (original && original.paymentStatus !== "completed") {
      // Mark in-memory so the post-save hook knows to fire
      this.$locals.justCompletedPayment = true;
      // Persist the flag as part of the same save for idempotency
      this.purchaseEventSent = true;
    }
  } catch (err) {
    console.error("pre-save payment-transition check failed:", err);
  }

  next();
});

auctionSchema.post("save", async function (doc) {
  if (doc.$locals?.justCompletedPayment) {
    doc.$locals.justCompletedPayment = false;
    try {
      const { trackPurchase } = await import("../utils/ga4.js");
      await trackPurchase(doc._id);
    } catch (err) {
      console.error("purchase tracking failed:", err);
    }
  }
});

// ── Sale records: keep the admin Sales page in step with the auction ──
// Covers every payment path (card checkout, webhook, admin "mark paid") and
// creates the sale record the moment a lot sells instead of waiting for the
// 15-minute sync.
// Runs after the GA4 "sold" check above, which sets justBecameSold; the GA4
// post-save hook clears that flag, so it is copied here first.
auctionSchema.pre("save", function (next) {
  if (this.$locals.justBecameSold) this.$locals.saleNeedsCreate = true;
  if (!this.isNew && this.isModified("paymentStatus") && this.paymentStatus === "completed") {
    this.$locals.saleNeedsPaid = true;
  }
  next();
});

auctionSchema.post("save", async function (doc) {
  const becameSold = doc.$locals?.saleNeedsCreate;
  const paid = doc.$locals?.saleNeedsPaid;
  if (!becameSold && !paid) return;
  doc.$locals.saleNeedsCreate = false;
  doc.$locals.saleNeedsPaid = false;
  try {
    const { syncSaleForAuction, markSalePaidFromAuction } = await import("../services/saleService.js");
    if (becameSold) await syncSaleForAuction(doc._id);
    if (paid) await markSalePaidFromAuction(doc);
  } catch (err) {
    console.error("Sale record update failed:", err);
  }
});

// NEW: Middleware to clean up expired offers
auctionSchema.methods.cleanupExpiredOffers = function () {
  const now = new Date();
  let changed = false;

  this.offers.forEach((offer) => {
    if (offer.status === "pending" && now > offer.expiresAt) {
      offer.status = "expired";
      offer.sellerResponse = "Offer expired";
      changed = true;
    }
  });

  if (changed) {
    return this.save();
  }
  return Promise.resolve(this);
};

const Auction = model("Auction", auctionSchema);
const Offer = model("Offer", offerSchema);

export { Offer };
export default Auction;
