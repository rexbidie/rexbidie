import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { publicName } from "../utils/displayName.js";
import { sanitizeAuctionForViewer } from "../utils/publicAuction.js";

// Buyer-facing responses must not include the reserve, other buyers' offers/contact
// details or proxy maximums (utils/publicAuction.js). Sellers and admins still see all.
const forViewer = (auction, viewer) =>
    sanitizeAuctionForViewer(auction?.toObject ? auction.toObject({ flattenMaps: true }) : auction, viewer);
import { getCachedRates } from "../routes/currency.route.js";
import {
  auctionWonAdminEmail,
  buyerCounteredEmail,
  counterOfferRejectedEmail,
  newOfferNotificationEmail,
  offerAcceptedEmail,
  offerCanceledEmail,
  offerConfirmationEmail,
  offerCounteredEmail,
  offerRejectedEmail,
  sendAuctionEndedSellerEmail,
  sendAuctionWonEmail,
} from "../utils/nodemailer.js";
import Stripe from 'stripe';
import { broadcastAuctionChange } from "../services/realtimeService.js";

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const convertPrice = (auction, targetCurrency, priceField) => {
  const rates = getCachedRates();
  if (!rates) return auction[priceField]; // fallback
  const base = auction.baseCurrency;
  const rate = rates[base].rates[targetCurrency];
  if (!rate) return auction[priceField];
  return auction[priceField] * rate;
};

// This is a different function to calculate amount. It is different from the convertAmount inside controllers
const convertAmountToBase = (amount, buyerCurrency, auction) => {
  if (!amount) return 0;
  const rates = getCachedRates();
  if (!rates) return amount;
  const base = auction.baseCurrency || 'EUR';
  const rate = rates[buyerCurrency]?.rates[base];  // buyerCurrency -> base
  if (!rate) return amount;
  return parseFloat((amount * rate).toFixed(2));
};

// Add this helper at the top of your controller
const convertRawAmount = (amount, auction, userCurrency) => {
  if (!amount) return 0;
  const rates = getCachedRates();
  if (!rates) return amount;
  const base = auction.baseCurrency;
  const rate = rates[base]?.rates[userCurrency];
  if (!rate) return amount;
  return parseFloat((amount * rate).toFixed(2));
};

/**
 * @desc    Make an offer on an auction
 * @route   POST /api/v1/auctions/offer/:id
 * @access  Private
 */
export const makeOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, message, currency } = req.body;
    const buyer = req.user;

    // Check if user has a valid payment method
    if (!buyer?.stripeCustomerId || !buyer?.paymentMethodId || !buyer?.isPaymentVerified) {
      return res.status(403).json({
        success: false,
        message: "Please add a valid payment method before making an offer.",
        redirectTo: `/${buyer?.userType || 'bidder'}/billing`,
        errorCode: 'PAYMENT_METHOD_REQUIRED'
      });
    }

    // Verify the payment method is still valid with Stripe
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(buyer.paymentMethodId);

      // Check if payment method is still valid
      if (paymentMethod.card?.checks?.cvc_check === 'fail' ||
        paymentMethod.card?.checks?.address_line1_check === 'fail') {
        console.warn(`User ${buyer._id} has a payment method with potential issues`);
      }
    } catch (error) {
      console.error(`Payment method verification failed for user ${buyer._id}:`, error);
      return res.status(403).json({
        success: false,
        message: "Your payment method is no longer valid. Please update your payment information.",
        redirectTo: `/${buyer?.userType || 'bidder'}/billing`,
        errorCode: 'PAYMENT_METHOD_INVALID'
      });
    }

    // ✅ NEW: Verify the user has a valid Stripe customer
    try {
      await stripe.customers.retrieve(buyer.stripeCustomerId);
    } catch (error) {
      console.error(`Stripe customer not found for user ${buyer._id}:`, error);
      return res.status(403).json({
        success: false,
        message: "Your payment setup is incomplete. Please add your payment method again.",
        redirectTo: `/${buyer?.userType || 'bidder'}/billing`,
        errorCode: 'STRIPE_CUSTOMER_INVALID'
      });
    }

    // Your existing validations...
    if (!buyer?.isActive) {
      return res.status(400).json({
        success: false,
        message: `Account is inactive. Can't send an offer.`,
      });
    }

    if (!buyer?.isVerified) {
      return res.status(400).json({
        success: false,
        message: `Please wait until administrator has verified your account before making an offer.`,
      });
    }

    // Find auction
    const auction = await Auction.findById(id)
      .populate("seller", "username companyName firstName lastName email")
      .populate("offers.buyer", "username companyName firstName lastName email");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Check if user is seller
    if (auction.seller._id.toString() === buyer._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot make an offer on your own auction",
      });
    }

    const isPostAuction = auction.status === "reserve_not_met";

    // allowOffers bypassed for post-auction recovery offers
    if (!auction.allowOffers && !isPostAuction) {
      return res.status(400).json({
        success: false,
        message: "This auction does not accept offers",
      });
    }

    if (auction.status !== "active" && !isPostAuction) {
      return res.status(400).json({
        success: false,
        message: `Cannot make offer. Auction status: ${auction.status}`,
      });
    }

    // Only live auctions care about end date
    if (!isPostAuction && new Date() > auction.endDate) {
      return res.status(400).json({
        success: false,
        message: "Auction has ended",
      });
    }

    // Validate offer amount
    const offerAmount = parseFloat(amount);
    if (isNaN(offerAmount) || offerAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid offer amount",
      });
    }

    // --- Currency conversion ---
    const rates = getCachedRates();
    if (!rates) return res.status(503).json({ success: false, message: "Rates unavailable" });
    const base = auction.baseCurrency;
    const buyerCurr = currency;
    const rate = rates[buyerCurr]?.rates[base];
    if (!rate) return res.status(400).json({ success: false, message: "Cannot convert currency" });
    const amountInBase = parseFloat(amount) * rate;

    // Check minimum offer (now using converted value)
    if (amountInBase < auction.startPrice) {
      return res.status(400).json({
        success: false,
        message: `Offer must be at least ${currency === 'GBP' ? '£' : '€'}${(auction.startPrice / rate).toFixed(2)} in your currency.`,
      });
    }

    // Check buy now price (convert buyNowPrice to user's currency for comparison)
    if (auction.buyNowPrice) {
      const buyNowInUserCurrency = auction.buyNowPrice / rate;
      if (parseFloat(amount) >= buyNowInUserCurrency) {
        return res.status(400).json({
          success: false,
          message: `Your offer is higher than the Buy Now price (${currency === 'GBP' ? '£' : '€'}${buyNowInUserCurrency.toFixed(2)}). Consider using Buy Now instead.`,
        });
      }
    }

    // Check for existing pending offer from same buyer
    const existingPendingOffer = auction.offers.find(
      (offer) =>
        offer.buyer._id.toString() === buyer._id.toString() &&
        offer.status === "pending"
    );

    if (existingPendingOffer) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending offer on this auction",
      });
    }

    // Make the offer
    await auction.makeOffer(
      buyer._id,
      buyer.username || buyer.companyName,
      amountInBase,
      message || ""
    );

    // Save auction
    await auction.save();

    // Populate updated auction
    const updatedAuction = await Auction.findById(id)
      .populate("offers.buyer", "email username companyName firstName lastName")
      .populate("seller", "email username companyName firstName lastName");

    // --- Convert the auction prices to user's currency for response ---
    const userCurrency = currency;
    const auctionObj = updatedAuction.toObject();
    const convert = (value) => (value !== null && value !== undefined) ? value * rate : null;

    const convertedStartPrice = convertPrice(auction, userCurrency, 'startPrice');
    const convertedCurrentPrice = convertPrice(auction, userCurrency, 'currentPrice');
    const convertedBidIncrement = auctionObj.bidIncrement ? convertPrice(auction, userCurrency, 'bidIncrement') : null;
    const convertedBuyNowPrice = auctionObj.buyNowPrice ? convertPrice(auction, userCurrency, 'buyNowPrice') : null;
    const convertedReservePrice = auctionObj.reservePrice ? convertPrice(auction, userCurrency, 'reservePrice') : null;
    const convertedFinalPrice = auctionObj.finalPrice ? convertPrice(auction, userCurrency, 'finalPrice') : null;

    const convertedAuction = {
      ...auctionObj,
      convertedStartPrice: convertedStartPrice !== null ? parseFloat(convertedStartPrice.toFixed(2)) : null,
      convertedCurrentPrice: convertedCurrentPrice !== null ? parseFloat(convertedCurrentPrice.toFixed(2)) : null,
      convertedBidIncrement: convertedBidIncrement !== null ? parseFloat(convertedBidIncrement.toFixed(2)) : null,
      convertedBuyNowPrice: convertedBuyNowPrice !== null ? parseFloat(convertedBuyNowPrice.toFixed(2)) : null,
      convertedReservePrice: convertedReservePrice !== null ? parseFloat(convertedReservePrice.toFixed(2)) : null,
      convertedFinalPrice: convertedFinalPrice !== null ? parseFloat(convertedFinalPrice.toFixed(2)) : null,
      displayCurrency: userCurrency
    };

    broadcastAuctionChange(id);

    res.status(201).json({
      success: true,
      message: "Offer submitted successfully",
      data: { auction: forViewer(convertedAuction, req.user) },
    });

    offerConfirmationEmail(
      buyer?.email,
      buyer?.firstName || buyer?.username || buyer?.companyName,
      updatedAuction,
      offerAmount,
      convertedStartPrice || convertedBuyNowPrice,
      updatedAuction?._id,
      userCurrency
    ).catch((error) => console.error("Failed to send buyer email:", error));

    newOfferNotificationEmail(
      updatedAuction?.seller,
      updatedAuction,
      convertAmountToBase(offerAmount, userCurrency, auction),
      buyer,
      updatedAuction.baseCurrency
    ).catch((error) => console.error("Failed to send seller email:", error));
  } catch (error) {
    console.error("Make offer error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to submit offer",
    });
  }
};

/**
 * @desc  Buyer counters the seller's counter offer
 * @route POST /api/v1/offers/auction/:auctionId/offer/:offerId/buyer-counter
 * @access Private (Buyer)
 */
export const buyerCounterOffer = async (req, res) => {
  try {
    const { auctionId, offerId } = req.params;
    const { amount, message = "" } = req.body; // amount in BUYER's currency
    const buyerId = req.user._id;
    const buyerCurrency = req.user.currency || "EUR";

    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email currency")
      .populate("seller", "username companyName firstName lastName email currency");

    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });

    const offer = auction.offers.id(offerId);
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

    if (offer.buyer._id.toString() !== buyerId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    if (offer.status !== "countered") {
      return res.status(400).json({ success: false, message: "No active counter to respond to" });
    }

    // Convert buyer currency → base
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid counter amount" });
    }

    const rates = getCachedRates();
    const base = auction.baseCurrency;
    const rate = rates?.[buyerCurrency]?.rates?.[base];
    if (!rate) return res.status(400).json({ success: false, message: "Currency conversion failed" });
    const amountInBase = parseFloat((numAmount * rate).toFixed(2));

    if (amountInBase < auction.startPrice) {
      return res.status(400).json({
        success: false,
        message: `Counter cannot be lower than the starting price`,
      });
    }
    // if (offer.counterOffer?.amount && amountInBase >= offer.counterOffer.amount) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Your counter must be lower than the seller's counter",
    //   });
    // }

    const prevCounterAmountInBase = offer.counterOffer?.amount || 0;

    await auction.buyerCounterOffer(offerId, buyerId, amountInBase, message);
    await auction.save();

    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName email firstName lastName currency")
      .populate("seller", "username companyName email firstName lastName currency")
      .populate("winner", "username companyName email firstName lastName currency");

    res.status(200).json({
      success: true,
      message: "Counter offer sent to seller",
      data: { auction: forViewer(updatedAuction, req.user) },
    });

    // Email seller (non-blocking) — reuse your existing newOfferNotificationEmail
    // Notify seller that buyer counter-countered
    try {
      const sellerCurrency = updatedAuction.seller.currency || "EUR";
      const baseToSeller = rates?.[base]?.rates?.[sellerCurrency] || 1;

      buyerCounteredEmail(
        updatedAuction.seller.email,
        updatedAuction.seller.firstName || updatedAuction.seller.username || updatedAuction.seller.companyName,
        sellerCurrency,
        req.user,
        updatedAuction,
        parseFloat((prevCounterAmountInBase * baseToSeller).toFixed(2)),
        parseFloat((amountInBase * baseToSeller).toFixed(2)),
        message,
        offer._id
      ).catch((e) => console.error("buyer countered email:", e));
    } catch (e) {
      console.error(e);
    }
  } catch (error) {
    console.error("Buyer counter offer error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to send counter offer" });
  }
};

/**
 * @desc    Get user's offers for an auction
 * @route   GET /api/v1/auctions/:id/offers/my
 * @access  Private
 */
export const getMyOffers = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userCurrency = req.query.currency || 'EUR';

    const auction = await Auction.findById(id).populate(
      "offers.buyer",
      "username companyName email firstName lastName"
    );

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    const rates = getCachedRates();
    const base = auction.baseCurrency;
    const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

    // Filter user's offers and add converted amount
    const userOffers = auction.offers
      .filter((offer) => offer.buyer._id.toString() === userId.toString())
      .map((offer) => ({
        ...offer.toObject(),
        convertedAmount: offer.amount * rate,
        displayCurrency: userCurrency,
        originalAmount: offer.amount,
        originalCurrency: auction.baseCurrency,
        // Also convert counter offer if exists
        convertedCounterAmount: offer.counterOffer?.amount ? offer.counterOffer.amount * rate : null,
      }));

    // Convert auction prices using convertPrice
    const auctionObj = auction.toObject();
    const convertedStartPrice = convertPrice(auction, userCurrency, 'startPrice');
    const convertedCurrentPrice = convertPrice(auction, userCurrency, 'currentPrice');
    const convertedBuyNowPrice = convertPrice(auction, userCurrency, 'buyNowPrice');

    res.status(200).json({
      success: true,
      data: {
        offers: userOffers,
        auction: {
          _id: auction._id,
          title: auction.title,
          status: auction.status,
          convertedStartPrice,
          convertedCurrentPrice,
          convertedBuyNowPrice,
          displayCurrency: userCurrency,
        },
        baseCurrency: auction.baseCurrency,
        displayCurrency: userCurrency,
      },
    });
  } catch (error) {
    console.error("Get my offers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your offers",
    });
  }
};

/**
 * @desc    Get all offers for seller's auction
 * @route   GET /api/v1/auctions/:id/offers/seller
 * @access  Private (Seller only)
 */
export const getAuctionOffersForSeller = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user._id;
    const userCurrency = req.query.currency || 'EUR';

    const auction = await Auction.findById(id).populate(
      "offers.buyer",
      "username companyName firstName lastName email"
    );

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    if (auction.seller.toString() !== sellerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view offers for this auction",
      });
    }

    const rates = getCachedRates();
    const base = auction.baseCurrency;
    const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

    // Sort offers: pending first, then by amount descending (original amount)
    const sortedOffers = auction.offers
      .sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return b.amount - a.amount;
      })
      .map((offer) => ({
        ...offer.toObject(),
        convertedAmount: offer.amount * rate,
        displayCurrency: userCurrency,
        originalAmount: offer.amount,
        originalCurrency: auction.baseCurrency,
      }));

    res.status(200).json({
      success: true,
      data: {
        auction: {
          _id: auction._id,
          title: auction.title,
          status: auction.status,
          startPrice: auction.startPrice,
          buyNowPrice: auction.buyNowPrice,
          allowOffers: auction.allowOffers,
          baseCurrency: auction.baseCurrency,
        },
        offers: sortedOffers,
        displayCurrency: userCurrency,
        stats: {
          total: auction.offers.length,
          pending: auction.offers.filter((o) => o.status === "pending").length,
          accepted: auction.offers.filter((o) => o.status === "accepted").length,
          rejected: auction.offers.filter((o) => o.status === "rejected").length,
          countered: auction.offers.filter((o) => o.status === "countered").length,
          expired: auction.offers.filter((o) => o.status === "expired").length,
        },
      },
    });
  } catch (error) {
    console.error("Get auction offers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch auction offers",
    });
  }
};

/**
 * @desc    Seller responds to an offer (accept/reject/counter)
 * @route   POST /api/v1/auctions/:auctionId/offers/:offerId/respond
 * @access  Private (Seller only)
 */
export const respondToOffer = async (req, res) => {
  try {
    const { auctionId, offerId } = req.params;
    const { response, counterAmount, counterMessage } = req.body;
    const sellerId = req.user._id;

    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email currency")
      .populate("seller", "username companyName firstName lastName email currency");

    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });
    if (auction.seller._id.toString() !== sellerId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    if (auction.status !== "active" && auction.status !== "reserve_not_met") {
      return res.status(400).json({ success: false, message: `Cannot respond. Auction status: ${auction.status}` });
    }

    const offer = auction.offers.id(offerId);
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

    const validResponses = ["accept", "reject", "counter"];
    if (!validResponses.includes(response)) {
      return res.status(400).json({ success: false, message: "Invalid response" });
    }

    // ✅ Convert counter amount from seller's currency → auction base currency
    let counterAmountInBase = null;
    if (response === "counter") {
      const counterAmountValue = parseFloat(counterAmount);
      if (isNaN(counterAmountValue) || counterAmountValue <= 0) {
        return res.status(400).json({ success: false, message: "Valid counter amount is required" });
      }

      const rates = getCachedRates();
      const base = auction.baseCurrency;
      const sellerCurrency = req.user.currency || 'EUR';
      const rate = rates?.[sellerCurrency]?.rates?.[base] || 1;
      counterAmountInBase = parseFloat((counterAmountValue * rate).toFixed(2));

      if (counterAmountInBase <= offer.amount) {
        return res.status(400).json({
          success: false,
          message: "Counter offer must be higher than the original offer",
        });
      }
      if (auction.buyNowPrice && counterAmountInBase >= auction.buyNowPrice) {
        return res.status(400).json({
          success: false,
          message: "Counter offer cannot exceed Buy Now price",
        });
      }
    }

    await auction.respondToOffer(offerId, response, counterAmountInBase, counterMessage || "");
    await auction.save();

    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName email firstName lastName currency")
      .populate("seller", "username companyName email firstName lastName currency")
      .populate("winner", "username companyName email firstName lastName currency");

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: `Offer ${response}ed successfully`,
      data: { auction: updatedAuction },
    });

    // Email notifications (non-blocking)
    try {
      if (response === "accept") {
        offerAcceptedEmail(
          offer.buyer.email,
          offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName,
          offer.buyer.currency,
          updatedAuction.seller,
          updatedAuction,
          offer.amount,
          offer._id
        ).catch((e) => console.error("accept email:", e));

        sendAuctionEndedSellerEmail(updatedAuction).catch(() => { });
        sendAuctionWonEmail(updatedAuction).catch(() => { });
      } else if (response === "reject") {
        offerRejectedEmail(
          offer.buyer.email,
          offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName,
          offer.buyer.currency,
          updatedAuction.seller,
          updatedAuction,
          offer.amount,
          offer._id,
          counterMessage || "Your offer was rejected by the seller."
        ).catch((e) => console.error("reject email:", e));
      } else if (response === "counter") {
        // ✅ NEW: notify buyer of the counter offer
        const buyerCurrency = offer.buyer.currency || "EUR";
        const sellerCurrency = updatedAuction.seller.currency || "EUR";
        const rates = getCachedRates();

        // Convert both amounts from base → buyer currency for the buyer email
        const baseToBuyer = rates?.[updatedAuction.baseCurrency]?.rates?.[buyerCurrency] || 1;
        const originalInBuyer = parseFloat((offer.amount * baseToBuyer).toFixed(2));
        const counterInBuyer = parseFloat((counterAmountInBase * baseToBuyer).toFixed(2));

        offerCounteredEmail(
          offer.buyer.email,
          offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName,
          buyerCurrency,
          updatedAuction.seller,
          updatedAuction,
          originalInBuyer,
          counterInBuyer,
          counterMessage || "",
          offer._id,
          offer.expiresAt
        ).catch((e) => console.error("counter email:", e));
      }
    } catch (emailError) {
      console.error("Email error:", emailError);
    }
  } catch (error) {
    console.error("Respond to offer error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to respond" });
  }
};

/**
 * @desc Buyer accepts OR rejects a seller's counter offer
 * @route POST /api/v1/offers/auction/:auctionId/offer/:offerId/respond-to-counter
 * @access Private (Buyer)
 */
export const respondToCounterOffer = async (req, res) => {
  try {
    const { auctionId, offerId } = req.params;
    const { accept } = req.body; // boolean
    const buyerId = req.user._id;

    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email currency")
      .populate("seller", "username companyName firstName lastName email currency");

    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });

    const offer = auction.offers.id(offerId);
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });

    if (offer.buyer._id.toString() !== buyerId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to respond to this counter" });
    }
    if (offer.status !== "countered") {
      return res.status(400).json({ success: false, message: "This offer is not in countered status" });
    }
    if (offer.expiresAt && new Date() > offer.expiresAt) {
      return res.status(400).json({ success: false, message: "This counter offer has expired" });
    }

    const isAccept = accept === true || accept === "true";

    await auction.respondToCounterOffer(offerId, isAccept);
    await auction.save();

    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName email firstName lastName currency")
      .populate("seller", "username companyName email firstName lastName currency")
      .populate("winner", "username companyName email firstName lastName currency");

    res.status(200).json({
      success: true,
      message: isAccept
        ? "Counter offer accepted! Auction is now sold to you."
        : "Counter offer declined.",
      data: { auction: updatedAuction },
    });

    // Notify seller (and buyer on accept)
    try {
      if (isAccept) {
        sendAuctionEndedSellerEmail(updatedAuction).catch(() => { });
        sendAuctionWonEmail(updatedAuction).catch(() => { });

        // Notify seller that buyer accepted their counter
        offerAcceptedEmail(
          updatedAuction.seller.email,   // ← send to seller this time
          updatedAuction.seller.firstName || updatedAuction.seller.username || updatedAuction.seller.companyName,
          updatedAuction.seller.currency || "EUR",
          updatedAuction.seller,
          updatedAuction,
          offer.counterOffer?.amount || offer.amount,
          offer._id
        ).catch((e) => console.error("accept-to-seller email:", e));
      } else {
        // ✅ NEW: notify seller that buyer declined their counter
        const sellerCurrency = updatedAuction.seller.currency || "EUR";
        const rates = getCachedRates();
        const baseToSeller = rates?.[updatedAuction.baseCurrency]?.rates?.[sellerCurrency] || 1;
        const counterInSeller = parseFloat(
          ((offer.counterOffer?.amount || 0) * baseToSeller).toFixed(2)
        );

        counterOfferRejectedEmail(
          updatedAuction.seller.email,
          updatedAuction.seller.firstName || updatedAuction.seller.username || updatedAuction.seller.companyName,
          sellerCurrency,
          offer.buyer,
          updatedAuction,
          counterInSeller,
          offer._id
        ).catch((e) => console.error("counter rejected email:", e));
      }
    } catch (e) {
      console.error("Counter response email error:", e);
    }
  } catch (error) {
    console.error("respondToCounterOffer error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to respond to counter offer" });
  }
};

/**
 * @desc    Buyer accepts a counter offer
 * @route   POST /api/v1/auctions/:auctionId/offers/:offerId/accept-counter
 * @access  Private
 */
export const acceptCounterOffer = async (req, res) => {
  try {
    const { offerId } = req.params; // Changed from auctionId to getting from body
    const { auctionId } = req.body; // Get auctionId from body
    const buyerId = req.user._id;

    // Find auction
    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email")
      .populate("seller", "username companyName firstName lastName email");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Find the offer
    const offer = auction.offers.id(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Verify user is the buyer who made the offer
    if (offer.buyer._id.toString() !== buyerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to accept this counter offer",
      });
    }

    // Validate offer status
    if (offer.status !== "countered") {
      return res.status(400).json({
        success: false,
        message: "This offer is not in countered status",
      });
    }

    // Check if counter offer has expired
    if (new Date() > offer.expiresAt) {
      return res.status(400).json({
        success: false,
        message: "This counter offer has expired",
      });
    }

    // Accept the counter offer
    await auction.respondToCounterOffer(offerId, true);

    // Save auction
    await auction.save();

    // Populate updated auction
    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName email firstName lastName")
      .populate("seller", "username companyName email firstName lastName")
      .populate("winner", "username companyName email firstName lastName");

    // Send email notification to seller
    try {
      offerAcceptedEmail(
        offer.buyer.email,
        offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName,
        offer.buyer.currency,
        updatedAuction.seller,
        updatedAuction,
        offer.amount,
        offer?._id
      ).catch(err => console.error("failed to send offer accepted email:", err));;
    } catch (emailError) {
      console.error(
        "Failed to send acceptance notification email:",
        emailError
      );
      // Don't fail the request if email fails
    }

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message:
        "Counter offer accepted successfully! Auction is now sold to you.",
      data: {
        auction: forViewer(updatedAuction, req.user),
      },
    });
  } catch (error) {
    console.error("Accept counter offer error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to accept counter offer",
    });
  }
};

/**
 * @desc    Buyer withdraws their offer
 * @route   POST /api/v1/auctions/:auctionId/offers/:offerId/withdraw
 * @access  Private
 */
export const withdrawOffer = async (req, res) => {
  try {
    const { offerId, auctionId } = req.params; // Changed from auctionId to getting from body
    const buyerId = req.user._id;

    // Find auction
    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email")
      .populate("seller", "username companyName firstName lastName email");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Find the offer
    const offer = auction.offers.id(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Verify user is the buyer who made the offer
    if (offer.buyer._id.toString() !== buyerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to withdraw this offer",
      });
    }

    // Validate offer status
    if (offer.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending offers can be withdrawn",
      });
    }

    // Withdraw the offer
    await auction.withdrawOffer(offerId, buyerId);

    // Save auction
    await auction.save();

    // Populate updated auction
    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName email firstName lastName")
      .populate("seller", "username companyName email firstName lastName");

    // Send email notification to seller
    // try {
    //   await offerWithdrawnEmail(
    //     auction.seller.email,
    //     auction.seller.firstName || auction.seller.username,
    //     offer.buyer.username,
    //     offer.amount,
    //     auction.title,
    //     auction._id
    //   );
    // } catch (emailError) {
    //   console.error(
    //     "Failed to send withdrawal notification email:",
    //     emailError
    //   );
    //   // Don't fail the request if email fails
    // }

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: "Offer withdrawn successfully",
      data: {
        auction: forViewer(updatedAuction, req.user),
      },
    });
  } catch (error) {
    console.error("Withdraw offer error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to withdraw offer",
    });
  }
};

/**
 * @desc    Get all user's offers across all auctions
 * @route   GET /api/v1/offers/my
 * @access  Private
 */
export const getAllMyOffers = async (req, res) => {
  try {
    const userId = req.user._id;
    const userCurrency = req.query.currency || 'EUR';

    const auctions = await Auction.find({
      "offers.buyer": userId,
    })
      .populate("offers.buyer", "username companyName email firstName lastName")
      .populate("seller", "username companyName email firstName lastName")
      .sort({ createdAt: -1 });

    const rates = getCachedRates();

    // Extract and flatten offers with conversion
    const allOffers = [];
    for (const auction of auctions) {
      const base = auction.baseCurrency;
      const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

      const userOffers = auction.offers
        .filter((offer) => offer.buyer._id.toString() === userId.toString())
        .map((offer) => {
          // Convert counter offer amount if exists
          let convertedCounterAmount = null;
          if (offer.counterOffer?.amount) {
            convertedCounterAmount = offer.counterOffer.amount * rate;
          }

          return {
            ...offer.toObject(),
            convertedAmount: offer.amount * rate,
            convertedCounterAmount: convertedCounterAmount,
            displayCurrency: userCurrency,
            originalAmount: offer.amount,
            originalCurrency: base,
            auction: {
              _id: auction._id,
              title: auction.title,
              status: auction.status,
              auctionType: auction.auctionType,
              // Convert auction prices
              convertedStartPrice: convertPrice(auction, userCurrency, 'startPrice'),
              convertedCurrentPrice: convertPrice(auction, userCurrency, 'currentPrice'),
              convertedBuyNowPrice: convertPrice(auction, userCurrency, 'buyNowPrice'),
              convertedFinalPrice: convertPrice(auction, userCurrency, 'finalPrice'),
              startPriceOriginal: auction.startPrice,
              currentPriceOriginal: auction.currentPrice,
              buyNowPriceOriginal: auction.buyNowPrice,
              finalPriceOriginal: auction.finalPrice,
              // Buyers see the seller by first name (company name in full), never their email.
              sellerUsername: publicName(auction.seller),
              seller: auction.seller ? { _id: auction.seller._id, displayName: publicName(auction.seller) } : auction.seller,
              endDate: auction.endDate,
              photos: auction.photos,
              baseCurrency: base,
              displayCurrency: userCurrency,
            },
          };
        });
      allOffers.push(...userOffers);
    }

    // Sort by creation date (newest first)
    allOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const stats = {
      total: allOffers.length,
      pending: allOffers.filter((o) => o.status === "pending").length,
      accepted: allOffers.filter((o) => o.status === "accepted").length,
      rejected: allOffers.filter((o) => o.status === "rejected").length,
      countered: allOffers.filter((o) => o.status === "countered").length,
      expired: allOffers.filter((o) => o.status === "expired").length,
      withdrawn: allOffers.filter((o) => o.status === "withdrawn").length,
    };

    res.status(200).json({
      success: true,
      data: {
        offers: allOffers,
        stats,
        displayCurrency: userCurrency,
      },
    });
  } catch (error) {
    console.error("Get all my offers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your offers",
    });
  }
};

/**
 * @desc    Get all offers for seller across all auctions
 * @route   GET /api/v1/offers/seller
 * @access  Private (Seller only)
 */
export const getAllOffersForSeller = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    const auctions = await Auction.find({ seller: sellerId })
      .populate("offers.buyer", "username companyName firstName lastName email")
      .populate("seller", "username companyName email firstName lastName")
      .sort({ createdAt: -1 });

    const allOffers = [];
    for (const auction of auctions) {
      const base = auction.baseCurrency;
      const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

      const offersWithConversion = auction.offers.map((offer) => {
        // Convert counter offer amount if exists
        let convertedCounterAmount = null;
        if (offer.counterOffer?.amount) {
          convertedCounterAmount = offer.counterOffer.amount * rate;
        }

        return {
          ...offer.toObject(),
          convertedAmount: offer.amount * rate,
          convertedCounterAmount: convertedCounterAmount,
          displayCurrency: userCurrency,
          originalAmount: offer.amount,
          originalCurrency: base,
          auction: {
            _id: auction._id,
            title: auction.title,
            status: auction.status,
            auctionType: auction.auctionType,
            // Convert auction prices using convertPrice
            convertedStartPrice: convertPrice(auction, userCurrency, 'startPrice'),
            convertedCurrentPrice: convertPrice(auction, userCurrency, 'currentPrice'),
            convertedBuyNowPrice: convertPrice(auction, userCurrency, 'buyNowPrice'),
            convertedFinalPrice: convertPrice(auction, userCurrency, 'finalPrice'),
            startPriceOriginal: auction.startPrice,
            currentPriceOriginal: auction.currentPrice,
            buyNowPriceOriginal: auction.buyNowPrice,
            finalPriceOriginal: auction.finalPrice,
            endDate: auction.endDate,
            photos: auction.photos,
            baseCurrency: base,
            displayCurrency: userCurrency,
          },
        };
      });
      allOffers.push(...offersWithConversion);
    }

    // Sort by creation date (newest first)
    allOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const stats = {
      total: allOffers.length,
      pending: allOffers.filter((o) => o.status === "pending").length,
      accepted: allOffers.filter((o) => o.status === "accepted").length,
      rejected: allOffers.filter((o) => o.status === "rejected").length,
      countered: allOffers.filter((o) => o.status === "countered").length,
      expired: allOffers.filter((o) => o.status === "expired").length,
      withdrawn: allOffers.filter((o) => o.status === "withdrawn").length,
    };

    res.status(200).json({
      success: true,
      data: {
        offers: allOffers,
        stats,
        displayCurrency: userCurrency,
      },
    });
  } catch (error) {
    console.error("Get all offers for seller error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch offers",
    });
  }
};

/**
 * @desc    Clean up expired offers (can be scheduled via cron)
 * @route   POST /api/v1/offers/cleanup-expired
 * @access  Private/Admin
 */
export const cleanupExpiredOffers = async (req, res) => {
  try {
    const now = new Date();

    // Find auctions with pending offers that have expired
    const auctions = await Auction.find({
      "offers.status": "pending",
      "offers.expiresAt": { $lt: now },
    });

    let cleanedCount = 0;

    for (const auction of auctions) {
      let changed = false;

      auction.offers.forEach((offer) => {
        if (offer.status === "pending" && new Date(offer.expiresAt) < now) {
          offer.status = "expired";
          offer.sellerResponse = "Offer expired";
          changed = true;
          cleanedCount++;
        }
      });

      if (changed) {
        await auction.save();
        broadcastAuctionChange(auction._id);
      }
    }

    res.status(200).json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired offers`,
      data: { cleanedCount },
    });
  } catch (error) {
    console.error("Cleanup expired offers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup expired offers",
    });
  }
};

/**
 * @desc    Get all offers across all auctions (Admin)
 * @route   GET /api/v1/offers/admin/all
 * @access  Private/Admin
 */
export const getAdminAllOffers = async (req, res) => {
  try {
    const {
      status = "all",
      category = "all",
      search = "",
      sortBy = "recent",
      page = 1,
      limit = 20,
    } = req.query;

    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    // Helper to convert amount using auction's base currency
    const convertAmount = (amount, auction) => {
      if (!amount) return 0;
      if (!rates) return amount;
      const base = auction.baseCurrency || 'EUR';
      const rate = rates[base]?.rates[userCurrency];
      if (!rate) return amount;
      return parseFloat((amount * rate).toFixed(2));
    };

    // Build filter
    const filter = {};
    if (status !== "all") filter.status = status;
    if (category !== "all") filter["auction.category"] = category;
    if (search) {
      filter.$or = [
        { "auction.title": { $regex: search, $options: "i" } },
        { buyerUsername: { $regex: search, $options: "i" } },
        { "auction.sellerUsername": { $regex: search, $options: "i" } },
      ];
    }

    // Find all auctions with offers
    const auctions = await Auction.find({
      "offers.0": { $exists: true },
    })
      .populate("seller", "username companyName firstName lastName email company phone")
      .populate("offers.buyer", "username companyName firstName lastName email company phone")
      .populate("winner", "username companyName firstName lastName email")
      .sort({ createdAt: -1 });

    // Flatten and transform offers with conversion
    let allOffers = [];
    for (const auction of auctions) {
      for (const offer of auction.offers) {
        // Convert counter offer if exists
        let convertedCounterAmount = null;
        if (offer.counterOffer?.amount) {
          convertedCounterAmount = convertAmount(offer.counterOffer.amount, auction);
        }

        allOffers.push({
          ...offer.toObject(),
          convertedAmount: convertAmount(offer.amount, auction),
          convertedCounterAmount: convertedCounterAmount,
          displayCurrency: userCurrency,
          originalAmount: offer.amount,
          originalCurrency: auction.baseCurrency,
          auction: {
            _id: auction._id,
            title: auction.title,
            category: auction.category,
            auctionType: auction.auctionType,
            status: auction.status,
            // Converted auction prices
            convertedStartPrice: convertAmount(auction.startPrice, auction),
            convertedCurrentPrice: convertAmount(auction.currentPrice, auction),
            convertedBuyNowPrice: convertAmount(auction.buyNowPrice, auction),
            convertedFinalPrice: convertAmount(auction.finalPrice, auction),
            // Original auction prices
            startPriceOriginal: auction.startPrice,
            currentPriceOriginal: auction.currentPrice,
            buyNowPriceOriginal: auction.buyNowPrice,
            finalPriceOriginal: auction.finalPrice,
            startDate: auction.startDate,
            endDate: auction.endDate,
            baseCurrency: auction.baseCurrency,
            displayCurrency: userCurrency,
            seller: {
              _id: auction.seller._id,
              username: auction.seller.username || auction.seller.companyName || '',
              companyName: auction.seller.companyName || '',
              name: `${auction.seller.firstName} ${auction.seller.lastName}`.trim(),
              email: auction.seller.email,
              phone: auction.seller.phone,
              company: auction.seller.company,
            },
            allowOffers: auction.allowOffers,
          },
        });
      }
    }

    // Apply filters (status, category, search) on the flattened array
    if (status !== "all") {
      allOffers = allOffers.filter((offer) => offer.status === status);
    }
    if (category !== "all") {
      allOffers = allOffers.filter((offer) => offer.auction.category === category);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      allOffers = allOffers.filter(
        (offer) =>
          offer.auction.title.toLowerCase().includes(searchLower) ||
          offer.buyerUsername.toLowerCase().includes(searchLower) ||
          offer.auction.seller.username.toLowerCase().includes(searchLower) ||
          offer.auction.seller.companyName.toLowerCase().includes(searchLower)
      );
    }

    // Sorting (using converted amount for amount_high/amount_low)
    allOffers.sort((a, b) => {
      switch (sortBy) {
        case "recent":
          return new Date(b.createdAt) - new Date(a.createdAt);
        case "oldest":
          return new Date(a.createdAt) - new Date(b.createdAt);
        case "amount_high":
          return b.convertedAmount - a.convertedAmount;
        case "amount_low":
          return a.convertedAmount - b.convertedAmount;
        case "expiring_soon":
          if (a.status === "pending" && b.status === "pending") {
            return new Date(a.expiresAt) - new Date(b.expiresAt);
          }
          return a.status === "pending" ? -1 : 1;
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    // Pagination
    const totalOffers = allOffers.length;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedOffers = allOffers.slice(startIndex, endIndex);

    // Statistics (using converted amounts for value calculations)
    const stats = {
      total: allOffers.length,
      pending: allOffers.filter((o) => o.status === "pending").length,
      accepted: allOffers.filter((o) => o.status === "accepted").length,
      rejected: allOffers.filter((o) => o.status === "rejected").length,
      countered: allOffers.filter((o) => o.status === "countered").length,
      expired: allOffers.filter((o) => o.status === "expired").length,
      withdrawn: allOffers.filter((o) => o.status === "withdrawn").length,
      totalValue: parseFloat(allOffers.reduce((sum, offer) => sum + (offer.convertedAmount || 0), 0).toFixed(2)),
      avgOfferAmount: allOffers.length > 0
        ? parseFloat((allOffers.reduce((sum, offer) => sum + (offer.convertedAmount || 0), 0) / allOffers.length).toFixed(2))
        : 0,
      displayCurrency: userCurrency,
    };

    // Get categories for filter
    const categories = await Auction.distinct("category", {
      "offers.0": { $exists: true },
    });

    res.status(200).json({
      success: true,
      data: {
        offers: paginatedOffers,
        stats,
        displayCurrency: userCurrency,
        filterOptions: {
          categories: ["all", ...categories],
          statuses: [
            "all", "pending", "accepted", "rejected", "countered", "expired", "withdrawn",
          ],
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalOffers / limit),
          totalOffers,
          hasNextPage: endIndex < totalOffers,
          hasPrevPage: startIndex > 0,
        },
      },
    });
  } catch (error) {
    console.error("Get admin all offers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch offers",
    });
  }
};

/**
 * @desc    Get offers for a specific auction (Admin)
 * @route   GET /api/v1/offers/admin/auction/:auctionId
 * @access  Private/Admin
 */
export const getAdminAuctionOffers = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const currency = req.query.currency || "EUR";
    const rates = getCachedRates();

    const auction = await Auction.findById(auctionId)
      .populate("seller", "username companyName firstName lastName email phone")
      .populate("offers.buyer", "username companyName firstName lastName email phone company")
      .populate("winner", "username companyName email firstName lastName");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    const base = auction.baseCurrency;
    const rate = (rates && rates[base]?.rates[currency]) || 1;

    const offersWithConversion = auction.offers
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((offer) => ({
        ...offer.toObject(),
        convertedAmount: offer.amount * rate,
        displayCurrency: currency,
        originalAmount: offer.amount,
        originalCurrency: base,
      }));

    res.status(200).json({
      success: true,
      data: {
        auction: {
          _id: auction._id,
          title: auction.title,
          status: auction.status,
          category: auction.category,
          auctionType: auction.auctionType,
          startPrice: auction.startPrice,
          buyNowPrice: auction.buyNowPrice,
          currentPrice: auction.currentPrice,
          startDate: auction.startDate,
          endDate: auction.endDate,
          baseCurrency: base,
          seller: auction.seller,
          allowOffers: auction.allowOffers,
        },
        offers: offersWithConversion,
        displayCurrency: currency,
        stats: {
          total: auction.offers.length,
          pending: auction.offers.filter((o) => o.status === "pending").length,
          accepted: auction.offers.filter((o) => o.status === "accepted").length,
          rejected: auction.offers.filter((o) => o.status === "rejected").length,
          countered: auction.offers.filter((o) => o.status === "countered").length,
          expired: auction.offers.filter((o) => o.status === "expired").length,
          withdrawn: auction.offers.filter((o) => o.status === "withdrawn").length,
        },
      },
    });
  } catch (error) {
    console.error("Get admin auction offers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch auction offers",
    });
  }
};

/**
 * @desc    Admin responds to an offer (can override seller response)
 * @route   POST /api/v1/offers/admin/:offerId/respond
 * @access  Private/Admin
 */
/**
 * @desc    Admin responds to an offer (can override seller response)
 * @route   POST /api/v1/offers/admin/:offerId/respond
 * @access  Private/Admin
 */
export const adminRespondToOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { auctionId, response, message } = req.body;
    const admin = req.user;

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to perform this action",
      });
    }

    // Find auction
    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email phone")
      .populate("seller", "username companyName firstName lastName email phone");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Find the offer
    const offer = auction.offers.id(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Validate response
    const validResponses = ["accept", "reject"];
    if (!validResponses.includes(response)) {
      return res.status(400).json({
        success: false,
        message: "Invalid response. Must be: accept or reject",
      });
    }

    // Use the auction model's respondToOffer method for proper handling
    if (response === "accept") {
      await auction.respondToOffer(
        offerId,
        "accept",
        null,
        message || "Offer accepted by administrator"
      );
    } else {
      // For reject, just update the offer status
      offer.status = "rejected";
      offer.sellerResponse = message || "Offer rejected by administrator";
      offer.updatedAt = new Date();
      await auction.save();
    }

    // Populate updated data
    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "companyName companyName firstName lastName email phone currency")
      .populate("seller", "username companyName firstName lastName email phone currency")
      .populate("winner", "username companyName firstName lastName email phone currency");

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: `Offer ${response}ed by administrator`,
      data: {
        auction: updatedAuction,
        offer:
          response === "accept" ? updatedAuction.offers.id(offerId) : offer,
      },
    });

    // Send appropriate email based on response
    if (response === "accept") {
      offerAcceptedEmail(
        offer.buyer.email,
        offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName || '',
        offer.buyer.currency,
        updatedAuction.seller,
        updatedAuction,
        offer.amount,
        offer?._id
      ).catch((error) =>
        console.error("Failed to send offer accepted email:", error)
      );

      sendAuctionEndedSellerEmail(updatedAuction).catch((error) =>
        console.error("Failed to send seller ended auction email:", error)
      );

      sendAuctionWonEmail(updatedAuction).catch((error) =>
        console.error("Failed to send buyer won auction email:", error)
      );

      auctionWonAdminEmail(admin?.email, admin?.currency, updatedAuction, offer?.buyer).catch(
        (error) =>
          console.error("Failed to send admin auction won email:", error)
      );
    } else {
      offerRejectedEmail(
        offer.buyer.email,
        offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName || '',
        offer.buyer.currency,
        updatedAuction.seller,
        updatedAuction,
        offer.amount,
        offer?._id,
        message || "Your offer was rejected by the seller."
      ).catch((error) =>
        console.error("Failed to send offer rejected email:", error)
      );
    }
  } catch (error) {
    console.error("Admin respond to offer error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to respond to offer",
    });
  }
};

/**
 * @desc    Admin cancels an offer (force withdraw)
 * @route   POST /api/v1/offers/admin/:offerId/cancel
 * @access  Private/Admin
 */
export const adminCancelOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { auctionId, reason } = req.body;

    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "email username companyName firstName lastName email currency")
      .populate("seller", "email username companyName firstName lastName email currency");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    const offer = auction.offers.id(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Save previous status for reference
    const previousStatus = offer.status;

    // Cancel the offer
    offer.status = "withdrawn";
    offer.sellerResponse = `Offer cancelled by administrator: ${reason || "Violation of terms"
      }`;
    offer.updatedAt = new Date();

    await auction.save();

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: "Offer cancelled by administrator",
      data: {
        auction: auction,
        offer: offer,
        previousStatus: previousStatus,
      },
    });

    // Send email to buyer in background
    offerCanceledEmail(
      offer.buyer.email,
      offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName || '',
      offer.buyer.currency,
      auction.seller,
      auction,
      offer.amount,
      offerId
    ).catch((error) =>
      console.error("Failed to send offer canceled email:", error)
    );
  } catch (error) {
    console.error("Admin cancel offer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel offer",
    });
  }
};

/**
 * @desc    Get admin offer statistics
 * @route   GET /api/v1/offers/admin/stats
 * @access  Private/Admin
 */
export const getAdminOfferStats = async (req, res) => {
  try {
    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    // Helper to convert amount using auction's base currency
    const convertAmount = (amount, auction) => {
      if (!amount) return 0;
      if (!rates) return amount;
      const base = auction.baseCurrency || 'EUR';
      const rate = rates[base]?.rates[userCurrency];
      if (!rate) return amount;
      return parseFloat((amount * rate).toFixed(2));
    };

    // Get total offers
    const totalAuctionsWithOffers = await Auction.countDocuments({
      "offers.0": { $exists: true },
    });

    // Get total offers count
    const totalOffersResult = await Auction.aggregate([
      { $match: { "offers.0": { $exists: true } } },
      { $project: { offersCount: { $size: "$offers" } } },
      { $group: { _id: null, total: { $sum: "$offersCount" } } },
    ]);

    const totalOffers = totalOffersResult[0]?.total || 0;

    // Get offers by status with converted amounts
    const statusStatsRaw = await Auction.aggregate([
      { $unwind: "$offers" },
      {
        $group: {
          _id: "$offers.status",
          count: { $sum: 1 },
          totalAmountOriginal: { $sum: "$offers.amount" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Convert status stats amounts
    const statusStats = {};
    for (const stat of statusStatsRaw) {
      // To convert totalAmount, we need to find a representative auction for this status
      // Since each offer may have different base currencies, we need to fetch the actual offers
      const offersForStatus = await Auction.aggregate([
        { $unwind: "$offers" },
        { $match: { "offers.status": stat._id } },
        { $project: { offerAmount: "$offers.amount", baseCurrency: 1 } },
      ]);

      let totalAmountConverted = 0;
      for (const offer of offersForStatus) {
        const converted = convertAmount(offer.offerAmount, { baseCurrency: offer.baseCurrency });
        totalAmountConverted += converted;
      }

      statusStats[stat._id] = {
        count: stat.count,
        totalAmount: parseFloat(totalAmountConverted.toFixed(2)),
        totalAmountOriginal: stat.totalAmountOriginal
      };
    }

    // Get offers by category with converted amounts
    const categoryStatsRaw = await Auction.aggregate([
      { $match: { "offers.0": { $exists: true } } },
      { $unwind: "$offers" },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          avgAmountOriginal: { $avg: "$offers.amount" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Convert category stats amounts
    const categoryStats = [];
    for (const stat of categoryStatsRaw) {
      // Get all offers for this category to calculate converted average
      const offersForCategory = await Auction.aggregate([
        { $match: { category: stat._id, "offers.0": { $exists: true } } },
        { $unwind: "$offers" },
        { $project: { offerAmount: "$offers.amount", baseCurrency: 1 } },
      ]);

      let totalAmountConverted = 0;
      for (const offer of offersForCategory) {
        totalAmountConverted += convertAmount(offer.offerAmount, { baseCurrency: offer.baseCurrency });
      }

      const avgAmountConverted = offersForCategory.length > 0 ? totalAmountConverted / offersForCategory.length : 0;

      categoryStats.push({
        category: stat._id,
        count: stat.count,
        avgAmount: parseFloat(avgAmountConverted.toFixed(2)),
        avgAmountOriginal: stat.avgAmountOriginal,
      });
    }

    // Get recent activity with converted amounts
    const recentOffersRaw = await Auction.aggregate([
      { $match: { "offers.0": { $exists: true } } },
      { $unwind: "$offers" },
      { $sort: { "offers.createdAt": -1 } },
      { $limit: 5 },
      {
        $project: {
          title: 1,
          offer: "$offers",
          baseCurrency: 1,
        },
      },
    ]);

    const recentOffers = recentOffersRaw.map(item => ({
      title: item.title,
      offer: {
        ...item.offer,
        convertedAmount: convertAmount(item.offer.amount, { baseCurrency: item.baseCurrency }),
        originalAmount: item.offer.amount,
      },
    }));

    // Calculate success rate (no conversion needed for counts)
    const successStats = await Auction.aggregate([
      { $unwind: "$offers" },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          accepted: {
            $sum: {
              $cond: [{ $eq: ["$offers.status", "accepted"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const successRate =
      successStats[0]?.total > 0
        ? Math.round((successStats[0]?.accepted / successStats[0]?.total) * 100)
        : 0;

    res.status(200).json({
      success: true,
      data: {
        totalAuctionsWithOffers,
        totalOffers,
        statusStats,
        categoryStats,
        recentActivity: recentOffers,
        successRate,
        averageOffersPerAuction:
          totalAuctionsWithOffers > 0
            ? Math.round(totalOffers / totalAuctionsWithOffers)
            : 0,
        displayCurrency: userCurrency,
      },
    });
  } catch (error) {
    console.error("Get admin offer stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch offer statistics",
    });
  }
};

/**
 * @desc    Admin ends auction by accepting an offer (with audit trail)
 * @route   POST /api/v1/offers/admin/:offerId/end-auction
 * @access  Private/Admin
 */
export const adminEndAuctionWithOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { auctionId, reason } = req.body;
    const adminId = req.user._id;

    // Find auction
    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email phone")
      .populate("seller", "username companyName firstName lastName email phone")
      .populate("currentBidder", "username companyName firstName lastName email phone");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Find the offer
    const offer = auction.offers.id(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Validate auction can be ended
    if (auction.status === "sold" || auction.status === "sold_buy_now") {
      return res.status(400).json({
        success: false,
        message: "Auction is already sold",
      });
    }

    if (auction.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Cannot end inactive auction. Current status: ${auction.status}`,
      });
    }

    // Accept the offer and end auction using the model's method
    await auction.respondToOffer(
      offerId,
      "accept",
      null,
      reason || "Auction ended by administrator via offer acceptance"
    );

    // Add admin audit trail
    auction.endedBy = adminId;
    auction.endedReason = reason || "Admin ended via offer acceptance";
    await auction.save();

    // Populate updated auction
    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email phone")
      .populate("seller", "username companyName firstName lastName email phone")
      .populate("winner", "username companyName firstName lastName email phone")
      .populate("endedBy", "username companyName email firstName lastName");

    // Handle bid payments cleanup if there were bids
    if (auction.bidCount > 0) {
      try {
        // Import and use your existing payment cleanup function
        const { cancelAllBidderAuthorizations } = await import(
          "../controllers/bidPayment.controller.js"
        );
        await cancelAllBidderAuthorizations(auctionId);
        console.log(
          `✅ Cancelled bidder authorizations for auction ${auctionId}`
        );
      } catch (paymentError) {
        console.error("Error cancelling bidder authorizations:", paymentError);
        // Continue even if payment cleanup fails
      }
    }

    // Send notifications
    // try {
    //   // Notify buyer
    //   await auctionEndedByAdminEmail(
    //     offer.buyer.email,
    //     offer.buyer.firstName || offer.buyer.username,
    //     offer.amount,
    //     auction.title,
    //     auction._id,
    //     req.user.username,
    //     reason || "Administrative action"
    //   );

    //   // Notify seller
    //   await auctionEndedByAdminSellerEmail(
    //     auction.seller.email,
    //     auction.seller.firstName || auction.seller.username,
    //     offer.amount,
    //     auction.title,
    //     auction._id,
    //     req.user.username,
    //     reason || "Administrative action"
    //   );

    //   // Notify all bidders if any
    //   if (auction.bidCount > 0) {
    //     const uniqueBidderIds = [
    //       ...new Set(auction.bids.map((bid) => bid.bidder.toString())),
    //     ];
    //     for (const bidderId of uniqueBidderIds) {
    //       if (bidderId !== offer.buyer._id.toString()) {
    //         const bidder = await User.findById(bidderId);
    //         if (bidder) {
    //           await auctionEndedByAdminBidderEmail(
    //             bidder.email,
    //             bidder.username,
    //             auction.title,
    //             auction._id,
    //             req.user.username,
    //             reason || "Administrative action"
    //           );
    //         }
    //       }
    //     }
    //   }
    // } catch (emailError) {
    //   console.error("Failed to send notification emails:", emailError);
    // }

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: "Auction ended successfully via offer acceptance",
      data: {
        auction: updatedAuction,
        offer: updatedAuction.offers.id(offerId),
        action: {
          performedBy: req.user.username || req.user.companyName || req.user.firstName || '',
          reason: reason || "Administrative action",
          timestamp: new Date(),
        },
      },
    });
  } catch (error) {
    console.error("Admin end auction with offer error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to end auction via offer",
    });
  }
};

/**
 * @desc    Reactivate and accept a rejected offer
 * @route   POST /api/v1/offers/:offerId/reactivate
 * @access  Private (Seller or Admin)
 */
export const reactivateOffer = async (req, res) => {
  try {
    const { offerId } = req.params;
    const { auctionId, reason } = req.body;
    const user = req.user;
    const isAdmin = user.userType === 'admin';

    // Find auction
    const auction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email phone")
      .populate("seller", "username companyName firstName lastName email phone");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Verify permissions
    if (!isAdmin && auction.seller._id.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to reactivate offers for this auction",
      });
    }

    // Use the reactivate method
    await auction.reactivateAndAcceptOffer(offerId, user._id, isAdmin);

    // Save auction
    await auction.save();

    // Populate updated auction
    const updatedAuction = await Auction.findById(auctionId)
      .populate("offers.buyer", "username companyName firstName lastName email phone currency")
      .populate("seller", "username companyName firstName lastName email phone currency")
      .populate("winner", "username companyName firstName lastName email phone currency");

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: "Offer reactivated and accepted successfully",
      data: {
        auction: updatedAuction,
        offer: updatedAuction.offers.id(offerId),
        reactivatedBy: user.username || user.companyName || user.firstName,
        reactivatedAt: new Date(),
      },
    });

    // Send email notifications
    const offer = updatedAuction.offers.id(offerId);
    try {
      // Notify buyer
      offerAcceptedEmail(
        offer.buyer.email,
        offer.buyer.firstName || offer.buyer.username || offer.buyer.companyName || '',
        offer.buyer.currency,
        updatedAuction.seller,
        updatedAuction,
        offer.amount,
        offer?._id
      ).catch((error) =>
        console.error("Failed to send offer accepted email:", error)
      );

      // Notify seller (if admin did it)
      if (isAdmin) {
        sendAuctionEndedSellerEmail(updatedAuction).catch((error) =>
          console.error("Failed to send seller ended auction email:", error)
        );
      }

      sendAuctionWonEmail(updatedAuction).catch((error) =>
        console.error("Failed to send buyer won auction email:", error)
      );
    } catch (emailError) {
      console.error("Failed to send reactivation emails:", emailError);
    }
  } catch (error) {
    console.error("Reactivate offer error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to reactivate offer",
    });
  }
};

/**
 * @desc    Get seller offer statistics
 * @route   GET /api/v1/offers/seller/stats
 * @access  Private (Seller only)
 */
export const getSellerOfferStats = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const userCurrency = req.query.currency || 'EUR';

    // Find all auctions where user is seller
    const auctions = await Auction.find({
      seller: sellerId,
      "offers.0": { $exists: true }
    });

    // Helper to convert raw amounts
    const convertRawAmount = (amount, auction) => {
      if (!amount) return 0;
      const rates = getCachedRates();
      if (!rates) return amount;
      const base = auction.baseCurrency;
      const rate = rates[base]?.rates[userCurrency];
      if (!rate) return amount;
      return parseFloat((amount * rate).toFixed(2));
    };

    // Flatten all offers with converted amounts
    let allOffers = [];
    auctions.forEach(auction => {
      auction.offers.forEach(offer => {
        allOffers.push({
          ...offer.toObject(),
          auctionId: auction._id,
          auctionTitle: auction.title,
          auctionStatus: auction.status,
          convertedAmount: convertRawAmount(offer.amount, auction),
          originalAmount: offer.amount,
          originalCurrency: auction.baseCurrency,
          convertedCounterAmount: offer.counterOffer?.amount ? convertRawAmount(offer.counterOffer.amount, auction) : null,
        });
      });
    });

    // Calculate statistics using converted amounts
    const stats = {
      totalOffers: allOffers.length,
      pending: allOffers.filter(o => o.status === 'pending').length,
      accepted: allOffers.filter(o => o.status === 'accepted').length,
      rejected: allOffers.filter(o => o.status === 'rejected').length,
      countered: allOffers.filter(o => o.status === 'countered').length,
      expired: allOffers.filter(o => o.status === 'expired').length,
      withdrawn: allOffers.filter(o => o.status === 'withdrawn').length,

      // Total value calculations (converted)
      totalValue: parseFloat(allOffers.reduce((sum, offer) => sum + (offer.convertedAmount || 0), 0).toFixed(2)),
      acceptedValue: parseFloat(allOffers
        .filter(o => o.status === 'accepted')
        .reduce((sum, offer) => sum + (offer.convertedAmount || 0), 0)
        .toFixed(2)),
      pendingValue: parseFloat(allOffers
        .filter(o => o.status === 'pending')
        .reduce((sum, offer) => sum + (offer.convertedAmount || 0), 0)
        .toFixed(2)),

      // Average offer amount (converted)
      avgOfferAmount: allOffers.length > 0
        ? parseFloat((allOffers.reduce((sum, offer) => sum + (offer.convertedAmount || 0), 0) / allOffers.length).toFixed(2))
        : 0,

      // Success rate
      successRate: (() => {
        const responded = allOffers.filter(o =>
          ['accepted', 'rejected'].includes(o.status)
        ).length;
        const accepted = allOffers.filter(o => o.status === 'accepted').length;
        return responded > 0 ? Math.round((accepted / responded) * 100) : 0;
      })(),

      auctionsWithOffers: auctions.length,
      displayCurrency: userCurrency,

      // By auction
      byAuction: auctions.map(auction => {
        let totalValue = 0;
        let highestOffer = 0;

        auction.offers.forEach(offer => {
          const converted = convertRawAmount(offer.amount, auction);
          totalValue += converted;
          if (converted > highestOffer) highestOffer = converted;
        });

        return {
          auctionId: auction._id,
          auctionTitle: auction.title,
          auctionStatus: auction.status,
          totalOffers: auction.offers.length,
          pending: auction.offers.filter(o => o.status === 'pending').length,
          accepted: auction.offers.filter(o => o.status === 'accepted').length,
          rejected: auction.offers.filter(o => o.status === 'rejected').length,
          countered: auction.offers.filter(o => o.status === 'countered').length,
          totalValue: parseFloat(totalValue.toFixed(2)),
          highestOffer: parseFloat(highestOffer.toFixed(2)),
        };
      }),

      // Time-based stats (last 30 days)
      last30Days: (() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentOffers = allOffers.filter(o => new Date(o.createdAt) >= thirtyDaysAgo);

        return {
          total: recentOffers.length,
          pending: recentOffers.filter(o => o.status === 'pending').length,
          accepted: recentOffers.filter(o => o.status === 'accepted').length,
          totalValue: parseFloat(recentOffers.reduce((sum, offer) => sum + (offer.convertedAmount || 0), 0).toFixed(2)),
        };
      })(),

      // Category breakdown
      byCategory: (() => {
        const categoryMap = {};
        auctions.forEach(auction => {
          const categoryName = auction.categories?.[1] || auction.categories?.[0] || 'Uncategorized';

          if (!categoryMap[categoryName]) {
            categoryMap[categoryName] = {
              category: categoryName,
              totalOffers: 0,
              totalValue: 0,
              accepted: 0
            };
          }
          auction.offers.forEach(offer => {
            categoryMap[categoryName].totalOffers++;
            categoryMap[categoryName].totalValue += convertRawAmount(offer.amount, auction);
            if (offer.status === 'accepted') {
              categoryMap[categoryName].accepted++;
            }
          });
        });
        return Object.values(categoryMap).map(cat => ({
          ...cat,
          totalValue: parseFloat(cat.totalValue.toFixed(2))
        }));
      })()
    };

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get seller offer stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offer statistics'
    });
  }
};