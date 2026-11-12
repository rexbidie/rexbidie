import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import {
  uploadImageToCloudinary,
  uploadDocumentToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import agendaService from "../services/agendaService.js";
import {
  auctionSubmittedForApprovalEmail,
  auctionWonAdminEmail,
  bidConfirmationEmail,
  giveawayParticipationEmail,
  giveawayWinnerEmail,
  newBidNotificationEmail,
  outbidNotificationEmail,
  sendAuctionEndedSellerEmail,
  sendAuctionWonEmail,
  sendOutbidNotifications,
  sendWatchlistBidNotifications,
} from "../utils/nodemailer.js";
import Category from "../models/category.model.js";
import Commission from "../models/commission.model.js";
import Review from "../models/review.model.js";
import { getCachedRates } from "../routes/currency.route.js";
import Stripe from 'stripe';
import AuctionDate from "../models/auctionDate.model.js";
import { broadcastAuctionChange, broadcastAuctionRemoved } from "../services/realtimeService.js";
import { getManualPaymentFlags } from "../utils/manualPayment.js";
import { processProxyBids } from "../services/proxyBidService.js";
import { sanitizeAuctionForViewer } from "../utils/publicAuction.js";
import { minimumPriceError } from "../utils/listingRules.js";
import { calculateListingExtras } from "../utils/listingExtras.js";
import { getExtrasPricingMenu } from "../utils/listingExtras.js";

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

/**
 * @desc    Get current paid-extras pricing for a given currency
 * @route   GET /api/v1/auctions/extras/pricing?currency=GBP|EUR
 * @access  Public
 */
export const getListingExtrasPricing = async (req, res) => {
  try {
    const currency = req.query.currency === "GBP" ? "GBP" : "EUR";
    const pricing = getExtrasPricingMenu(currency);
    res.status(200).json({ success: true, data: pricing });
  } catch (error) {
    console.error("Get listing extras pricing error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
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

// Create New Auction
export const createAuction = async (req, res) => {
  try {
    const seller = req.user;

    const {
      title,
      subTitle,
      features,
      description,
      specifications,
      location,
      videoLink,
      startPrice,
      bidIncrement,
      auctionType,
      reservePrice,
      buyNowPrice,
      allowOffers,
      paymentCollectionPreference,
      vatIncluded,
      featuredRequested,
      metaBoostPackage,
      startDate,
      endDate,
    } = req.body;

    let categoriesArray = [];
    if (req.body.categories) {
      try {
        // Try to parse it as JSON first (since you're sending JSON.stringify from frontend)
        const parsed = JSON.parse(req.body.categories);
        // If parsed is an array, use it directly
        if (Array.isArray(parsed)) {
          categoriesArray = parsed;
        } else {
          categoriesArray = [parsed];
        }
      } catch (e) {
        // If it's not JSON, handle as regular string or array
        if (Array.isArray(req.body.categories)) {
          categoriesArray = req.body.categories;
        } else if (typeof req.body.categories === "string") {
          // Split by comma if it's a comma-separated string, otherwise single item
          categoriesArray = req.body.categories.includes(",")
            ? req.body.categories.split(",").map((c) => c.trim())
            : [req.body.categories];
        }
      }
    }

    // Validation
    if (!categoriesArray || categoriesArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one category is required",
      });
    }

    // Basic validation
    if (!title || !description || !auctionType) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Validate start price for all auction types
    if (!startPrice || parseFloat(startPrice) < 0) {
      return res.status(400).json({
        success: false,
        message: "Start price is required and must be positive",
      });
    }

    // Validate payment collection preference
    if (!paymentCollectionPreference) {
      return res.status(400).json({
        success: false,
        message: "Payment collection preference is required",
      });
    }

    const validPaymentMethods = ["bank_transfer", "credit_card", "buyer_decides"];
    if (!validPaymentMethods.includes(paymentCollectionPreference)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment collection preference",
      });
    }

    // Validate bid increment for standard and reserve auctions
    if (
      (auctionType === "standard" || auctionType === "reserve") &&
      (!bidIncrement || parseFloat(bidIncrement) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Bid increment is required for standard and reserve auctions",
      });
    }

    // ========== AUCTION DATE SLOT RESOLUTION ==========
    let resolvedStartDate = startDate;
    let resolvedEndDate = endDate;
    let auctionDateSlotId = null;

    const isTimedAuction =
      auctionType === "standard" || auctionType === "reserve";

    if (isTimedAuction) {
      const { auctionDateId } = req.body;

      if (!auctionDateId) {
        return res.status(400).json({
          success: false,
          message: "Please select an auction date slot",
        });
      }

      const slot = await AuctionDate.findById(auctionDateId);

      if (!slot || !slot.isActive) {
        return res.status(400).json({
          success: false,
          message: "Selected auction date slot is no longer available",
        });
      }

      if (new Date(slot.endDate) <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "Selected auction date has already closed",
        });
      }

      resolvedStartDate = slot.startDate;
      resolvedEndDate = slot.endDate;
      auctionDateSlotId = slot._id;
    } else {
      // buy_now / giveaway — keep client-provided dates as-is
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "startDate and endDate are required for this auction type",
        });
      }
    }
    // ====================================================

    // Parse specifications from JSON string to object
    let parsedSpecifications = {};
    if (specifications) {
      try {
        parsedSpecifications = JSON.parse(specifications);
      } catch (parseError) {
        console.error("Error parsing specifications:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid specifications format",
        });
      }
    }

    // Validate reserve price for reserve auctions
    if (auctionType === "reserve") {
      if (!reservePrice || parseFloat(reservePrice) < parseFloat(startPrice)) {
        return res.status(400).json({
          success: false,
          message:
            "Reserve price must be provided and greater than or equal to start price",
        });
      }
    }

    // RexBid minimums: €500 reserve / €400 no-reserve starting bid
    const minPriceErr = minimumPriceError({
      auctionType,
      startPrice,
      reservePrice,
      currency: req.body.baseCurrency || "EUR",
    });
    if (minPriceErr) {
      return res.status(400).json({ success: false, message: minPriceErr });
    }

    // Validate buy now price for buy_now auctions
    if (auctionType === "buy_now") {
      if (!buyNowPrice || parseFloat(buyNowPrice) < parseFloat(startPrice)) {
        return res.status(400).json({
          success: false,
          message:
            "Buy Now price must be provided and greater than or equal to start price",
        });
      }
    }

    // Handle file uploads
    let uploadedPhotos = [];
    let uploadedDocuments = [];
    let uploadedServiceRecords = [];

    // Upload photos
    if (req.files && req.files.photos) {
      const photos = Array.isArray(req.files.photos)
        ? req.files.photos
        : [req.files.photos];

      // Get captions from request body
      // const photoCaptions = req.body.photoCaptions || [];
      const photoCaptions = Array.isArray(req.body.photoCaptions)
        ? req.body.photoCaptions
        : [];

      for (const [index, photo] of photos.entries()) {
        try {
          const result = await uploadImageToCloudinary(
            photo.buffer,
            "auction-photos",
          );
          uploadedPhotos.push({
            url: result.secure_url,
            publicId: result.public_id,
            filename: photo.originalname,
            order: index,
            caption: photoCaptions[index] || "",
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            thumbUrl: result.thumb_url,
            thumbPublicId: result.thumb_public_id,
            thumbWidth: result.thumb_width,
            thumbHeight: result.thumb_height,
            thumbBytes: result.thumb_bytes,
          });
        } catch (uploadError) {
          console.error("Photo upload error:", uploadError);
          return res.status(400).json({
            success: false,
            message: `Failed to upload photo: ${photo.originalname}`,
          });
        }
      }
    }

    // For documents:
    if (req.files && req.files.documents) {
      const documents = Array.isArray(req.files.documents)
        ? req.files.documents
        : [req.files.documents];

      // Get document captions
      // const documentCaptions = req.body.documentCaptions || [];
      const newDocumentCaptions = Array.isArray(req.body.newDocumentCaptions)
        ? req.body.newDocumentCaptions
        : [];

      for (const [index, doc] of documents.entries()) {
        try {
          const result = await uploadDocumentToCloudinary(
            doc.buffer,
            doc.originalname,
            "auction-documents",
          );
          uploadedDocuments.push({
            url: result.secure_url,
            publicId: result.public_id,
            filename: doc.originalname,
            originalName: doc.originalname,
            resourceType: "raw",
            caption: newDocumentCaptions[index] || "", // ADD THIS
          });
        } catch (uploadError) {
          console.error("Document upload error:", uploadError);
        }
      }
    }

    // For service records:
    if (req.files && req.files.serviceRecords) {
      const serviceRecords = Array.isArray(req.files.serviceRecords)
        ? req.files.serviceRecords
        : [req.files.serviceRecords];

      // Get service record captions
      // const serviceRecordCaptions = req.body.serviceRecordCaptions || [];
      const serviceRecordCaptions = Array.isArray(
        req.body.serviceRecordCaptions,
      )
        ? req.body.serviceRecordCaptions
        : [];

      for (const [index, record] of serviceRecords.entries()) {
        try {
          const result = await uploadImageToCloudinary(
            record.buffer,
            "auction-service-records",
          );
          uploadedServiceRecords.push({
            url: result.secure_url,
            publicId: result.public_id,
            filename: record.originalname,
            originalName: record.originalname,
            order: index,
            caption: serviceRecordCaptions[index] || "",
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            thumbUrl: result.thumb_url,
            thumbPublicId: result.thumb_public_id,
            thumbWidth: result.thumb_width,
            thumbHeight: result.thumb_height,
            thumbBytes: result.thumb_bytes,
          });
        } catch (uploadError) {
          console.error("Service record upload error:", uploadError);
        }
      }
    }
    // Validate dates
    const start = new Date(resolvedStartDate);
    const end = new Date(resolvedEndDate);
    const now = new Date();

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    // Create auction data object
    const auctionData = {
      title,
      subTitle: subTitle || "",
      categories: categoriesArray,
      features: features || "",
      description,
      specifications: new Map(Object.entries(parsedSpecifications)),
      location: location || "",
      videoLink: videoLink || "",
      startPrice: parseFloat(startPrice),
      baseCurrency: req.body.baseCurrency || 'EUR',   // <-- add this
      basePrice: parseFloat(startPrice),
      startDate: start,
      endDate: end,
      auctionDate: auctionDateSlotId,
      auctionType,
      allowOffers: allowOffers === "true" || allowOffers === true,
      paymentCollectionPreference: paymentCollectionPreference || "buyer_decides",
      vatIncluded: vatIncluded === "true" || vatIncluded === true,
      featuredRequested: featuredRequested === "true" || featuredRequested === true,
      metaBoostPackage: ["boost", "plus", "max"].includes(metaBoostPackage) ? metaBoostPackage : "",
      seller: seller._id,
      sellerUsername: seller.username || seller.companyName || "",
      photos: uploadedPhotos,
      documents: uploadedDocuments,
      serviceRecords: uploadedServiceRecords,
      status:
        auctionType === "buy_now" || auctionType === "giveaway"
          ? "active"
          : "draft",
    };

    // Add bid increment for standard and reserve auctions
    if (auctionType === "standard" || auctionType === "reserve") {
      auctionData.bidIncrement = parseFloat(bidIncrement);
    }

    // Add reserve price for reserve auctions
    if (auctionType === "reserve") {
      auctionData.reservePrice = parseFloat(reservePrice);
    }

    // Add buy now price for buy_now auctions
    if (auctionType === "buy_now") {
      auctionData.buyNowPrice = parseFloat(buyNowPrice);
    }

    // Add optional bid increment for buy_now auctions if provided
    if (
      auctionType === "buy_now" &&
      bidIncrement &&
      parseFloat(bidIncrement) > 0
    ) {
      auctionData.bidIncrement = parseFloat(bidIncrement);
    }

    // ── Compute paid extras before creating the auction ──
    const extras = calculateListingExtras({
      featuredRequested: auctionData.featuredRequested,
      metaBoostPackage: auctionData.metaBoostPackage,
      currency: auctionData.baseCurrency,
    });

    // If extras are required on an always-available auction, defer activation
    // until payment lands. (Timed auctions start as draft anyway.)
    if (extras.total > 0 && (auctionType === 'buy_now' || auctionType === 'giveaway')) {
      auctionData.status = 'draft';
    }

    const auction = await Auction.create(auctionData);

    // Schedule activation job (always needed for all types)
    await agendaService.scheduleAuctionActivation(
      auction._id,
      auction.startDate,
    );

    // Only schedule end job for timed auctions (standard/reserve)
    if (
      auction.auctionType === "standard" ||
      auction.auctionType === "reserve"
    ) {
      await agendaService.scheduleAuctionEnd(auction._id, auction.endDate);
    }

    // Populate seller info for response
    await auction.populate("seller", "username companyName firstName lastName");

    // ── Extras payment flow ──
    if (extras.total > 0) {
      // Ensure seller has a Stripe customer (create one if missing)
      let customerId = seller.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: seller.email,
          name: `${seller.firstName || ''} ${seller.lastName || ''}`.trim() || seller.username,
          metadata: { userId: seller._id.toString() },
        });
        customerId = customer.id;
        await User.findByIdAndUpdate(seller._id, { stripeCustomerId: customerId });
      }

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: Math.round(extras.total * 100),
          currency: extras.currency.toLowerCase(),
          customer: customerId,
          description: `Listing extras for "${auction.title}"`,
          payment_method_types: ['card'],
          metadata: {
            type: 'listing_extras',
            auctionId: auction._id.toString(),
            sellerId: seller._id.toString(),
          },
        },
        { idempotencyKey: `listing_extras_${auction._id}` }
      );

      auction.extrasPayment = {
        amount: extras.total,
        currency: extras.currency,
        status: 'pending',
        paymentIntentId: paymentIntent.id,
        lineItems: extras.lineItems,
      };
      await auction.save();

      return res.status(201).json({
        success: true,
        message: 'Auction created — please complete payment for paid extras',
        data: {
          auction,
          payment: {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: extras.total,
            currency: extras.currency,
            lineItems: extras.lineItems,
          },
        },
      });
    }

    if (auction.status === "active") broadcastAuctionChange(auction._id);

    // No extras — return as before
    res.status(201).json({
      success: true,
      message: "Auction created successfully",
      data: { auction },
    });

    // Notify admins if needed
    // const adminUsers = await User.find({ userType: "admin" });
    // for (const admin of adminUsers) {
    //   await auctionSubmittedForApprovalEmail(
    //     admin.email,
    //     auction,
    //     auction.seller,
    //   );
    // }
  } catch (error) {
    console.error("Create auction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while creating auction",
    });
  }
};

export const getAuctions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category, // OLD - keep for backward compatibility
      categories, // NEW - array of categories
      status,
      search,
      sortBy = "endDate",
      sortOrder = "asc",
      currency,
      isFeatured,
      // Auction filters
      auctionType,
      allowOffers,
      // Price filters
      priceMin,
      priceMax,
      location,
    } = req.query;

    // Build filter object
    const filter = {};

    // Status filter
    if (status && status !== "any") {
      if (status === "active") {
        // Show both live (active) and upcoming (approved) auctions
        filter.status = { $in: ["active", "approved"] };
      } else if (status === "sold") {
        // Include both auction sales and buy-now sales
        filter.status = { $in: ["sold", "sold_buy_now"] };
      } else {
        filter.status = status;
      }
    } else {
      filter.status = { $ne: "draft" };
    }

    // ========== CATEGORY FILTERING - UPDATED ==========
    if (categories || category) {
      if (categories) {
        let categoriesArray = [];

        if (Array.isArray(categories)) {
          categoriesArray = categories;
        } else if (typeof categories === "string") {
          categoriesArray = categories
            .split(",")
            .filter((c) => c.trim() !== "");
        }

        if (categoriesArray.length > 0) {
          filter.categories = { $in: categoriesArray };
        }
      }
      else if (category) {
        filter.categories = { $in: [category] };
      }
    }

    // Price filtering - NOTE: This filters on ORIGINAL prices in database
    // For accurate filtering, you may want to convert user's price range to base currency
    if (priceMin || priceMax) {
      filter.currentPrice = {};
      if (priceMin) filter.currentPrice.$gte = parseFloat(priceMin);
      if (priceMax) filter.currentPrice.$lte = parseFloat(priceMax);
    }

    // Search in title, description, and specifications
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Location filtering
    if (location) {
      filter.location = { $regex: location, $options: "i" };
    }

    if (auctionType && auctionType !== "") {
      filter.auctionType = auctionType;
    }

    if (allowOffers !== undefined && allowOffers !== "") {
      filter.allowOffers = allowOffers === "true";
    }

    if (isFeatured !== undefined && isFeatured !== "") {
      filter.isFeatured = isFeatured == "true";
    }

    // Sort options
    const sortOptions = {};
    // Handle the case where sortBy might come as "endDate-asc" from URL
    let actualSortBy = sortBy;
    let actualSortOrder = sortOrder;

    // Check if sortBy contains a dash (from old URL format)
    if (sortBy.includes('-')) {
      const [field, order] = sortBy.split('-');
      actualSortBy = field;
      actualSortOrder = order;
    }

    sortOptions[actualSortBy] = actualSortOrder === "desc" ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const userCurrency = currency || '';

    // Get auctions with pagination
    const auctions = await Auction.find(filter)
      .populate("seller", "username companyName firstName lastName")
      .populate("currentBidder", "username companyName")
      .populate("winner", "username companyName firstName lastName")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Convert auctions using convertPrice helper
    const auctionsWithConverted = auctions.map(auction => {
      const auctionObj = auction.toObject();

      return sanitizeAuctionForViewer({
        ...auctionObj,
        convertedStartPrice: convertPrice(auction, userCurrency, 'startPrice'),
        convertedCurrentPrice: convertPrice(auction, userCurrency, 'currentPrice'),
        convertedBidIncrement: convertPrice(auction, userCurrency, 'bidIncrement'),
        convertedBuyNowPrice: convertPrice(auction, userCurrency, 'buyNowPrice'),
        convertedReservePrice: convertPrice(auction, userCurrency, 'reservePrice'),
        convertedFinalPrice: convertPrice(auction, userCurrency, 'finalPrice'),
        displayCurrency: userCurrency
      }, req.user);
    });

    const total = await Auction.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        auctions: auctionsWithConverted,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalAuctions: total,
          hasNextPage: skip + auctions.length < total,
          hasPrevPage: skip > 0,
        },
      },
    });
  } catch (error) {
    console.error("Get auctions error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching auctions",
    });
  }
};

export const getTopLiveAuctions = async (req, res) => {
  try {
    const {
      category,
      status = "active",
      limit = 4,
      sortBy = "highestBid",
    } = req.query;

    const filter = {};

    // Status filtering
    if (status === "active") {
      filter.status = "active";
      filter.endDate = { $gt: new Date() };
    } else if (status === "ending_soon") {
      filter.status = "active";
      filter.endDate = {
        $gt: new Date(),
        $lt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
    } else if (status === "sold") {
      filter.status = {
        // $in: ["sold", "ended", "reserve_not_met"],
        $in: ["sold"],
      };
      // Optional: only sales that closed at least N days ago (recent ones
      // may still be awaiting payment/collection). Capped at 365.
      const minAgeDays = Math.min(parseInt(req.query.minAgeDays, 10) || 0, 365);
      if (minAgeDays > 0) {
        filter.endDate = { $lte: new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000) };
      }
    } else if (status === "approved" || status === "upcoming") {
      // Support both frontend and backend naming
      filter.status = "active";
      filter.startDate = { $gt: new Date() };
    } else {
      filter.status = status;
    }

    // Category filter
    if (category && category !== "all") {
      filter.category = category;
    }

    // Sort options
    const sortOptions = {};

    switch (sortBy) {
      case "highestBid":
        sortOptions.currentPrice = -1;
        sortOptions.bidCount = -1;
        break;

      case "mostBids":
        sortOptions.bidCount = -1;
        sortOptions.currentPrice = -1;
        break;

      case "endingSoon":
        sortOptions.endDate = 1;
        sortOptions.currentPrice = -1;
        break;

      case "newest":
        sortOptions.createdAt = -1;
        sortOptions.currentPrice = -1;
        break;

      case "lowestBid":
        sortOptions.currentPrice = 1;
        sortOptions.bidCount = -1;
        break;

      case "recentlyEnded":
        sortOptions.endDate = -1;
        break;

      default:
        sortOptions.currentPrice = -1;
        sortOptions.bidCount = -1;
    }

    const userCurrency = req.query.currency || "EUR";
    const rates = getCachedRates();

    let auctions = await Auction.find(filter)
      .populate("seller", "username companyName firstName lastName")
      .populate("currentBidder", "username companyName firstName")
      .sort(sortOptions)
      .limit(parseInt(limit));

    /**
     * Fallback logic
     *
     * Only for ACTIVE listings.
     * Do NOT fallback for ending_soon because
     * that would show auctions ending weeks later.
     */
    if (
      auctions.length < parseInt(limit) &&
      status === "active"
    ) {
      const additionalFilter = {
        status: "active",
        endDate: { $gt: new Date() },
        _id: { $nin: auctions.map((a) => a._id) },
      };

      if (category && category !== "all") {
        additionalFilter.category = category;
      }

      const additionalAuctions = await Auction.find(additionalFilter)
        .populate("seller", "username companyName firstName lastName")
        .populate("currentBidder", "username companyName firstName")
        .sort({
          createdAt: -1,
          startDate: 1,
        })
        .limit(parseInt(limit) - auctions.length);

      auctions.push(...additionalAuctions);
    }

    const auctionsWithConverted = auctions.map((auction) => {
      const auctionObj = auction.toObject();

      let convertedStartPrice = auctionObj.startPrice;
      let convertedCurrentPrice = auctionObj.currentPrice;
      let convertedBidIncrement = auctionObj.bidIncrement;
      let convertedBuyNowPrice = auctionObj.buyNowPrice;
      let convertedReservePrice = auctionObj.reservePrice;
      let convertedFinalPrice = auctionObj.finalPrice;

      if (rates && auctionObj.baseCurrency) {
        const base = auctionObj.baseCurrency;
        const target = userCurrency;
        const rate = rates[base]?.rates[target];

        if (rate && typeof rate === "number") {
          convertedStartPrice = auctionObj.startPrice * rate;
          convertedCurrentPrice = auctionObj.currentPrice * rate;
          convertedBidIncrement = auctionObj.bidIncrement * rate;
          convertedBuyNowPrice = auctionObj.buyNowPrice * rate;
          convertedReservePrice = auctionObj.reservePrice * rate;
          convertedFinalPrice = auctionObj.finalPrice * rate;
        }
      }

      return sanitizeAuctionForViewer({
        ...auctionObj,
        convertedStartPrice: parseFloat(convertedStartPrice.toFixed(2)),
        convertedCurrentPrice: parseFloat(convertedCurrentPrice.toFixed(2)),
        convertedBidIncrement: parseFloat(convertedBidIncrement.toFixed(2)),
        convertedBuyNowPrice: parseFloat(convertedBuyNowPrice.toFixed(2)),
        convertedReservePrice: parseFloat(convertedReservePrice.toFixed(2)),
        convertedFinalPrice: parseFloat(convertedFinalPrice.toFixed(2)),
        displayCurrency: userCurrency,
      }, req.user);
    });

    res.status(200).json({
      success: true,
      data: {
        auctions: auctionsWithConverted,
        total: auctions.length,
        filters: {
          category: category || "all",
          status,
          sortBy,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get top live auctions error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error while fetching top live auctions",
    });
  }
};

// export const getTopLiveAuctions = async (req, res) => {
//   try {
//     const {
//       category,
//       status = "active",
//       limit = 4,
//       sortBy = "highestBid", 
//     } = req.query;

//     // Build filter object
//     const filter = { isFeatured: { $ne: true } };

//     // Status filtering
//     if (status === "active") {
//       filter.status = "active";
//       filter.endDate = { $gt: new Date() };
//     } else if (status === "ending_soon") {
//       filter.status = "active";
//       filter.endDate = {
//         $gt: new Date(),
//         $lt: new Date(Date.now() + 24 * 60 * 60 * 1000),
//       };
//     } else if (status === "sold") {
//       // Filter for sold, ended, and reserve_not_met statuses
//       filter.status = { $in: ["sold", "ended", "reserve_not_met"] };
//     } else if (status === "upcoming") {
//       filter.status = "active";
//       filter.startDate = { $gt: new Date() }; 
//     } else {
//       filter.status = status;
//     }

//     // Add category filter if provided
//     if (category && category !== "all") {
//       filter.category = category;
//     }

//     // Build sort options based on sortBy parameter
//     const sortOptions = {};
//     switch (sortBy) {
//       case "highestBid":
//         sortOptions.currentPrice = -1;
//         sortOptions.bidCount = -1;
//         break;
//       case "mostBids":
//         sortOptions.bidCount = -1;
//         sortOptions.currentPrice = -1;
//         break;
//       case "endingSoon":
//         sortOptions.endDate = 1;
//         sortOptions.currentPrice = -1;
//         break;
//       case "newest":
//         sortOptions.createdAt = -1;
//         sortOptions.currentPrice = -1;
//         break;
//       case "lowestBid":
//         sortOptions.currentPrice = 1;
//         sortOptions.bidCount = -1;
//         break;
//       default:
//         sortOptions.currentPrice = -1;
//         sortOptions.bidCount = -1;
//     }

//     // Get auctions based on filters and sort
//     let auctions = await Auction.find(filter)
//       .populate("seller", "username firstName lastName")
//       .populate("currentBidder", "username firstName")
//       .sort(sortOptions)
//       .limit(parseInt(limit));

//     if (
//       auctions.length < parseInt(limit) &&
//       (status === "active" || status === "ending_soon")
//     ) {
//       const additionalFilter = {
//         status: "active",
//         endDate: { $gt: new Date() },
//         isFeatured: { $ne: true },
//         _id: { $nin: auctions.map((a) => a._id) },
//       };

//       if (category && category !== "all") {
//         additionalFilter.category = category;
//       }

//       const additionalAuctions = await Auction.find(additionalFilter)
//         .populate("seller", "username firstName lastName")
//         .populate("currentBidder", "username firstName")
//         .sort({
//           createdAt: -1, // Get newest first as fallback
//           startDate: 1,
//         })
//         .limit(parseInt(limit) - auctions.length);

//       auctions.push(...additionalAuctions);
//     }

//     res.status(200).json({
//       success: true,
//       data: {
//         auctions,
//         total: auctions.length,
//         filters: {
//           category: category || "all",
//           status,
//           sortBy,
//           limit: parseInt(limit),
//         },
//       },
//     });
//   } catch (error) {
//     console.error("Get top live auctions error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error while fetching top live auctions",
//     });
//   }
// };

export const getAuction = async (req, res) => {
  try {
    const { id } = req.params;
    const userCurrency = req.query.currency || 'EUR';

    const auction = await Auction.findById(id)
      .populate("seller", "username companyName firstName lastName countryName")
      .populate("currentBidder", "username companyName firstName")
      .populate("winner", "username companyName firstName lastName")
      .populate("bids.bidder", "username companyName firstName");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    const rates = getCachedRates();
    const base = auction.baseCurrency;
    const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

    // Helper to convert a single amount
    const convert = (value) => (value !== null && value !== undefined) ? parseFloat((value * rate).toFixed(2)) : null;

    // Convert auction prices
    const convertedStartPrice = convertPrice(auction, userCurrency, 'startPrice');
    const convertedCurrentPrice = convertPrice(auction, userCurrency, 'currentPrice');
    const convertedBidIncrement = convertPrice(auction, userCurrency, 'bidIncrement');
    const convertedBuyNowPrice = convertPrice(auction, userCurrency, 'buyNowPrice');
    const convertedReservePrice = convertPrice(auction, userCurrency, 'reservePrice');
    const convertedFinalPrice = convertPrice(auction, userCurrency, 'finalPrice');

    // Convert offers array
    const convertedOffers = auction.offers.map(offer => {
      const offerObj = offer.toObject();
      return {
        ...offerObj,
        convertedAmount: convert(offer.amount),
        originalAmount: offer.amount,
        // Convert counter offer if exists
        convertedCounterAmount: offer.counterOffer?.amount ? convert(offer.counterOffer.amount) : null,
      };
    });

    // Convert bids array
    const convertedBids = auction.bids.map(bid => {
      const bidObj = bid.toObject();
      return {
        ...bidObj,
        convertedAmount: convert(bid.amount),
        originalAmount: bid.amount,
      };
    });

    // Increment views
    auction.views += 1;
    await auction.save();

    // const auctionObj = auction.toObject();
    const auctionObj = auction.toObject({
      flattenMaps: true,
    });

    res.json({
      success: true,
      data: {
        auction: sanitizeAuctionForViewer({
          ...auctionObj,
          bids: convertedBids,
          offers: convertedOffers,
          convertedStartPrice,
          convertedCurrentPrice,
          convertedBidIncrement,
          convertedBuyNowPrice,
          convertedReservePrice,
          convertedFinalPrice,
          displayCurrency: userCurrency,
          ...getManualPaymentFlags(auction),
        }, req.user)
      }
    });
  } catch (error) {
    console.error("Get auction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching auction",
    });
  }
};

export const updateAuction = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = req.user;

    const {
      title,
      subTitle,
      features,
      description,
      specifications,
      location,
      videoLink,
      startPrice,
      bidIncrement,
      auctionType,
      reservePrice,
      buyNowPrice,
      allowOffers,
      paymentCollectionPreference,
      vatIncluded,
      startDate,
      endDate,
      removedPhotos,
      removedDocuments,
      removedServiceRecords,
      photoOrder,
      serviceRecordOrder,
    } = req.body;

    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // ========== AUCTION DATE SLOT RESOLUTION ==========
    let resolvedStartDate = startDate;
    let resolvedEndDate = endDate;
    let auctionDateSlotId = auction.auctionDate || null;
    let clearAuctionDate = false;

    const isTimedAuction =
      auctionType === "standard" || auctionType === "reserve";

    // Sellers can only change the slot while the auction is draft
    const canChangeSlot = auction.status === "draft";

    if (isTimedAuction) {
      const { auctionDateId } = req.body;

      // If the client sent a slot, validate and apply
      if (auctionDateId) {
        if (!canChangeSlot && auctionDateId.toString() !== auction.auctionDate?.toString()) {
          return res.status(400).json({
            success: false,
            message: "Auction dates can only be changed while the auction is in draft",
          });
        }

        const slot = await AuctionDate.findById(auctionDateId);

        if (!slot || !slot.isActive) {
          return res.status(400).json({
            success: false,
            message: "Selected auction date slot is no longer available",
          });
        }
        if (new Date(slot.endDate) <= new Date() && canChangeSlot) {
          return res.status(400).json({
            success: false,
            message: "Selected auction date has already closed",
          });
        }

        resolvedStartDate = slot.startDate;
        resolvedEndDate = slot.endDate;
        auctionDateSlotId = slot._id;
      } else if (!auction.auctionDate && !auction.startDate) {
        // No slot chosen yet, and none previously stored → require one
        return res.status(400).json({
          success: false,
          message: "Please select an auction date slot",
        });
      }
      // If auctionDateId not sent but auction already has one:
      // → keep the stored dates, don't let the client change them
      else {
        resolvedStartDate = auction.startDate;
        resolvedEndDate = auction.endDate;
      }
    } else {
      // buy_now / giveaway — keep client dates
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "startDate and endDate are required for this auction type",
        });
      }
      // If switching away from a timed auction, clear the slot reference
      if (auction.auctionDate) clearAuctionDate = true;
    }
    // ====================================================

    // Check if user owns the auction
    if (auction.seller.toString() !== seller._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own auctions",
      });
    }

    // CHECK: If auction is sold, prevent seller from editing
    if (auction.status === "sold" || auction.status === "sold_buy_now") {
      return res.status(401).json({
        success: false,
        message: `Sold auction can be edited by administrator only.`,
      });
    }

    // CHECK: If auction is ended, seller can reset and re-list it
    const isEndedAuction =
      auction.status === "ended" || auction.status === "reserve_not_met";

    // ========== CATEGORIES HANDLING ==========
    let categoriesArray = [];
    if (req.body.categories) {
      try {
        const parsed = JSON.parse(req.body.categories);
        if (Array.isArray(parsed)) {
          categoriesArray = parsed;
        } else {
          categoriesArray = [parsed];
        }
      } catch (e) {
        if (Array.isArray(req.body.categories)) {
          categoriesArray = req.body.categories;
        } else if (typeof req.body.categories === "string") {
          categoriesArray = req.body.categories.includes(",")
            ? req.body.categories.split(",").map((c) => c.trim())
            : [req.body.categories];
        }
      }
    }

    // Validation - categories are required
    if (!categoriesArray || categoriesArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one category is required",
      });
    }

    // Basic validation
    if (!title || !description || !auctionType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    // Validate start price for all auction types
    if (!startPrice || parseFloat(startPrice) < 0) {
      return res.status(400).json({
        success: false,
        message: "Start price is required and must be positive",
      });
    }

    // Validate payment collection preference
    if (!paymentCollectionPreference) {
      return res.status(400).json({
        success: false,
        message: "Payment collection preference is required",
      });
    }

    const validPaymentMethods = ["bank_transfer", "credit_card", "buyer_decides"];
    if (!validPaymentMethods.includes(paymentCollectionPreference)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment collection preference",
      });
    }

    // If auction is ended, we'll reset all bidding/offer data
    if (isEndedAuction) {
      const resetData = {
        // Reset all bidding/offers/winner data
        bids: [],
        offers: [],
        currentPrice: parseFloat(startPrice),
        currentBidder: null,
        winner: null,
        finalPrice: null,
        bidCount: 0,

        // Reset payment info
        paymentStatus: "pending",
        purchaseEventSent: false,
        paymentMethod: null,
        paymentDate: null,
        transactionId: null,
        invoice: null,

        // Reset notifications
        notifications: {
          ending30min: false,
          ending2hour: false,
          ending24hour: false,
          ending30minSentAt: null,
          ending2hourSentAt: null,
          ending24hourSentAt: null,
          offerReceived: false,
          offerExpiring: false,
        },

        lastBidTime: null,

        // Reset commission
        commissionAmount: 0,
        bidPaymentRequired: true,
      };

      // Apply reset data to auction object
      Object.assign(auction, resetData);
    }

    // ========== FIX: Update currentPrice if no bids exist ==========
    // Check if there are no bids on the auction
    const hasNoBids = auction.bids.length === 0;

    // If no bids, update currentPrice to match the new startPrice
    // This handles both normal updates and ended auction resets
    if (hasNoBids) {
      auction.currentPrice = parseFloat(startPrice);
    }

    // Validate bid increment for standard and reserve auctions
    if (
      (auctionType === "standard" || auctionType === "reserve") &&
      (!bidIncrement || parseFloat(bidIncrement) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Bid increment is required for standard and reserve auctions",
      });
    }

    // Validate buy now price for buy_now auctions
    if (auctionType === "buy_now") {
      if (!buyNowPrice || parseFloat(buyNowPrice) < parseFloat(startPrice)) {
        return res.status(400).json({
          success: false,
          message:
            "Buy Now price must be provided and greater than or equal to start price",
        });
      }
    }

    // Validate reserve price for reserve auctions
    if (auctionType === "reserve") {
      if (!reservePrice || parseFloat(reservePrice) < parseFloat(startPrice)) {
        return res.status(400).json({
          success: false,
          message:
            "Reserve price must be provided and greater than or equal to start price",
        });
      }
    }

    // RexBid minimums: only checked when the type or prices change, so older
    // listings can still be edited for other details.
    const pricesChanged =
      auctionType !== auction.auctionType ||
      parseFloat(startPrice) !== Number(auction.startPrice) ||
      (auctionType === "reserve" && parseFloat(reservePrice) !== Number(auction.reservePrice));
    if (pricesChanged) {
      const minPriceErr = minimumPriceError({
        auctionType,
        startPrice,
        reservePrice,
        currency: auction.baseCurrency || "EUR",
      });
      if (minPriceErr) {
        return res.status(400).json({ success: false, message: minPriceErr });
      }
    }

    // Validate giveaway auctions
    if (auctionType === "giveaway") {
      // For giveaways, we don't need pricing fields
      if (buyNowPrice || reservePrice || bidIncrement) {
        console.log("Warning: Pricing fields ignored for giveaway auction");
      }
    }

    // Handle specifications (keep your existing specifications handling code)
    let finalSpecifications = new Map();

    // Convert existing specifications to Map if they exist
    if (auction.specifications && auction.specifications instanceof Map) {
      auction.specifications.forEach((value, key) => {
        if (value !== null && value !== undefined && value !== "") {
          finalSpecifications.set(key, value);
        }
      });
    } else if (
      auction.specifications &&
      typeof auction.specifications === "object"
    ) {
      Object.entries(auction.specifications).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
          finalSpecifications.set(key, value);
        }
      });
    }

    // Parse and merge new specifications
    if (specifications) {
      try {
        let newSpecs;
        if (typeof specifications === "string") {
          newSpecs = JSON.parse(specifications);
        } else {
          newSpecs = specifications;
        }

        if (typeof newSpecs === "object" && newSpecs !== null) {
          Object.entries(newSpecs).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== "") {
              finalSpecifications.set(key, value.toString());
            } else {
              finalSpecifications.delete(key);
            }
          });
        }
      } catch (parseError) {
        console.error("Error parsing specifications:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid specifications format",
        });
      }
    }

    // Handle removed photos
    let finalPhotos = [...auction.photos];
    if (removedPhotos) {
      try {
        const removedPhotoIds =
          typeof removedPhotos === "string"
            ? JSON.parse(removedPhotos)
            : removedPhotos;

        if (Array.isArray(removedPhotoIds)) {
          // Remove photos from the array and delete from Cloudinary
          for (const photoId of removedPhotoIds) {
            const photoIndex = finalPhotos.findIndex(
              (photo) =>
                photo.publicId === photoId || photo._id?.toString() === photoId,
            );

            if (photoIndex > -1) {
              const removedPhoto = finalPhotos[photoIndex];
              // Delete from Cloudinary
              if (removedPhoto?.publicId) await deleteFromCloudinary(removedPhoto.publicId);
              if (removedPhoto?.thumbPublicId) await deleteFromCloudinary(removedPhoto.thumbPublicId);
              finalPhotos.splice(photoIndex, 1);
            }
          }
        }
      } catch (error) {
        console.error("Error processing removed photos:", error);
      }
    }

    // Handle removed documents
    let finalDocuments = [...auction.documents];
    if (removedDocuments) {
      try {
        const removedDocIds =
          typeof removedDocuments === "string"
            ? JSON.parse(removedDocuments)
            : removedDocuments;

        if (Array.isArray(removedDocIds)) {
          for (const docId of removedDocIds) {
            const docIndex = finalDocuments.findIndex(
              (doc) => doc.publicId === docId || doc._id?.toString() === docId,
            );

            if (docIndex > -1) {
              const removedDoc = finalDocuments[docIndex];
              // Delete from Cloudinary
              if (removedDoc.publicId) {
                await deleteFromCloudinary(removedDoc.publicId);
              }
              finalDocuments.splice(docIndex, 1);
            }
          }
        }
      } catch (error) {
        console.error("Error processing removed documents:", error);
      }
    }

    // Handle removed service records
    let finalServiceRecords = [...(auction.serviceRecords || [])];
    if (removedServiceRecords) {
      try {
        const removedServiceRecordIds =
          typeof removedServiceRecords === "string"
            ? JSON.parse(removedServiceRecords)
            : removedServiceRecords;

        if (Array.isArray(removedServiceRecordIds)) {
          for (const recordId of removedServiceRecordIds) {
            const recordIndex = finalServiceRecords.findIndex(
              (record) =>
                record.publicId === recordId ||
                record._id?.toString() === recordId,
            );

            if (recordIndex > -1) {
              const removedRecord = finalServiceRecords[recordIndex];
              // Delete from Cloudinary
              if (removedRecord?.publicId) await deleteFromCloudinary(removedRecord.publicId);
              if (removedRecord?.thumbPublicId) await deleteFromCloudinary(removedRecord.thumbPublicId);
              finalServiceRecords.splice(recordIndex, 1);
            }
          }
        }
      } catch (error) {
        console.error("Error processing removed service records:", error);
      }
    }

    // ========== CAPTION HANDLING ==========

    // 1. Get photo captions from request body
    const photoCaptionsArray = [];
    if (req.body.photoCaptions) {
      if (Array.isArray(req.body.photoCaptions)) {
        photoCaptionsArray.push(...req.body.photoCaptions);
      } else if (typeof req.body.photoCaptions === "string") {
        photoCaptionsArray.push(req.body.photoCaptions);
      }
    }

    // 2. Get existing document captions from request body
    const existingDocumentCaptions = [];
    if (req.body.existingDocumentCaptions) {
      if (Array.isArray(req.body.existingDocumentCaptions)) {
        existingDocumentCaptions.push(...req.body.existingDocumentCaptions);
      } else if (typeof req.body.existingDocumentCaptions === "string") {
        existingDocumentCaptions.push(req.body.existingDocumentCaptions);
      }
    }

    // 3. Get new document captions from request body
    const newDocumentCaptions = [];
    if (req.body.newDocumentCaptions) {
      if (Array.isArray(req.body.newDocumentCaptions)) {
        newDocumentCaptions.push(...req.body.newDocumentCaptions);
      } else if (typeof req.body.newDocumentCaptions === "string") {
        newDocumentCaptions.push(req.body.newDocumentCaptions);
      }
    }

    // 4. Get service record captions from request body
    const serviceRecordCaptionsArray = [];
    if (req.body.serviceRecordCaptions) {
      if (Array.isArray(req.body.serviceRecordCaptions)) {
        serviceRecordCaptionsArray.push(...req.body.serviceRecordCaptions);
      } else if (typeof req.body.serviceRecordCaptions === "string") {
        serviceRecordCaptionsArray.push(req.body.serviceRecordCaptions);
      }
    }

    // ========== PHOTO UPDATES ==========

    // Update captions for ALL photos
    finalPhotos.forEach((photo, index) => {
      if (index < photoCaptionsArray.length) {
        photo.caption = photoCaptionsArray[index] || "";
      }
    });

    // Handle new photo uploads
    const newPhotos = [];
    if (req.files && req.files.photos) {
      const photos = Array.isArray(req.files.photos)
        ? req.files.photos
        : [req.files.photos];

      for (const [index, photo] of photos.entries()) {
        try {
          const result = await uploadImageToCloudinary(
            photo.buffer,
            "auction-photos",
          );
          newPhotos.push({
            url: result.secure_url,
            publicId: result.public_id,
            filename: photo.originalname,
            order: finalPhotos.length + newPhotos.length,
            caption: photoCaptionsArray[index] || "",
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            thumbUrl: result.thumb_url,
            thumbPublicId: result.thumb_public_id,
            thumbWidth: result.thumb_width,
            thumbHeight: result.thumb_height,
            thumbBytes: result.thumb_bytes,
          });
        } catch (uploadError) {
          console.error("Photo upload error:", uploadError);
          return res.status(400).json({
            success: false,
            message: `Failed to upload photo: ${photo.originalname}`,
          });
        }
      }
    }

    // Handle photo ordering
    if (photoOrder) {
      try {
        const parsedPhotoOrder =
          typeof photoOrder === "string" ? JSON.parse(photoOrder) : photoOrder;

        if (Array.isArray(parsedPhotoOrder)) {
          // Create a map of existing photos by their ID for quick lookup
          const existingPhotosMap = new Map();
          finalPhotos.forEach((photo) => {
            const photoId = photo.publicId || photo._id?.toString();
            if (photoId) {
              existingPhotosMap.set(photoId, photo);
            }
          });

          // Track used new photos to prevent duplicates
          const usedNewPhotos = new Set();
          const reorderedPhotos = [];

          for (const orderItem of parsedPhotoOrder) {
            if (orderItem.isExisting) {
              // Find existing photo by ID
              const existingPhoto = existingPhotosMap.get(orderItem.id);
              if (existingPhoto) {
                reorderedPhotos.push(existingPhoto);
                // Remove from map to avoid duplicates
                existingPhotosMap.delete(orderItem.id);
              }
            } else {
              // For new photos, find by the temporary ID from frontend
              let foundNewPhoto = null;
              for (let i = 0; i < newPhotos.length; i++) {
                if (!usedNewPhotos.has(i)) {
                  foundNewPhoto = newPhotos[i];
                  usedNewPhotos.add(i);
                  break;
                }
              }

              if (foundNewPhoto) {
                reorderedPhotos.push(foundNewPhoto);
              }
            }
          }

          // Add any remaining existing photos that weren't in the photoOrder
          existingPhotosMap.forEach((photo) => reorderedPhotos.push(photo));

          // Add any remaining new photos that weren't used
          newPhotos.forEach((photo, index) => {
            if (!usedNewPhotos.has(index)) {
              reorderedPhotos.push(photo);
            }
          });

          finalPhotos = reorderedPhotos;
        }
      } catch (error) {
        console.error("Error processing photo order:", error);
        // Fallback: append new photos at the end
        finalPhotos = [...finalPhotos, ...newPhotos];
      }
    } else {
      // If no photoOrder is provided, just append new photos at the end
      finalPhotos = [...finalPhotos, ...newPhotos];
    }

    // ========== DOCUMENT UPDATES ==========

    // Update captions for existing documents
    finalDocuments.forEach((doc, index) => {
      if (index < existingDocumentCaptions.length) {
        doc.caption = existingDocumentCaptions[index] || "";
      }
    });

    // Handle new document uploads
    if (req.files && req.files.documents) {
      const documents = Array.isArray(req.files.documents)
        ? req.files.documents
        : [req.files.documents];

      for (const [index, doc] of documents.entries()) {
        try {
          const result = await uploadDocumentToCloudinary(
            doc.buffer,
            doc.originalname,
            "auction-documents",
          );
          finalDocuments.push({
            url: result.secure_url,
            publicId: result.public_id,
            filename: doc.originalname,
            originalName: doc.originalname,
            resourceType: "raw",
            caption: newDocumentCaptions[index] || "",
          });
        } catch (uploadError) {
          console.error("Document upload error:", uploadError);
          return res.status(400).json({
            success: false,
            message: `Failed to upload document: ${doc.originalname}`,
          });
        }
      }
    }

    // ========== SERVICE RECORD UPDATES ==========

    // Update captions for ALL service records
    finalServiceRecords.forEach((record, index) => {
      if (index < serviceRecordCaptionsArray.length) {
        record.caption = serviceRecordCaptionsArray[index] || "";
      }
    });

    // Handle new service record uploads
    const newServiceRecords = [];
    if (req.files && req.files.serviceRecords) {
      const serviceRecords = Array.isArray(req.files.serviceRecords)
        ? req.files.serviceRecords
        : [req.files.serviceRecords];

      for (const [index, record] of serviceRecords.entries()) {
        try {
          const result = await uploadImageToCloudinary(
            record.buffer,
            "auction-service-records",
          );
          newServiceRecords.push({
            url: result.secure_url,
            publicId: result.public_id,
            filename: record.originalname,
            originalName: record.originalname,
            order: finalServiceRecords.length + newServiceRecords.length,
            caption: serviceRecordCaptionsArray[index] || "",
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            thumbUrl: result.thumb_url,
            thumbPublicId: result.thumb_public_id,
            thumbWidth: result.thumb_width,
            thumbHeight: result.thumb_height,
            thumbBytes: result.thumb_bytes,
          });
        } catch (uploadError) {
          console.error("Service record upload error:", uploadError);
          return res.status(400).json({
            success: false,
            message: `Failed to upload service record: ${record.originalname}`,
          });
        }
      }
    }

    // Handle service record ordering
    if (serviceRecordOrder) {
      try {
        const parsedServiceRecordOrder =
          typeof serviceRecordOrder === "string"
            ? JSON.parse(serviceRecordOrder)
            : serviceRecordOrder;

        if (Array.isArray(parsedServiceRecordOrder)) {
          // Create a map of existing service records by their ID for quick lookup
          const existingServiceRecordsMap = new Map();
          finalServiceRecords.forEach((record) => {
            const recordId = record.publicId || record._id?.toString();
            if (recordId) {
              existingServiceRecordsMap.set(recordId, record);
            }
          });

          // Track used new service records to prevent duplicates
          const usedNewServiceRecords = new Set();
          const reorderedServiceRecords = [];

          for (const orderItem of parsedServiceRecordOrder) {
            if (orderItem.isExisting) {
              // Find existing service record by ID
              const existingRecord = existingServiceRecordsMap.get(
                orderItem.id,
              );
              if (existingRecord) {
                reorderedServiceRecords.push(existingRecord);
                // Remove from map to avoid duplicates
                existingServiceRecordsMap.delete(orderItem.id);
              }
            } else {
              // For new service records, find by the temporary ID from frontend
              let foundNewRecord = null;
              for (let i = 0; i < newServiceRecords.length; i++) {
                if (!usedNewServiceRecords.has(i)) {
                  foundNewRecord = newServiceRecords[i];
                  usedNewServiceRecords.add(i);
                  break;
                }
              }

              if (foundNewRecord) {
                reorderedServiceRecords.push(foundNewRecord);
              }
            }
          }

          // Add any remaining existing service records that weren't in the order
          existingServiceRecordsMap.forEach((record) =>
            reorderedServiceRecords.push(record),
          );

          // Add any remaining new service records that weren't used
          newServiceRecords.forEach((record, index) => {
            if (!usedNewServiceRecords.has(index)) {
              reorderedServiceRecords.push(record);
            }
          });

          finalServiceRecords = reorderedServiceRecords;
        }
      } catch (error) {
        console.error("Error processing service record order:", error);
        // Fallback: append new service records at the end
        finalServiceRecords = [...finalServiceRecords, ...newServiceRecords];
      }
    } else {
      // If no serviceRecordOrder is provided, just append new service records at the end
      finalServiceRecords = [...finalServiceRecords, ...newServiceRecords];
    }

    // ========== DATE VALIDATION ==========
    const start = new Date(resolvedStartDate);
    const end = new Date(resolvedEndDate);
    const now = new Date();

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    // ========== STATUS DETERMINATION ==========
    let newStatus = "draft";

    // ========== PREPARE UPDATE DATA ==========
    const updateData = {
      title,
      subTitle: subTitle || "",
      categories: categoriesArray,
      features: features || "",
      description,
      specifications: finalSpecifications,
      location,
      videoLink,
      startPrice: parseFloat(startPrice),
      // Only set currentPrice if no bids exist
      ...(hasNoBids && { currentPrice: parseFloat(startPrice) }),
      auctionType,
      allowOffers: allowOffers === "true" || allowOffers === true,
      paymentCollectionPreference: paymentCollectionPreference || "buyer_decides",
      vatIncluded: vatIncluded === "true" || vatIncluded === true,
      startDate: start,
      endDate: end,
      photos: finalPhotos,
      documents: finalDocuments,
      serviceRecords: finalServiceRecords,
      status: newStatus,
      ...(auctionDateSlotId !== auction.auctionDate?.toString() && {
        auctionDate: auctionDateSlotId,
      }),
      ...(clearAuctionDate && { auctionDate: null }),
    };

    // Add bid increment only for standard and reserve auctions
    if (auctionType === "standard" || auctionType === "reserve") {
      updateData.bidIncrement = parseFloat(bidIncrement);
    } else {
      updateData.bidIncrement = undefined;
    }

    // Add reserve price if applicable
    if (auctionType === "reserve") {
      updateData.reservePrice = parseFloat(reservePrice);
    } else {
      updateData.reservePrice = undefined;
    }

    // Add buy now price if applicable
    if (auctionType === "buy_now") {
      updateData.buyNowPrice = parseFloat(buyNowPrice);
    } else {
      updateData.buyNowPrice = undefined;
    }

    // Add reset fields for ended auctions
    if (isEndedAuction) {
      updateData.bids = [];
      updateData.offers = [];
      updateData.currentPrice = parseFloat(startPrice);
      updateData.currentBidder = null;
      updateData.winner = null;
      updateData.finalPrice = null;
      updateData.bidCount = 0;
      updateData.paymentStatus = "pending";
      updateData.paymentMethod = null;
      updateData.paymentDate = null;
      updateData.transactionId = null;
      updateData.invoice = null;
      updateData.notifications = {
        ending30min: false,
        ending2hour: false,
        ending24hour: false,
        ending30minSentAt: null,
        ending2hourSentAt: null,
        ending24hourSentAt: null,
        offerReceived: false,
        offerExpiring: false,
      };
      updateData.lastBidTime = null;
      updateData.commissionAmount = 0;
      updateData.sellerCommissionAmount = 0;
      updateData.bidderCommissionAmount = 0;
      updateData.bidPaymentRequired = true;
    }

    const updatedAuction = await Auction.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("seller", "username companyName firstName lastName");

    // ========== RESCHEDULE JOBS ==========
    if (
      start.getTime() !== new Date(auction.startDate).getTime() ||
      end.getTime() !== new Date(auction.endDate).getTime()
    ) {
      await agendaService.cancelAuctionJobs(auction._id);

      // Only schedule jobs for timed auctions (standard/reserve)
      if (auctionType === "standard" || auctionType === "reserve") {
        if (start > new Date()) {
          await agendaService.scheduleAuctionActivation(
            updatedAuction._id,
            start,
          );
        }
        await agendaService.scheduleAuctionEnd(updatedAuction._id, end);
      } else {
        console.log(`🛒 ${auctionType} auction ${id} - no jobs scheduled`);
      }
    }

    broadcastAuctionChange(id);

    res.status(200).json({
      success: true,
      message: isEndedAuction
        ? "Ended auction has been reset and updated successfully"
        : "Auction updated successfully",
      data: { auction: updatedAuction },
      reset: isEndedAuction,
    });
  } catch (error) {
    console.error("Update auction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating auction",
    });
  }
};

export const deleteAuction = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = req.user;

    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Check if user owns the auction
    if (auction.seller.toString() !== seller._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own auctions",
      });
    }

    // Only allow deletion of draft or cancelled auctions
    if (!["draft", "cancelled"].includes(auction.status)) {
      return res.status(400).json({
        success: false,
        message: "Only draft or cancelled auctions can be deleted",
      });
    }

    // Delete uploaded files from cloudinary
    for (const photo of auction.photos) {
      if (photo?.publicId) await deleteFromCloudinary(photo.publicId);
      if (photo?.thumbPublicId) await deleteFromCloudinary(photo.thumbPublicId);
    }

    for (const doc of auction.documents) {
      await deleteFromCloudinary(doc.publicId);
    }

    await Auction.findByIdAndDelete(id);

    broadcastAuctionRemoved(id);

    res.status(200).json({
      success: true,
      message: "Auction deleted successfully",
    });
  } catch (error) {
    console.error("Delete auction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while deleting auction",
    });
  }
};

// Place Bid
export const placeBid = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, currency } = req.body;
    const bidder = req.user;

    // Check if user has a valid payment method
    if (!bidder?.stripeCustomerId || !bidder?.paymentMethodId || !bidder?.isPaymentVerified) {
      return res.status(403).json({
        success: false,
        message: "Please add a valid payment method before placing a bid.",
        redirectTo: `/${bidder?.userType || 'bidder'}/billing`,
        errorCode: 'PAYMENT_METHOD_REQUIRED'
      });
    }

    // Verify the payment method is still valid with Stripe
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(bidder.paymentMethodId);

      if (paymentMethod.card?.checks?.cvc_check === 'fail' ||
        paymentMethod.card?.checks?.address_line1_check === 'fail') {
        console.warn(`User ${bidder._id} has a payment method with potential issues`);
      }
    } catch (error) {
      console.error(`Payment method verification failed for user ${bidder._id}:`, error);
      return res.status(403).json({
        success: false,
        message: "Your payment method is no longer valid. Please update your payment information.",
        redirectTo: `/${bidder?.userType || 'bidder'}/billing`,
        errorCode: 'PAYMENT_METHOD_INVALID'
      });
    }

    // Verify the user has a valid Stripe customer
    try {
      await stripe.customers.retrieve(bidder.stripeCustomerId);
    } catch (error) {
      console.error(`Stripe customer not found for user ${bidder._id}:`, error);
      return res.status(403).json({
        success: false,
        message: "Your payment setup is incomplete. Please add your payment method again.",
        redirectTo: `/${bidder?.userType || 'bidder'}/billing`,
        errorCode: 'STRIPE_CUSTOMER_INVALID'
      });
    }

    // Validate account status
    if (!bidder?.isActive) {
      return res.status(400).json({
        success: false,
        message: `Account is inactive. Can't place a bid.`,
      });
    }

    if (!bidder?.isVerified) {
      return res.status(400).json({
        success: false,
        message: `Please wait until administrator has verified your account before placing bid.`,
      });
    }

    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    const ratesData = getCachedRates();
    const base = auction.baseCurrency;
    const buyerCurr = currency;
    const rate = ratesData[buyerCurr].rates[base];
    if (!rate) throw new Error(`Cannot convert from ${buyerCurr} to ${base}`);

    const amountInBase = parseFloat(amount) * rate;

    const previousHighestBidder = auction.currentBidder;
    // Rank bidders by their highest bid
    const highestBidPerBidder = new Map();
    for (const bid of auction.bids) {
      const bidderId = bid.bidder.toString();
      const current = highestBidPerBidder.get(bidderId);
      if (current === undefined || bid.amount > current) {
        highestBidPerBidder.set(bidderId, bid.amount);
      }
    }

    const currentBidderId = bidder._id.toString();

    // Top 2 bidders, excluding the person currently placing the bid
    const previousBidders = [...highestBidPerBidder.entries()]
      .filter(([bidderId]) => bidderId !== currentBidderId) // exclude placer
      .sort((a, b) => b[1] - a[1])                          // highest bid first
      .slice(0, 2)                                          // top 2 remaining
      .map(([bidderId]) => bidderId);

    const oldEndDate = auction.endDate;

    const priceBeforeBid = auction.currentPrice;

    // Place bid using the model method
    await auction.placeBid(bidder._id, bidder.username || bidder.companyName, amountInBase);

    const extended = auction.endDate > oldEndDate;

    // ⬇️ Fire proxy cascade (base-currency internal)
    await processProxyBids(auction._id);

    // ⬇️ Re-fetch — proxy bids may have changed price/leader/endDate
    const finalAuction = await Auction.findById(auction._id)
      .populate("currentBidder", "username companyName firstName lastname email")
      .populate("seller", "username companyName firstName lastname email");

    const userCurrency = currency;
    const auctionObj = finalAuction.toObject();

    // convert the fresh bids array (base → user currency)
    const convertedBids = finalAuction.bids.map((bid) => ({
      ...bid.toObject(),
      convertedAmount: parseFloat((bid.amount * rate).toFixed(2)),
      originalAmount: bid.amount,
    }));

    const convertedStartPrice = convertPrice(finalAuction, userCurrency, "startPrice");
    const convertedCurrentPrice = convertPrice(finalAuction, userCurrency, "currentPrice");
    const convertedBidIncrement = auctionObj.bidIncrement ? convertPrice(finalAuction, userCurrency, "bidIncrement") : null;
    const convertedBuyNowPrice = auctionObj.buyNowPrice ? convertPrice(finalAuction, userCurrency, "buyNowPrice") : null;
    const convertedReservePrice = auctionObj.reservePrice ? convertPrice(finalAuction, userCurrency, "reservePrice") : null;
    const convertedFinalPrice = auctionObj.finalPrice ? convertPrice(finalAuction, userCurrency, "finalPrice") : null;

    broadcastAuctionChange(auction._id);

    // ---------- SEND RESPONSE ----------
    res.status(200).json({
      success: true,
      message: "Bid placed successfully",
      data: {
        auction: {
          ...auctionObj,
          bids: convertedBids,
          convertedStartPrice,
          convertedCurrentPrice,
          convertedBidIncrement,
          convertedBuyNowPrice,
          convertedReservePrice,
          convertedFinalPrice,
          displayCurrency: userCurrency,
        },
        extended,
      },
    });

    // ---------- SEND EMAILS IN BACKGROUND (NON‑BLOCKING) ----------
    setImmediate(async () => {
      const placerStr = bidder._id.toString();
      const winnerStr = finalAuction.currentBidder?._id?.toString();
      const auctionBase = finalAuction.baseCurrency || "EUR";
      const userCur = currency || auctionBase;
      const rates = getCachedRates();
      const baseToUser = (amt, cur) => {
        if (!amt || cur === auctionBase) return amt;
        const r = rates?.[auctionBase]?.rates?.[cur];
        return r ? parseFloat((amt * r).toFixed(2)) : amt;
      };

      // 1. Bid confirmation — ONLY if placer actually won the cascade
      if (winnerStr === placerStr) {
        bidConfirmationEmail(
          bidder.email,
          bidder.username || bidder.companyName,
          finalAuction,
          baseToUser(amountInBase, userCur),
          baseToUser(finalAuction.currentPrice, userCur),
          userCur
        ).catch(err => console.error("bid confirm:", err));
      }

      // 2. Seller notification — only if price actually moved (cascade or manual)
      if (finalAuction.currentPrice > priceBeforeBid) {
        const sellerCur = finalAuction.seller?.currency || auctionBase;
        newBidNotificationEmail(
          finalAuction.seller,
          finalAuction,
          baseToUser(finalAuction.currentPrice, sellerCur),
          bidder,
          sellerCur
        ).catch(err => console.error("new bid seller:", err));
      }

      // 3. Outbid — batcher handles cascade collapse
      const allIds = [...new Set((finalAuction.bids || [])
        .map(b => (b.bidder?._id ?? b.bidder)?.toString())
        .filter(Boolean))];
      const outbidRecipients = allIds.filter(uid => uid !== winnerStr);
      if (outbidRecipients.length > 0) {
        sendOutbidNotifications(finalAuction, outbidRecipients, winnerStr, finalAuction.currentPrice);
      }

      // 4. Watchlist — also use finalAuction
      sendWatchlistBidNotifications(finalAuction, placerStr, finalAuction.currentPrice, currency)
        .catch(err => console.error("watchlist bid:", err));
    });

  } catch (error) {
    console.error("Place bid error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Place a bid atomically without going through the model's `placeBid`.
 * Used by proxy cascade. Receives amounts in BASE currency.
 */
export const placeBidDirect = async (
  auctionId, bidderId, bidderUsername, amount,
  proxyBidId = null, maxRetries = 3
) => {
  let attempt = 0, lastError = null;

  while (attempt < maxRetries) {
    try {
      const auction = await Auction.findById(auctionId).select(
        "status currentPrice currentBidder bidCount bidIncrement startPrice autoExtend endDate"
      );
      if (!auction || auction.status !== "active")
        throw new Error("Auction not active or not found");

      if (auction.currentBidder?.toString() === bidderId.toString()) {
        return auction; // already winning
      }

      const minBid = auction.bidCount === 0
        ? auction.startPrice
        : auction.currentPrice + auction.bidIncrement;
      if (amount < minBid) throw new Error(`Bid must be at least ${minBid}`);

      const now = new Date();
      const update = {
        $inc: { bidCount: 1 },
        $set: {
          currentPrice: amount,
          currentBidder: bidderId,
          lastBidTime: now,
        },
        $push: {
          bids: {
            bidder: bidderId,
            bidderUsername,
            amount,
            timestamp: now,
            isBuyNow: false,
            isProxyBid: true,
            proxyBidId,
          },
        },
      };

      const arrayFilters = [];
      if (proxyBidId) {
        update.$set["proxyBids.$[elem].currentBid"] = amount;
        update.$set["proxyBids.$[elem].updatedAt"] = now;
        arrayFilters.push({ "elem._id": proxyBidId });
      }

      // Auto-extend — match your existing rule (+1 min additive)
      let extended = false;
      if (auction.autoExtend) {
        const timeRemaining = auction.endDate - now;
        if (timeRemaining < 2 * 60 * 1000) {
          const newEndDate = new Date(auction.endDate.getTime() + 1 * 60 * 1000);
          update.$set.endDate = newEndDate;
          extended = true;
        }
      }

      // CAS guard — only commit if price/leader unchanged
      const query = {
        _id: auctionId,
        status: "active",
        currentPrice: auction.currentPrice,
        currentBidder: auction.currentBidder || null,
      };

      const updatedAuction = await Auction.findOneAndUpdate(query, update, {
        new: true, runValidators: true, arrayFilters,
      });

      if (!updatedAuction) throw new Error("Auction state changed, retrying...");

      if (extended) {
        await agendaService.cancelAuctionJobs(auctionId);
        await agendaService.scheduleAuctionEnd(auctionId, updatedAuction.endDate);
      }

      return updatedAuction;
    } catch (err) {
      lastError = err;
      attempt++;
      if (err.message === "Auction state changed, retrying..." && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Failed after retries");
};

export const placeProxyBid = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxAmount, currency } = req.body;
    const bidder = req.user;

    if (!bidder?.isActive) return res.status(400).json({ success: false, message: "Account is inactive." });
    if (!bidder?.isVerified) return res.status(400).json({ success: false, message: "Account not verified." });

    if (!bidder?.stripeCustomerId || !bidder?.paymentMethodId || !bidder?.isPaymentVerified) {
      return res.status(403).json({
        success: false,
        message: "Please add a valid payment method before setting a proxy bid.",
        redirectTo: `/${bidder?.userType || 'bidder'}/billing`,
        errorCode: 'PAYMENT_METHOD_REQUIRED',
      });
    }

    const auction = await Auction.findById(id);
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });
    if (auction.status !== "active") return res.status(400).json({ success: false, message: "Auction is not active" });
    if (new Date() >= auction.endDate) return res.status(400).json({ success: false, message: "Auction has ended" });
    if (auction.seller.toString() === bidder._id.toString())
      return res.status(400).json({ success: false, message: "You can't place a proxy bid on your own auction" });

    const existing = auction.proxyBids.find(
      (pb) => pb.bidder.toString() === bidder._id.toString() && pb.isActive
    );
    if (existing) return res.status(400).json({ success: false, message: "You already have an active proxy bid." });

    // ⚠️ MULTI-CURRENCY: client → base
    const ratesData = getCachedRates();
    if (!ratesData) return res.status(503).json({ success: false, message: "Rates unavailable, retry" });
    const base = auction.baseCurrency;
    const buyerCurr = currency || base;
    const clientToBase = ratesData?.[buyerCurr]?.rates?.[base];
    const baseToClient = ratesData?.[base]?.rates?.[buyerCurr];
    if (!clientToBase || !baseToClient)
      return res.status(400).json({ success: false, message: "Currency conversion unavailable" });

    const maxAmountInBase = parseFloat(maxAmount) * clientToBase;

    const minBidBase = auction.bidCount === 0
      ? auction.startPrice
      : auction.currentPrice + auction.bidIncrement;

    if (isNaN(maxAmountInBase) || maxAmountInBase < minBidBase) {
      const minClient = (minBidBase * baseToClient).toFixed(2);
      return res.status(400).json({
        success: false,
        message: `Maximum bid must be at least ${minClient} ${buyerCurr}`,
      });
    }

    const priceBeforeProxy = auction.currentPrice;

    auction.proxyBids.push({
      bidder: bidder._id,
      bidderUsername: bidder.username || bidder.companyName,
      maxAmount: maxAmountInBase,
      currentBid: minBidBase,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await auction.save();

    await processProxyBids(id);
    broadcastAuctionChange(id);   // sockets fire — frontend refreshes

    const stored = auction.proxyBids[auction.proxyBids.length - 1];

    res.status(200).json({
      success: true,
      message: "Proxy bid placed successfully",
      data: {
        proxyBid: {
          _id: stored._id,
          isActive: stored.isActive,
          maxAmount: stored.maxAmount,
          currentBid: stored.currentBid,
          convertedMaxAmount: parseFloat((stored.maxAmount * baseToClient).toFixed(2)),
          convertedCurrentBid: parseFloat((stored.currentBid * baseToClient).toFixed(2)),
          displayCurrency: buyerCurr,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
        },
      },
    });

    // ─── Proxy bid emails (fire-and-forget, post-response) ─────────
    setImmediate(async () => {
      try {
        const emailAuction = await Auction.findById(id)
          .populate("seller", "email username companyName firstName lastName currency")
          .populate("currentBidder", "email username companyName firstName lastName")
          .populate("bids.bidder", "email username companyName firstName lastName");
        if (!emailAuction) return;

        const placerIdStr = bidder._id.toString();
        const finalWinnerId =
          emailAuction.currentBidder?._id?.toString() ||
          emailAuction.currentBidder?.toString();
        const isPlacerHighest = finalWinnerId === placerIdStr;
        const priceChanged = priceBeforeProxy !== emailAuction.currentPrice;

        // Placer's own highest bid (base currency)
        const userHighestBase = (emailAuction.bids || []).reduce((max, b) => {
          const rawId = b.bidder?._id ?? b.bidder;
          return rawId?.toString() === placerIdStr && b.amount > max ? b.amount : max;
        }, 0);

        // 1) Bid confirmation — placer is currently winning
        if (isPlacerHighest) {
          const bidBase = userHighestBase > 0 ? userHighestBase : emailAuction.currentPrice;
          const bidUser = parseFloat((bidBase * baseToClient).toFixed(2));
          const currUser = parseFloat((emailAuction.currentPrice * baseToClient).toFixed(2));

          bidConfirmationEmail(
            bidder.email,
            bidder.username || bidder.companyName,
            emailAuction,
            bidUser,
            currUser,
            buyerCurr
          ).catch((err) => console.error("Proxy bid confirmation email:", err));
        }

        // 2) Seller notification — price moved during cascade
        if (priceChanged) {
          newBidNotificationEmail(
            emailAuction.seller,
            emailAuction,
            emailAuction.currentPrice,   // BASE
            bidder,
            emailAuction.baseCurrency
          ).catch((err) => console.error("Proxy seller email:", err));
        }

        // 3) Outbid — displaced bidders (batcher dedupes the whole cascade)
        if (priceChanged && finalWinnerId) {
          const allBidderIds = [
            ...new Set(
              (emailAuction.bids || [])
                .map((b) => (b.bidder?._id ?? b.bidder)?.toString())
                .filter(Boolean)
            ),
          ];
          const displacedIds = allBidderIds.filter((uid) => uid !== finalWinnerId);

          if (displacedIds.length > 0) {
            sendOutbidNotifications(
              emailAuction,
              displacedIds,
              finalWinnerId,
              parseFloat((emailAuction.currentPrice * baseToClient).toFixed(2)),
              buyerCurr
            ).catch((err) => console.error("Proxy outbid notifications:", err));
          }
        }
      } catch (err) {
        console.error("Proxy email dispatch:", err);
      }
    });
  } catch (error) {
    console.error("Place proxy bid error:", error);
    res.status(500).json({ success: false, message: "Failed to place proxy bid" });
  }
};

export const updateProxyBid = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxAmount, currency } = req.body;
    const userId = req.user._id;
    const bidder = req.user;

    if (!maxAmount || parseFloat(maxAmount) <= 0)
      return res.status(400).json({ success: false, message: "Valid amount required" });

    if (!bidder?.stripeCustomerId || !bidder?.paymentMethodId || !bidder?.isPaymentVerified) {
      return res.status(403).json({
        success: false,
        message: "Please add a valid payment method before updating your proxy bid.",
        redirectTo: `/${bidder?.userType || 'bidder'}/billing`,
        errorCode: 'PAYMENT_METHOD_REQUIRED',
      });
    }

    const auction = await Auction.findById(id);
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });
    if (auction.status !== "active") return res.status(400).json({ success: false, message: "Auction is not active" });
    if (new Date() >= auction.endDate) return res.status(400).json({ success: false, message: "Auction has ended" });
    if (auction.seller.toString() === userId.toString())
      return res.status(400).json({ success: false, message: "Seller cannot have a proxy bid" });

    const proxy = auction.proxyBids.find((pb) => pb.bidder.toString() === userId.toString());
    if (!proxy) return res.status(404).json({ success: false, message: "No proxy bid found" });

    // ⚠️ MULTI-CURRENCY: client → base
    const ratesData = getCachedRates();
    if (!ratesData) return res.status(503).json({ success: false, message: "Rates unavailable" });
    const base = auction.baseCurrency;
    const buyerCurr = currency || base;
    const clientToBase = ratesData?.[buyerCurr]?.rates?.[base];
    const baseToClient = ratesData?.[base]?.rates?.[buyerCurr];
    if (!clientToBase || !baseToClient)
      return res.status(400).json({ success: false, message: "Currency conversion unavailable" });

    const newMaxBase = parseFloat(maxAmount) * clientToBase;

    const minBidBase = auction.bidCount === 0
      ? auction.startPrice
      : auction.currentPrice + auction.bidIncrement;

    if (newMaxBase < minBidBase) {
      const minClient = (minBidBase * baseToClient).toFixed(2);
      return res.status(400).json({
        success: false,
        message: `Maximum bid must be at least ${minClient} ${buyerCurr}`,
      });
    }

    if (proxy.isActive && proxy.currentBid > newMaxBase) {
      const currentClient = (proxy.currentBid * baseToClient).toFixed(2);
      return res.status(400).json({
        success: false,
        message: `New max cannot be lower than your current proxy bid (${currentClient} ${buyerCurr})`,
      });
    }

    const priceBeforeProxy = auction.currentPrice;
    proxy.maxAmount = newMaxBase;
    proxy.isActive = true;
    proxy.updatedAt = new Date();
    await auction.save();

    await processProxyBids(id);
    broadcastAuctionChange(id);

    res.status(200).json({
      success: true,
      message: "Proxy bid updated",
      data: {
        proxyBid: {
          _id: proxy._id,
          isActive: proxy.isActive,
          maxAmount: proxy.maxAmount,
          currentBid: proxy.currentBid,
          convertedMaxAmount: parseFloat((proxy.maxAmount * baseToClient).toFixed(2)),
          convertedCurrentBid: parseFloat((proxy.currentBid * baseToClient).toFixed(2)),
          displayCurrency: buyerCurr,
          updatedAt: proxy.updatedAt,
        },
      },
    });

    setImmediate(async () => {
      try {
        const emailAuction = await Auction.findById(id)
          .populate("seller", "email username companyName firstName lastName currency")
          .populate("currentBidder", "email username companyName firstName lastName")
          .populate("bids.bidder", "email username companyName firstName lastName");
        if (!emailAuction) return;

        const userIdStr = userId.toString();
        const finalWinnerId =
          emailAuction.currentBidder?._id?.toString() ||
          emailAuction.currentBidder?.toString();
        const isPlacerHighest = finalWinnerId === userIdStr;
        const priceChanged = priceBeforeProxy !== emailAuction.currentPrice;

        const userHighestBase = (emailAuction.bids || []).reduce((max, b) => {
          const rawId = b.bidder?._id ?? b.bidder;
          return rawId?.toString() === userIdStr && b.amount > max ? b.amount : max;
        }, 0);

        if (isPlacerHighest) {
          const bidBase = userHighestBase > 0 ? userHighestBase : emailAuction.currentPrice;
          const bidUser = parseFloat((bidBase * baseToClient).toFixed(2));
          const currUser = parseFloat((emailAuction.currentPrice * baseToClient).toFixed(2));

          bidConfirmationEmail(
            req.user.email,
            req.user.username || req.user.companyName,
            emailAuction,
            bidUser,
            currUser,
            buyerCurr
          ).catch((err) => console.error("Proxy update confirmation:", err));
        }

        if (priceChanged) {
          newBidNotificationEmail(
            emailAuction.seller,
            emailAuction,
            emailAuction.currentPrice,
            req.user,
            emailAuction.baseCurrency
          ).catch((err) => console.error("Proxy update seller email:", err));
        }

        if (priceChanged && finalWinnerId) {
          const allBidderIds = [
            ...new Set(
              (emailAuction.bids || [])
                .map((b) => (b.bidder?._id ?? b.bidder)?.toString())
                .filter(Boolean)
            ),
          ];
          const displacedIds = allBidderIds.filter((uid) => uid !== finalWinnerId);

          if (displacedIds.length > 0) {
            sendOutbidNotifications(
              emailAuction,
              displacedIds,
              finalWinnerId,
              parseFloat((emailAuction.currentPrice * baseToClient).toFixed(2)),
              buyerCurr
            ).catch((err) => console.error("Proxy update outbid:", err));
          }
        }
      } catch (err) {
        console.error("Proxy update email dispatch:", err);
      }
    });
  } catch (error) {
    console.error("Update proxy bid error:", error);
    res.status(500).json({ success: false, message: "Failed to update proxy bid" });
  }
};

export const cancelProxyBid = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const auction = await Auction.findById(id);
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });

    const proxy = auction.proxyBids.find(
      (pb) => pb.bidder.toString() === userId.toString() && pb.isActive
    );
    if (!proxy) return res.status(404).json({ success: false, message: "No active proxy bid" });

    proxy.isActive = false;
    proxy.updatedAt = new Date();
    await auction.save();

    broadcastAuctionChange(id);

    res.status(200).json({ success: true, message: "Proxy bid cancelled" });
  } catch (error) {
    console.error("Cancel proxy bid error:", error);
    res.status(500).json({ success: false, message: "Failed to cancel proxy bid" });
  }
};

export const getProxyBidStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userCurrency = req.query.currency || "EUR";

    const auction = await Auction.findById(id).select("proxyBids baseCurrency");
    if (!auction) return res.status(404).json({ success: false, message: "Auction not found" });

    const proxy = auction.proxyBids.find((pb) => pb.bidder.toString() === userId.toString());
    if (!proxy) {
      return res.status(200).json({
        success: true,
        data: { hasProxyBid: false, displayCurrency: userCurrency },
      });
    }

    const ratesData = getCachedRates();
    const base = auction.baseCurrency;
    const baseToClient = ratesData?.[base]?.rates?.[userCurrency] || 1;

    res.status(200).json({
      success: true,
      data: {
        hasProxyBid: true,
        isActive: proxy.isActive,
        maxAmount: proxy.maxAmount,
        currentBid: proxy.currentBid,
        convertedMaxAmount: parseFloat((proxy.maxAmount * baseToClient).toFixed(2)),
        convertedCurrentBid: parseFloat((proxy.currentBid * baseToClient).toFixed(2)),
        displayCurrency: userCurrency,
        createdAt: proxy.createdAt,
        updatedAt: proxy.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get proxy bid status error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch proxy bid status" });
  }
};

// Get User's Auctions
export const getUserAuctions = async (req, res) => {
  try {
    const user = req.user;
    const { status, page = 1, limit = 10 } = req.query;
    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    const filter = { seller: user._id };
    if (status && status.trim() !== "") {
      filter.status = status;
    }

    const auctions = await Auction.find(filter)
      .populate("currentBidder", "username companyName firstName lastName email phone image")
      .populate("winner", "username companyName firstName lastName email phone image")
      .populate(
        "bids.bidder",
        "username companyName firstName lastName email phone image company",
      )
      .sort({ createdAt: -1 });

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const auctionsWithConverted = auctions.map(auction => {
      const auctionObj = auction.toObject();
      const base = auction.baseCurrency;
      const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

      // Convert bids
      const convertedBids = auction.bids.map(bid => ({
        ...bid.toObject(),
        convertedAmount: parseFloat((bid.amount * rate).toFixed(2)),
        originalAmount: bid.amount
      }));

      // Use convertPrice helper for all price fields
      const convertedStartPrice = convertPrice(auction, userCurrency, 'startPrice');
      const convertedCurrentPrice = convertPrice(auction, userCurrency, 'currentPrice');
      const convertedBidIncrement = convertPrice(auction, userCurrency, 'bidIncrement');
      const convertedBuyNowPrice = convertPrice(auction, userCurrency, 'buyNowPrice');
      const convertedReservePrice = convertPrice(auction, userCurrency, 'reservePrice');
      const convertedFinalPrice = convertPrice(auction, userCurrency, 'finalPrice');

      return {
        ...auctionObj,
        bids: convertedBids,
        convertedStartPrice: convertedStartPrice !== null ? parseFloat(convertedStartPrice.toFixed(2)) : null,
        convertedCurrentPrice: convertedCurrentPrice !== null ? parseFloat(convertedCurrentPrice.toFixed(2)) : null,
        convertedBidIncrement: convertedBidIncrement !== null ? parseFloat(convertedBidIncrement.toFixed(2)) : null,
        convertedBuyNowPrice: convertedBuyNowPrice !== null ? parseFloat(convertedBuyNowPrice.toFixed(2)) : null,
        convertedReservePrice: convertedReservePrice !== null ? parseFloat(convertedReservePrice.toFixed(2)) : null,
        convertedFinalPrice: convertedFinalPrice !== null ? parseFloat(convertedFinalPrice.toFixed(2)) : null,
        displayCurrency: userCurrency
      };
    });

    const total = await Auction.countDocuments(filter);

    // Paginate after conversion
    const paginatedAuctions = auctionsWithConverted.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        auctions: paginatedAuctions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalAuctions: total,
          hasNextPage: skip + paginatedAuctions.length < total,
          hasPrevPage: skip > 0,
        },
      },
    });
  } catch (error) {
    console.error("Get user auctions error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching user auctions",
    });
  }
};

// Detailed bidding stats
export const getBiddingStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Basic counts - FIXED: Remove userId from these queries
    const activeAuctions = await Auction.countDocuments({
      status: "active",
      endDate: { $gt: now },
    });

    const endingSoon = await Auction.countDocuments({
      status: "active",
      endDate: {
        $gt: now,
        $lt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newToday = await Auction.countDocuments({
      status: "active",
      createdAt: { $gte: today },
    });

    const totalBidders = await User.countDocuments({ userType: "bidder" });

    // Bidder-specific analytics - FIXED: Proper aggregation
    const myTotalBidsResult = await Auction.aggregate([
      {
        $match: {
          "bids.bidder": userId,
        },
      },
      {
        $project: {
          userBids: {
            $filter: {
              input: "$bids",
              as: "bid",
              cond: { $eq: ["$$bid.bidder", userId] },
            },
          },
        },
      },
      {
        $project: {
          bidCount: { $size: "$userBids" },
        },
      },
      {
        $group: {
          _id: null,
          totalBids: { $sum: "$bidCount" },
        },
      },
    ]);

    const myWinningAuctions = await Auction.countDocuments({
      winner: userId,
      status: "sold",
    });

    const myActiveBids = await Auction.countDocuments({
      "bids.bidder": userId,
      status: "active",
      endDate: { $gt: now },
    });

    // Recent activity (last 30 days) - FIXED: Proper aggregation
    const recentBids = await Auction.aggregate([
      {
        $match: {
          "bids.bidder": userId,
          "bids.timestamp": { $gte: thirtyDaysAgo },
        },
      },
      { $unwind: "$bids" },
      {
        $match: {
          "bids.bidder": userId,
          "bids.timestamp": { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$bids.timestamp" },
          },
          bidsCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const myTotalBids = myTotalBidsResult[0]?.totalBids || 0;
    const bidSuccessRate =
      myTotalBids > 0
        ? ((myWinningAuctions / myTotalBids) * 100).toFixed(1)
        : 0;

    res.status(200).json({
      success: true,
      data: {
        // Basic stats
        activeAuctions,
        newToday,
        endingSoon,
        totalBidders,

        // Bidder personal stats
        myTotalBids,
        myWinningAuctions,
        myActiveBids,

        // Analytics
        bidSuccessRate: parseFloat(bidSuccessRate),

        // Recent activity
        recentBiddingActivity: recentBids,

        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    console.error("Get bidding stats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching bidding stats",
    });
  }
};

// Get user's won auctions
export const getWonAuctions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 12, status, search } = req.query;
    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    // Build filter for auctions won by user
    const filter = {
      winner: userId,
      status: { $in: ["sold", "ended"] },
    };

    if (status && status !== "all") {
      const statusMap = {
        payment_pending: "sold",
        paid: "sold",
        shipped: "sold",
        delivered: "sold",
      };
      filter.status = statusMap[status] || status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { categories: { $in: [new RegExp(search, "i")] } },
      ];
    }

    const auctions = await Auction.find(filter)
      .populate("seller", "username companyName firstName lastName email phone createdAt company")
      .populate("winner", "username companyName firstName lastName email phone image")
      .populate("currentBidder", "username companyName firstName")
      .populate("bids.bidder", "username companyName firstName lastName email")
      .sort({ endDate: -1 });

    const total = await Auction.countDocuments(filter);

    // Get existing reviews by this user for these auctions
    const auctionIds = auctions.map(a => a._id);
    const userReviews = await Review.find({ auction: { $in: auctionIds }, reviewer: userId }).select("auction");
    const reviewedAuctionIds = userReviews.map(r => r.auction.toString());

    const auctionsWithConverted = auctions.map(auction => {
      const auctionObj = auction.toObject();

      // Default to original values if conversion fails
      let convertedStartPrice = auctionObj.startPrice;
      let convertedCurrentPrice = auctionObj.currentPrice;
      let convertedFinalPrice = auctionObj.finalPrice;
      let convertedBuyNowPrice = auctionObj.buyNowPrice;
      let convertedReservePrice = auctionObj.reservePrice;
      let convertedBidIncrement = auctionObj.bidIncrement;
      let convertedCommissionAmount = auctionObj.bidderCommissionAmount || 0;
      let convertedFeaturedPremium = auctionObj.featuredPremium;

      if (rates && auctionObj.baseCurrency) {
        const base = auctionObj.baseCurrency;
        const target = userCurrency;
        const rate = rates[base]?.rates[target];
        if (rate && typeof rate === 'number') {
          convertedStartPrice = auctionObj.startPrice * rate;
          convertedCurrentPrice = auctionObj.currentPrice * rate;
          convertedFinalPrice = auctionObj.finalPrice ? auctionObj.finalPrice * rate : null;
          convertedBuyNowPrice = auctionObj.buyNowPrice ? auctionObj.buyNowPrice * rate : null;
          convertedReservePrice = auctionObj.reservePrice ? auctionObj.reservePrice * rate : null;
          convertedBidIncrement = auctionObj.bidIncrement ? auctionObj.bidIncrement * rate : null;
          convertedCommissionAmount = auctionObj.bidderCommissionAmount ? auctionObj.bidderCommissionAmount * rate : null;
          convertedFeaturedPremium = auctionObj.featuredPremium ? auctionObj.featuredPremium * rate : null;
        }
      }

      return {
        ...auctionObj,
        convertedStartPrice: parseFloat(convertedStartPrice.toFixed(2)),
        convertedCurrentPrice: parseFloat(convertedCurrentPrice.toFixed(2)),
        convertedFinalPrice: convertedFinalPrice !== null ? parseFloat(convertedFinalPrice.toFixed(2)) : null,
        convertedBuyNowPrice: convertedBuyNowPrice !== null ? parseFloat(convertedBuyNowPrice.toFixed(2)) : null,
        convertedReservePrice: convertedReservePrice !== null ? parseFloat(convertedReservePrice.toFixed(2)) : null,
        convertedBidIncrement: convertedBidIncrement !== null ? parseFloat(convertedBidIncrement.toFixed(2)) : null,
        convertedCommissionAmount: convertedCommissionAmount !== null ? parseFloat(convertedCommissionAmount.toFixed(2)) : null,
        convertedFeaturedPremium: convertedFeaturedPremium !== null ? parseFloat(convertedFeaturedPremium.toFixed(2)) : null,
        displayCurrency: userCurrency,
        ...getManualPaymentFlags(auction),
        // Add review info (unchanged)
        userReview: reviewedAuctionIds.includes(auction._id.toString()),
      };
    });

    // Calculate totalSpent using converted final prices
    let totalSpentConverted = 0;
    for (const auction of auctionsWithConverted) {
      totalSpentConverted += auction.convertedFinalPrice || auction.convertedCurrentPrice || 0;
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentWins = auctions.filter(
      (auction) => new Date(auction.endDate) > weekAgo,
    ).length;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedAuctions = auctionsWithConverted.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        auctions: paginatedAuctions,
        statistics: {
          totalWon: total,
          totalSpent: parseFloat(totalSpentConverted.toFixed(2)),
          averageSpent: total > 0 ? parseFloat((totalSpentConverted / total).toFixed(2)) : 0,
          recentWins
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalAuctions: total,
          hasNextPage: skip + paginatedAuctions.length < total,
          hasPrevPage: skip > 0,
        },
      },
    });
  } catch (error) {
    console.error("Get won auctions error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching won auctions",
    });
  }
};

// Helper function to get user's max bid
const getMaxBidForUser = (bids, userId) => {
  const userBids = bids.filter(
    (bid) => bid.bidder.toString() === userId.toString(),
  );
  if (userBids.length === 0) return 0;
  return Math.max(...userBids.map((bid) => bid.amount));
};

// Helper function to generate congratulatory messages
const generateCongratulatoryMessage = (auction) => {
  const messages = {
    Aircraft: "Congratulations on winning this magnificent aircraft!",
    "Engines & Parts":
      "Outstanding win! This is a fantastic addition to any collection.",
    "Aviation Memorabilia":
      "Fantastic win! This piece is in impeccable condition and holds great historical value.",
  };

  return (
    messages[auction.category] || "Congratulations on winning the auction!"
  );
};

// Get seller's sold auctions
export const getSoldAuctions = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 12, status, search } = req.query;
    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    const filter = {
      seller: sellerId,
      status: { $in: ["sold"] },
    };

    if (status && status !== "all") {
      const statusMap = {
        sold: "sold",
        ended: "ended",
        reserve_not_met: "reserve_not_met",
      };
      filter.status = statusMap[status] || status;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { categories: { $in: [new RegExp(search, "i")] } },
      ];
    }

    const auctions = await Auction.find(filter)
      .populate("seller", "username companyName firstName lastName email phone createdAt company")
      .populate("winner", "username companyName firstName lastName email phone image")
      .populate("currentBidder", "username companyName firstName")
      .populate("bids.bidder", "username companyName firstName lastName email phone")
      .sort({ endDate: -1 });

    const total = await Auction.countDocuments(filter);

    // Get existing reviews by this user for these auctions
    const auctionIds = auctions.map(a => a._id);
    const userReviews = await Review.find({ auction: { $in: auctionIds }, reviewer: sellerId }).select("auction");
    const reviewedAuctionIds = userReviews.map(r => r.auction.toString());

    const transformedAuctions = auctions.map((auction) => {
      const auctionObj = auction.toObject();
      const base = auction.baseCurrency;
      const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

      // Helper to convert a single price field
      const convert = (value) => (value !== null && value !== undefined) ? parseFloat((value * rate).toFixed(2)) : null;

      // Convert all price fields
      const convertedStartPrice = convert(auction.startPrice);
      const convertedCurrentPrice = convert(auction.currentPrice);
      const convertedFinalPrice = convert(auction.finalPrice);
      const convertedReservePrice = convert(auction.reservePrice);
      const convertedBidIncrement = convert(auction.bidIncrement);
      const convertedCommissionAmount = convert(auction.sellerCommissionAmount || 0);
      const convertedFeaturedPremium = convert(auction.featuredPremium);

      // Build list of unique bidders with their highest bid (convert bid amounts)
      const uniqueBidders = auction.bids.reduce((acc, bid) => {
        if (!bid.bidder?._id) return acc;
        const bidderId = bid.bidder._id.toString();
        const existing = acc.find(b => b.id === bidderId);
        const convertedBidAmount = convert(bid.amount);
        if (!existing || bid.amount > existing.finalBidOriginal) {
          const filtered = acc.filter(b => b.id !== bidderId);
          return [
            ...filtered,
            {
              id: bidderId,
              name: bid.bidder.firstName && bid.bidder.lastName
                ? `${bid.bidder.firstName} ${bid.bidder.lastName}`
                : bid.bidder.username ? bid.bidder.username : bid.bidder.companyName,
              username: bid.bidder.username || bid.bidder.companyName,
              email: bid.bidder.email,
              phone: bid.bidder.phone,
              finalBid: convertedBidAmount,
              finalBidOriginal: bid.amount,
              bidTime: bid.timestamp,
              isWinner: auction.winner?._id?.toString() === bidderId,
            },
          ];
        }
        return acc;
      }, []).sort((a, b) => b.finalBid - a.finalBid);

      // Convert winner's bid history
      const convertedBidHistory = auction.bids
        .filter(bid => bid.bidder?._id?.toString() === auction.winner?._id?.toString())
        .map(bid => ({
          amount: convert(bid.amount),
          amountOriginal: bid.amount,
          time: bid.timestamp
        }))
        .sort((a, b) => new Date(a.time) - new Date(b.time));

      return {
        id: auction._id.toString(),
        auctionId: `AV${auction._id.toString().slice(-6).toUpperCase()}`,
        title: auction.title,
        description: auction.description,
        categories: auction.categories,
        auctionType: auction.auctionType === "reserve" ? "Reserve Auction" : "Standard Auction",
        // Original values
        reservePriceOriginal: auction.reservePrice,
        startPriceOriginal: auction.startPrice,
        currentPriceOriginal: auction.currentPrice,
        finalPriceOriginal: auction.finalPrice,
        bidIncrementOriginal: auction.bidIncrement,
        commissionAmountOriginal: auction.commissionAmount,
        featuredPremiumOriginal: auction.featuredPremium,
        // Converted values
        convertedStartPrice,
        convertedCurrentPrice,
        convertedFinalPrice,
        convertedReservePrice,
        convertedBidIncrement,
        convertedCommissionAmount,
        convertedFeaturedPremium,
        displayCurrency: userCurrency,
        startDate: auction.startDate,
        endDate: auction.endDate,
        status: auction.status,
        paymentStatus: auction.paymentStatus,
        paymentMethod: auction.paymentMethod,
        paymentDate: auction.paymentDate,
        transactionId: auction.transactionId,
        hasInvoice: !!(auction.invoice && auction.invoice.url),
        invoice: auction.invoice || null,
        auctionStatus: auction.status,
        createdAt: auction.createdAt,
        updatedAt: auction.updatedAt,
        location: auction.location,
        reserveMet: auction.currentPrice >= auction.reservePrice,
        seller: auction.seller
          ? {
            _id: auction.seller._id.toString(),
            firstName: auction.seller.firstName,
            lastName: auction.seller.lastName,
            username: auction.seller.username || "",
            companyName: auction.seller?.companyName || "",
            email: auction.seller.email,
            phone: auction.seller.phone,
            createdAt: auction.seller.createdAt,
          }
          : null,
        currentBidder: auction.currentBidder
          ? {
            _id: auction.currentBidder._id.toString(),
            name: auction.currentBidder.firstName
              ? `${auction.currentBidder.firstName} ${auction.currentBidder.lastName}`
              : auction.currentBidder.username ? auction.currentBidder.username : auction.currentBidder.companyName,
          }
          : null,
        winner: auction.winner
          ? {
            id: auction.winner._id.toString(),
            name: auction.winner.firstName && auction.winner.lastName
              ? `${auction.winner.firstName} ${auction.winner.lastName}`
              : auction.winner.username ? auction.winner.username : auction.winner.companyName,
            username: auction.winner.username || '',
            companyName: auction.winner.companyName,
            email: auction.winner.email,
            phone: auction.winner.phone,
            image: auction.winner.image,
            bidHistory: convertedBidHistory,
            bidHistoryOriginal: auction.bids
              .filter(bid => bid.bidder?._id?.toString() === auction.winner._id.toString())
              .map(bid => ({ amount: bid.amount, time: bid.timestamp }))
              .sort((a, b) => new Date(a.time) - new Date(b.time)),
          }
          : null,
        bidders: uniqueBidders.filter(bidder => !auction.winner || bidder.id !== auction.winner._id.toString()),
        userReview: reviewedAuctionIds.includes(auction._id.toString()),
      };
    });

    // Calculate totalRevenue using converted final prices
    let totalRevenueConverted = 0;
    for (const auction of transformedAuctions) {
      totalRevenueConverted += auction.convertedFinalPrice || auction.convertedCurrentPrice || 0;
    }

    res.status(200).json({
      success: true,
      data: {
        auctions: transformedAuctions,
        statistics: {
          totalSold: total,
          totalRevenue: parseFloat(totalRevenueConverted.toFixed(2)),
          averageSalePrice: total > 0 ? parseFloat((totalRevenueConverted / total).toFixed(2)) : 0,
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalAuctions: total,
        },
      },
    });
  } catch (error) {
    console.error("Get sold auctions error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching sold auctions",
    });
  }
};

export const lowerReservePrice = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = req.user;
    const { newReservePrice, currency } = req.body;

    // Validate input
    if (!newReservePrice || isNaN(parseFloat(newReservePrice))) {
      return res.status(400).json({
        success: false,
        message: "Valid new reserve price is required",
      });
    }

    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Check if user owns the auction
    if (auction.seller.toString() !== seller._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only modify your own auctions",
      });
    }

    // Check if auction is active
    if (auction.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Can only lower reserve price for active auctions",
      });
    }

    // Check if auction has reserve price
    if (auction.auctionType !== "reserve") {
      return res.status(400).json({
        success: false,
        message: "Only reserve auctions can have reserve prices",
      });
    }

    // ========== CURRENCY CONVERSION ==========
    const base = auction.baseCurrency || "EUR";
    const userCurrency = currency || base;

    let newPriceInBase;
    let clientToBase = 1;
    let baseToClient = 1;

    if (userCurrency !== base) {
      const rates = getCachedRates();
      if (!rates) {
        return res.status(503).json({
          success: false,
          message: "Exchange rates unavailable. Please try again.",
        });
      }

      clientToBase = rates?.[userCurrency]?.rates?.[base];
      baseToClient = rates?.[base]?.rates?.[userCurrency];

      if (!clientToBase || !baseToClient) {
        return res.status(400).json({
          success: false,
          message: "Currency conversion unavailable for the selected currency",
        });
      }

      newPriceInBase = parseFloat(
        (parseFloat(newReservePrice) * clientToBase).toFixed(2)
      );
    } else {
      newPriceInBase = parseFloat(newReservePrice);
    }
    // ==========================================

    const currentReserve = parseFloat(auction.reservePrice);

    // Validate new reserve price is lower (both in base currency)
    if (newPriceInBase >= currentReserve) {
      const maxClient = parseFloat((currentReserve * baseToClient).toFixed(2));
      return res.status(400).json({
        success: false,
        message: `New reserve price must be lower than the current reserve (${maxClient} ${userCurrency})`,
      });
    }

    // Validate positive price
    if (newPriceInBase <= 0) {
      return res.status(400).json({
        success: false,
        message: "Reserve price must be greater than 0",
      });
    }

    // RexBid minimum reserve (€500 or sterling equivalent)
    const minReserveErr = minimumPriceError({
      auctionType: "reserve",
      reservePrice: newPriceInBase,
      currency: auction.baseCurrency || "EUR",
    });
    if (minReserveErr) {
      return res.status(400).json({ success: false, message: minReserveErr });
    }

    // Update reserve price in BASE currency
    auction.reservePrice = newPriceInBase;

    // Save the auction
    const updatedAuction = await auction.save();

    // Populate seller info for response
    await updatedAuction.populate(
      "seller",
      "username companyName firstName lastName"
    );

    broadcastAuctionChange(id);

    // Return converted values so the frontend can update its local state
    const auctionObj = updatedAuction.toObject();
    const convert = (value) =>
      value !== null && value !== undefined
        ? parseFloat((value * baseToClient).toFixed(2))
        : null;

    res.status(200).json({
      success: true,
      message: "Reserve price lowered successfully",
      data: {
        auction: {
          ...auctionObj,
          convertedReservePrice: convert(auctionObj.reservePrice),
          convertedCurrentPrice: convert(auctionObj.currentPrice),
          convertedStartPrice: convert(auctionObj.startPrice),
          displayCurrency: userCurrency,
        },
      },
    });
  } catch (error) {
    console.error("Lower reserve price error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while lowering reserve price",
    });
  }
};

/**
 * @desc    Buy Now - Purchase item immediately
 * @route   POST /api/v1/auctions/buy-now/:id
 * @access  Private
 */
export const buyNow = async (req, res) => {
  try {
    const { id } = req.params;
    const { currency, amount } = req.body;
    const buyer = req.user;

    // Validate auction status
    if (!buyer?.isActive) {
      return res.status(400).json({
        success: false,
        message: `Account is inactive. Can't buy an item.`,
      });
    }

    // Validate auction status
    if (!buyer?.isVerified) {
      return res.status(400).json({
        success: false,
        message: `Please wait until administrator has verified your account before buying an item.`,
      });
    }

    // Check if user is a bidder
    // if (buyer?.userType !== "bidder") {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Only bidders can buy items",
    //   });
    // }

    // Find auction
    const auction = await Auction.findById(id)
      .populate("seller", "username companyName firstName lastName email phone")
      .populate(
        "currentBidder",
        "username companyName firstName lastName email phone",
      )
      .populate("winner", "username companyName firstName lastName email phone");

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
        message: "You cannot buy your own auction",
      });
    }

    // Validate auction can be bought
    if (auction.auctionType === "giveaway") {
      // For giveaways, no price check needed
      console.log("Processing free giveaway claim");
    } else {
      // For regular buy now, check price exists
      if (!auction.buyNowPrice) {
        return res.status(400).json({
          success: false,
          message: "Buy Now is not available for this auction",
        });
      }
    }

    if (auction.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Auction is not active. Current status: ${auction.status}`,
      });
    }

    // For regular auctions, check end date
    if (auction.auctionType !== "giveaway" && new Date() > auction.endDate) {
      return res.status(400).json({
        success: false,
        message: "Auction has already ended",
      });
    }

    if (auction.winner) {
      return res.status(400).json({
        success: false,
        message: "Auction already has a winner",
      });
    }

    const rates = getCachedRates();
    const base = auction.baseCurrency;
    const buyerCurr = currency;
    const rate = rates[buyerCurr]?.rates[base];
    if (!rate) return res.status(400).json({ success: false, message: "Conversion error" });
    const amountInBase = parseFloat(amount) * rate;

    // Compare with the stored buyNowPrice (which is in base currency)
    if (Math.abs(amountInBase - auction.buyNowPrice) > 0.01) {
      return res.status(400).json({ success: false, message: "Price mismatch. Please refresh." });
    }

    // Execute Buy Now using the model method
    await auction.buyNow(buyer._id, buyer.username || buyer.companyName);

    // Populate updated auction
    const updatedAuction = await Auction.findById(id)
      .populate("seller", "username companyName firstName lastName email currency phone")
      .populate("winner", "username companyName firstName lastName email phone currency")
      .populate("bids.bidder", "username companyName firstName lastName currency");

    // Custom message for giveaway
    const successMessage =
      auction.auctionType === "giveaway"
        ? "🎉 Congratulations! You have claimed this item for free!"
        : "Congratulations! You have purchased this item.";

    broadcastAuctionChange(id);

    res.status(200).json({
      success: true,
      message: successMessage,
      data: {
        auction: updatedAuction,
      },
    });

    // Send emails (in background)
    sendAuctionEndedSellerEmail(updatedAuction).catch((error) =>
      console.error("Failed to send seller ended auction email:", error),
    );

    sendAuctionWonEmail(updatedAuction).catch((error) =>
      console.error("Failed to send buyer won auction email:", error),
    );

    // Send admin emails to all admin users
    try {
      const adminUsers = await User.find({ userType: "admin" }).select(
        "email firstName",
      );

      if (adminUsers.length === 0) {
        console.log('⚠️ No admin users found with userType: "admin"');
      } else {
        for (const admin of adminUsers) {
          auctionWonAdminEmail(
            admin?.email,
            admin?.currency,
            updatedAuction,
            updatedAuction?.winner,
          ).catch((error) =>
            console.error(
              `Failed to send admin email to ${admin.email}:`,
              error,
            ),
          );
        }
        console.log(
          `✅ Sent admin notifications to ${adminUsers.length} admin(s)`,
        );
      }
    } catch (adminEmailError) {
      console.error(
        "Error fetching admin users or sending admin emails:",
        adminEmailError,
      );
    }
  } catch (error) {
    console.error("Buy Now error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to complete Buy Now purchase",
    });
  }
};

/**
 * @desc    Check if Buy Now is available
 * @route   GET /api/v1/auctions/:id/buy-now/check
 * @access  Private
 */
export const checkBuyNowAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    const isAvailable =
      auction.buyNowPrice &&
      auction.auctionType === "buy_now" &&
      auction.status === "active" &&
      !auction.winner &&
      auction.seller.toString() !== userId.toString();

    res.status(200).json({
      success: true,
      data: {
        isAvailable,
        buyNowPrice: auction.buyNowPrice,
        auctionStatus: auction.status,
        hasWinner: !!auction.winner,
        isSeller: auction.seller.toString() === userId.toString(),
      },
    });
  } catch (error) {
    console.error("Check Buy Now error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check Buy Now availability",
    });
  }
};

/**
 * @desc    Get commission info for an auction
 * @route   GET /api/v1/auctions/:id/commission
 * @access  Private
 */
export const getAuctionCommission = async (req, res) => {
  try {
    const { id } = req.params;

    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Get global commission settings
    const commission = await Commission.findOne();

    res.status(200).json({
      success: true,
      data: {
        auctionId: auction._id,
        finalPrice: auction.finalPrice,
        commissionAmount: auction.commissionAmount,
        sellerCommissionAmount: auction.sellerCommissionAmount || 0,
        bidderCommissionAmount: auction.bidderCommissionAmount || 0,
        commissionType: auction.commissionType,
        commissionValue: auction.commissionValue,
        globalSettings: commission,
      },
    });
  } catch (error) {
    console.error("Get auction commission error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch commission info",
    });
  }
};

export const markAsFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const seller = req.user;

    const auction = await Auction.findById(id);
    if (!auction) {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }

    // Security: only seller can feature own auction
    if (auction.seller.toString() !== seller._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Validation: cannot feature already sold/ended auction
    if (auction.status !== 'active' && auction.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Auction cannot be featured in its current state' });
    }

    if (auction.isFeatured) {
      return res.status(400).json({ success: false, message: 'Auction is already featured' });
    }

    auction.isFeatured = true;
    await auction.save();

    res.status(200).json({
      success: true,
      message: 'Auction marked as featured.',
      data: { auction },
    });
  } catch (error) {
    console.error('Mark as featured error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get a single "hot listing" based on weighted score (bidCount * currentPrice)
export const getHotListing = async (req, res) => {
  try {
    const now = new Date();
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

    // Build filter for active listings (status active, endDate in future)
    const filter = {
      status: "active",
      endDate: { $gt: now },
    };

    // Optional: add category filter if provided
    if (req.query.category && req.query.category !== "all") {
      filter.categories = req.query.category;
    }

    // Find all active listings matching filter
    let listings = await Auction.find(filter)
      .populate("seller", "username companyName firstName lastName location")
      .populate("currentBidder", "username companyName firstName")
      .lean(); // use lean for performance

    if (!listings.length) {
      // Fallback 1: try ended but sold listings (for demo/empty state)
      listings = await Auction.find({ status: "approved" })
        .populate("seller", "username companyName firstName lastName location")
        .populate("winner", "username companyName firstName")
        .sort({ finalPrice: -1 })
        .limit(1)
        .lean();

      if (!listings.length) {
        return res.status(404).json({
          success: false,
          message: "No active listings found to feature as hot listing",
        });
      }

      // Convert the fallback auction
      const fallbackAuction = listings[0];
      const convertedCurrentPrice = convertAmount(fallbackAuction.currentPrice, fallbackAuction);
      const convertedStartPrice = convertAmount(fallbackAuction.startPrice, fallbackAuction);
      const convertedFinalPrice = convertAmount(fallbackAuction.finalPrice, fallbackAuction);

      return res.status(200).json({
        success: true,
        data: {
          auction: sanitizeAuctionForViewer({
            ...fallbackAuction,
            convertedCurrentPrice,
            convertedStartPrice,
            convertedFinalPrice,
            displayCurrency: userCurrency,
          }, req.user),
          note: "No active listings available – showing recent sold item.",
        },
      });
    }

    // Calculate weighted score using converted current price for fair comparison
    // Convert each listing's current price to user's currency for scoring
    const scoredListings = listings.map((listing) => {
      const convertedCurrentPrice = convertAmount(listing.currentPrice, listing);
      // Use converted price for hotScore calculation (now all in same currency)
      const hotScore = (listing.bidCount + 1) * convertedCurrentPrice;

      return {
        ...listing,
        convertedCurrentPrice,
        convertedStartPrice: convertAmount(listing.startPrice, listing),
        convertedBuyNowPrice: convertAmount(listing.buyNowPrice, listing),
        convertedReservePrice: convertAmount(listing.reservePrice, listing),
        convertedFinalPrice: convertAmount(listing.finalPrice, listing),
        displayCurrency: userCurrency,
        hotScore,
        hotScoreOriginal: (listing.bidCount + 1) * listing.currentPrice, // keep for reference
      };
    });

    // Sort by hotScore descending
    scoredListings.sort((a, b) => b.hotScore - a.hotScore);

    // Pick the top one
    const hotListing = scoredListings[0];

    res.status(200).json({
      success: true,
      data: {
        auction: sanitizeAuctionForViewer(hotListing, req.user),
        score: hotListing.hotScore,
        scoreOriginal: hotListing.hotScoreOriginal,
        displayCurrency: userCurrency,
      },
    });
  } catch (error) {
    console.error("Get hot listing error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching hot listing",
    });
  }
};

// Get featured active listings (isFeatured = true, status = active, endDate > now)
export const getFeaturedListings = async (req, res) => {
  try {
    const {
      limit = 8,
      page = 1,
      sortBy = "highestBid", // highestBid, newest, endingSoon, mostBids
      category,
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

    const now = new Date();
    const filter = {
      isFeatured: true,
      status: "active",
      endDate: { $gt: now },
    };

    if (category && category !== "all") {
      filter.categories = category;
    }

    // Get all matching auctions first (to convert prices for sorting)
    const allListings = await Auction.find(filter)
      .populate("seller", "username companyName firstName lastName location")
      .populate("currentBidder", "username companyName firstName")
      .lean();

    // Convert prices and add to each listing
    const listingsWithConverted = allListings.map(listing => ({
      ...listing,
      convertedCurrentPrice: convertAmount(listing.currentPrice, listing),
      convertedStartPrice: convertAmount(listing.startPrice, listing),
      convertedBuyNowPrice: convertAmount(listing.buyNowPrice, listing),
      convertedReservePrice: convertAmount(listing.reservePrice, listing),
      convertedFinalPrice: convertAmount(listing.finalPrice, listing),
      convertedBidIncrement: convertAmount(listing.bidIncrement, listing),
      displayCurrency: userCurrency,
    }));

    // Sort using converted prices
    let sortedListings = [...listingsWithConverted];
    switch (sortBy) {
      case "highestBid":
        sortedListings.sort((a, b) => b.convertedCurrentPrice - a.convertedCurrentPrice);
        break;
      case "mostBids":
        sortedListings.sort((a, b) => b.bidCount - a.bidCount);
        break;
      case "endingSoon":
        sortedListings.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
        break;
      case "newest":
        sortedListings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      default:
        sortedListings.sort((a, b) => b.convertedCurrentPrice - a.convertedCurrentPrice);
    }

    // Paginate
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedListings = sortedListings.slice(skip, skip + parseInt(limit));
    const total = sortedListings.length;

    res.status(200).json({
      success: true,
      data: {
        listings: paginatedListings.map((l) => sanitizeAuctionForViewer(l, req.user)),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        displayCurrency: userCurrency,
      },
    });
  } catch (error) {
    console.error("Get featured listings error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching featured listings",
    });
  }
};

/**
 * @desc    Participate in a giveaway auction
 * @route   POST /api/v1/auctions/:id/participate
 * @access  Public
 */
export const participateInGiveaway = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phoneNumber } = req.body;
    const userId = req.user?._id;

    // Validate required fields
    if (!email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Email and phone number are required",
      });
    }

    // Find the auction
    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Verify it's a giveaway auction
    if (auction.auctionType !== "giveaway") {
      return res.status(400).json({
        success: false,
        message: "This is not a giveaway auction",
      });
    }

    // Check if auction is still active/available
    if (auction.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "This giveaway is no longer active",
      });
    }

    // Check if already has a winner
    if (auction.winner) {
      return res.status(400).json({
        success: false,
        message: "This giveaway has already been claimed",
      });
    }

    // Check if user/email already participated
    const existingParticipant = auction.participants.find(
      p => p.email.toLowerCase() === email.toLowerCase() ||
        (userId && p.user && p.user.toString() === userId.toString())
    );

    if (existingParticipant) {
      return res.status(400).json({
        success: false,
        message: "You have already participated in this giveaway",
      });
    }

    // Add participant
    auction.participants.push({
      user: userId || null,
      email: email.toLowerCase(),
      phoneNumber,
      participatedAt: new Date(),
      isWinner: false,
    });

    await auction.save();

    // Populate for response
    await auction.populate("participants.user", "username companyName email phone");

    // await giveawayParticipationEmail(
    //   email,
    //   auction
    // );

    res.status(200).json({
      success: true,
      message: "Successfully entered the giveaway!",
      data: {
        participants: auction.participants,
        totalParticipants: auction.participants.length,
      },
    });

  } catch (error) {
    console.error("Giveaway participation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while participating in giveaway",
    });
  }
};

/**
 * @desc    Select winner for giveaway (Admin only)
 * @route   POST /api/v1/auctions/:id/select-winner
 * @access  Private (Admin)
 */
export const selectGiveawayWinner = async (req, res) => {
  try {
    const { id } = req.params;
    const { participantId } = req.body; // Optional - can select specific participant

    const auction = await Auction.findById(id);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    if (auction.auctionType !== "giveaway") {
      return res.status(400).json({
        success: false,
        message: "This is not a giveaway.",
      });
    }

    if (auction.winner) {
      return res.status(400).json({
        success: false,
        message: "This giveaway already has a winner",
      });
    }

    if (auction.participants.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No participants to select a winner from",
      });
    }

    let selectedParticipant;

    if (participantId) {
      // Select specific participant
      selectedParticipant = auction.participants.id(participantId);
      if (!selectedParticipant) {
        return res.status(404).json({
          success: false,
          message: "Participant not found",
        });
      }
    } else {
      // Randomly select a winner
      const randomIndex = Math.floor(Math.random() * auction.participants.length);
      selectedParticipant = auction.participants[randomIndex];
    }

    // Mark as winner
    selectedParticipant.isWinner = true;

    // Set auction details
    auction.winner = selectedParticipant.user || null;
    auction.status = "sold";
    auction.finalPrice = 0; // Giveaway is free
    auction.endDate = new Date();

    await auction.save();

    // Populate for response
    await auction.populate("winner", "username companyName email phone");

    // await giveawayWinnerEmail(
    //   auction?.winner?.email,
    //   auction?.winner.firstName || winner.companyName || winner.username,
    //   auction
    // );

    res.status(200).json({
      success: true,
      message: "Winner selected successfully!",
      data: {
        winner: selectedParticipant,
        auction,
      },
    });

  } catch (error) {
    console.error("Select giveaway winner error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while selecting winner",
    });
  }
};

/**
 * @desc    Get giveaway participants
 * @route   GET /api/v1/auctions/:id/participants
 * @access  Private (Admin)
 */
export const getGiveawayParticipants = async (req, res) => {
  try {
    const { id } = req.params;

    const auction = await Auction.findById(id)
      .populate("participants.user", "username companyName email phone");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    if (auction.auctionType !== "giveaway") {
      return res.status(400).json({
        success: false,
        message: "This is not a giveaway.",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        totalParticipants: auction.participants.length,
        participants: auction.participants,
        hasWinner: !!auction.winner,
        winner: auction.winner,
      },
    });

  } catch (error) {
    console.error("Get participants error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching participants",
    });
  }
};

/**
 * @desc    Retry an unpaid extras payment for a draft auction
 * @route   POST /api/v1/auctions/:id/retry-extras-payment
 * @access  Private (seller)
 */
export const retryExtrasPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;

    const auction = await Auction.findById(id);
    if (!auction) {
      return res.status(404).json({ success: false, message: "Auction not found" });
    }
    if (auction.seller.toString() !== sellerId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const extras = auction.extrasPayment;
    if (!extras || !extras.amount || extras.amount <= 0) {
      return res.status(400).json({ success: false, message: "No extras payment required" });
    }
    if (extras.status === "completed") {
      return res.status(400).json({ success: false, message: "Extras already paid" });
    }

    // Try to reuse the existing PaymentIntent if it's still payable.
    let clientSecret = null;
    let paymentIntentId = extras.paymentIntentId;

    if (paymentIntentId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(existing.status)) {
          clientSecret = existing.client_secret;
        }
      } catch (err) {
        console.warn("Retry: existing PI not retrievable:", err.message);
      }
    }

    // Otherwise create a fresh one (old PI may be cancelled/expired).
    if (!clientSecret) {
      const seller = await User.findById(sellerId);
      if (!seller) {
        return res.status(404).json({ success: false, message: "Seller not found" });
      }

      let customerId = seller.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: seller.email,
          name: `${seller.firstName || ""} ${seller.lastName || ""}`.trim() || seller.username,
          metadata: { userId: seller._id.toString() },
        });
        customerId = customer.id;
        await User.findByIdAndUpdate(seller._id, { stripeCustomerId: customerId });
      }

      const pi = await stripe.paymentIntents.create(
        {
          amount: Math.round(extras.amount * 100),
          currency: extras.currency.toLowerCase(),
          customer: customerId,
          description: `Listing extras for "${auction.title}"`,
          payment_method_types: ["card"],
          metadata: {
            type: "listing_extras",
            auctionId: auction._id.toString(),
            sellerId: seller._id.toString(),
          },
        },
        { idempotencyKey: `listing_extras_retry_${auction._id}_${Date.now()}` }
      );

      clientSecret = pi.client_secret;
      paymentIntentId = pi.id;

      await Auction.findByIdAndUpdate(auction._id, {
        "extrasPayment.paymentIntentId": pi.id,
        "extrasPayment.status": "pending",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        clientSecret,
        paymentIntentId,
        amount: extras.amount,
        currency: extras.currency,
        lineItems: extras.lineItems,
      },
    });
  } catch (error) {
    console.error("Retry extras payment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};