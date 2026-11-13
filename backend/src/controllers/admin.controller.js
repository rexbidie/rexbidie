import User from "../models/user.model.js";
import Auction from "../models/auction.model.js";
import Comment from "../models/comment.model.js";
import Watchlist from "../models/watchlist.model.js";
import agendaService from "../services/agendaService.js";
import axios from "axios";
import { broadcastAuctionChange, broadcastAuctionRemoved } from "../services/realtimeService.js";

import {
  deleteFromCloudinary,
  uploadDocumentToCloudinary,
  uploadImageToCloudinary,
} from "../utils/cloudinary.js";

import {
  accountApprovedEmail,
  auctionApprovedEmail,
  auctionListedEmail,
  paymentCompletedEmail,
  paymentCompletedSellerEmail,
  sendBulkAuctionNotifications,
  sendAuctionWonEmail,
  sendAuctionEndedSellerEmail,
  auctionWonAdminEmail,
} from "../utils/nodemailer.js";

import { getCachedRates } from "../routes/currency.route.js";
import AuctionDate from "../models/auctionDate.model.js";
import { checkEmail, EMAIL_FORMAT } from "../utils/emailCheck.js";
import {
  buildClosingSlots,
  dublinDayKey,
  dublinHHMM,
  isValidHHMM,
  SLOT_HOLDING_STATUSES,
} from "../utils/closingSlots.js";
import { calculateCommission } from "../utils/commissionCalculator.js";

const convertPrice = (auction, targetCurrency, priceField) => {
  const rates = getCachedRates();
  if (!rates) return auction[priceField]; // fallback
  const base = auction.baseCurrency;
  const rate = rates[base].rates[targetCurrency];
  if (!rate) return auction[priceField];
  return auction[priceField] * rate;
};

export const getAdminStats = async (req, res) => {
  try {
    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    // Helper to convert amount using auction's base currency
    const convertAmount = (amount, auction) => {
      if (!amount || !auction) return 0;
      if (!rates) return amount;
      const base = auction.baseCurrency || 'EUR';
      const rate = rates[base]?.rates[userCurrency];
      if (!rate) return amount;
      return parseFloat((amount * rate).toFixed(2));
    };

    // Helper to convert a raw amount when we know the base currency
    const convertRawAmount = (amount, baseCurrency) => {
      if (!amount) return 0;
      if (!rates) return amount;
      const rate = rates[baseCurrency]?.rates[userCurrency];
      if (!rate) return amount;
      return parseFloat((amount * rate).toFixed(2));
    };

    // Get total users count
    const totalUsers = await User.countDocuments({ isActive: true });

    // Get user type breakdown
    const userTypeStats = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$userType", count: { $sum: 1 } } },
    ]);

    // Get total auctions count
    const totalAuctions = await Auction.countDocuments();

    // Get auction status breakdown
    const auctionStatusStats = await Auction.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Get active auctions
    const activeAuctions = await Auction.countDocuments({
      status: "active",
      endDate: { $gt: new Date() },
    });

    // Calculate total revenue from sold auctions (converted)
    const soldAuctionsList = await Auction.find({ status: "sold" })
      .populate("seller", "username firstName lastName companyName")
      .populate("winner", "username firstName lastName companyName")
      .select("title finalPrice baseCurrency seller winner createdAt");

    let totalRevenueConverted = 0;
    let highestSaleAmountConverted = 0;
    let highestSaleAuction = null;
    let totalSalePriceSum = 0;
    const soldCount = soldAuctionsList.length;

    for (const auction of soldAuctionsList) {
      const convertedPrice = convertAmount(auction.finalPrice, auction);
      totalRevenueConverted += convertedPrice;
      totalSalePriceSum += convertedPrice;

      if (convertedPrice > highestSaleAmountConverted) {
        highestSaleAmountConverted = convertedPrice;
        highestSaleAuction = auction;
      }
    }

    const totalRevenue = totalRevenueConverted;
    const highestSaleAmount = highestSaleAmountConverted;
    const averageSalePrice = soldCount > 0 ? totalSalePriceSum / soldCount : 0;
    const totalSoldAuctions = soldCount;

    // Calculate success rate
    const completedAuctions = await Auction.countDocuments({
      status: { $in: ["sold", "ended", "reserve_not_met"] },
    });

    const soldAuctions = await Auction.countDocuments({ status: "sold" });
    const successRate =
      completedAuctions > 0
        ? Math.round((soldAuctions / completedAuctions) * 100)
        : 0;

    // Get pending moderation counts
    const pendingAuctions = await Auction.countDocuments({ status: "draft" });
    const pendingUserVerifications = await User.countDocuments({
      isVerified: false,
      isActive: true,
    });

    const pendingModeration = pendingAuctions;
    // Edits to live listings waiting for approval (services/listingEditService.js)
    const pendingListingEdits = await Auction.countDocuments({ "pendingEdit.status": "pending" });

    // Get recent user registrations (last 7 days)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: oneWeekAgo },
    });

    // Get today's revenue (converted)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaySoldAuctions = await Auction.find({
      status: "sold",
      updatedAt: {
        $gte: today,
        $lt: tomorrow,
      },
    }).select("finalPrice baseCurrency");

    let todayRevenueConverted = 0;
    for (const auction of todaySoldAuctions) {
      todayRevenueConverted += convertAmount(auction.finalPrice, auction);
    }

    const todayRevenue = todayRevenueConverted;

    // Get system metrics
    const totalComments = await Comment.countDocuments();

    const watchlistItems = await Watchlist.aggregate([
      {
        $lookup: {
          from: "auctions",
          localField: "auction",
          foreignField: "_id",
          as: "auction",
        },
      },
      {
        $unwind: "$auction",
      },
      {
        $match: {
          "auction.status": "active",
        },
      },
      {
        $count: "count",
      },
    ]);

    const totalWatchlists = watchlistItems[0]?.count || 0;

    // Get bidding activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentBids = await Auction.aggregate([
      { $unwind: "$bids" },
      { $match: { "bids.timestamp": { $gte: yesterday } } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);

    const recentBidsCount = recentBids[0]?.count || 0;

    // Get highest and average bid amounts (converted)
    const allBidsAggregation = await Auction.aggregate([
      { $unwind: "$bids" },
      {
        $group: {
          _id: null,
          highestBidAmount: { $max: "$bids.amount" },
          averageBidAmount: { $avg: "$bids.amount" },
          totalBids: { $sum: 1 },
        },
      },
    ]);

    // Get highest bid auction for conversion
    const highestBidAuction = await Auction.findOne({ "bids.0": { $exists: true } })
      .sort({ "bids.amount": -1 })
      .select("bids baseCurrency");

    let highestBidAmountConverted = 0;
    let averageBidAmountConverted = 0;

    if (allBidsAggregation[0]?.highestBidAmount && highestBidAuction) {
      highestBidAmountConverted = convertRawAmount(
        allBidsAggregation[0].highestBidAmount,
        highestBidAuction.baseCurrency
      );
    }

    if (allBidsAggregation[0]?.averageBidAmount && highestBidAuction) {
      averageBidAmountConverted = convertRawAmount(
        allBidsAggregation[0].averageBidAmount,
        highestBidAuction.baseCurrency
      );
    }

    // Get top performing categories (converted)
    const soldAuctionsForCategories = await Auction.find({ status: "sold" })
      .select("finalPrice baseCurrency categories");

    const categoryMap = new Map();
    for (const auction of soldAuctionsForCategories) {
      const categoryName = auction.categories?.[1] || auction.categories?.[0] || 'Uncategorized';
      const convertedPrice = convertAmount(auction.finalPrice, auction);

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          category: categoryName,
          totalRevenue: 0,
          auctionCount: 0,
          avgPrice: 0,
        });
      }

      const cat = categoryMap.get(categoryName);
      cat.totalRevenue += convertedPrice;
      cat.auctionCount++;
      cat.avgPrice = cat.totalRevenue / cat.auctionCount;
    }

    const categoryStats = Array.from(categoryMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Get user engagement metrics
    const totalBids = await Auction.aggregate([
      { $group: { _id: null, totalBids: { $sum: "$bidCount" } } },
    ]);

    const totalBidsCount = totalBids[0]?.totalBids || 0;

    // Get total offers count
    const totalOffers = await Auction.aggregate([
      { $unwind: "$offers" },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);

    const totalOffersCount = totalOffers[0]?.count || 0;

    // Get offers by status breakdown
    const offersByStatus = await Auction.aggregate([
      { $unwind: "$offers" },
      { $group: { _id: "$offers.status", count: { $sum: 1 } } },
    ]);

    // Get recent offers (last 24 hours)
    const recentOffers = await Auction.aggregate([
      { $unwind: "$offers" },
      { $match: { "offers.createdAt": { $gte: yesterday } } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);

    const recentOffersCount = recentOffers[0]?.count || 0;

    // Calculate total offer value and average offer (converted)
    const allOffers = await Auction.aggregate([
      { $unwind: "$offers" },
      {
        $match: {
          "offers.status": {
            $in: ["pending", "accepted", "rejected", "expired", "withdrawn"],
          },
        },
      },
    ]);

    let totalOfferValueConverted = 0;
    let highestOfferAmountConverted = 0;
    let totalOffersForAvg = 0;

    for (const auction of allOffers) {
      const convertedAmount = convertAmount(auction.offers.amount, auction);
      totalOfferValueConverted += convertedAmount;
      if (convertedAmount > highestOfferAmountConverted) {
        highestOfferAmountConverted = convertedAmount;
      }
      totalOffersForAvg++;
    }

    const totalOfferValue = totalOfferValueConverted;
    const avgOfferAmount = totalOffersForAvg > 0 ? totalOfferValueConverted / totalOffersForAvg : 0;
    const highestOfferAmount = highestOfferAmountConverted;

    // Get auctions ending today
    const auctionsEndingToday = await Auction.countDocuments({
      status: "active",
      endDate: {
        $gte: today,
        $lt: tomorrow,
      },
    });

    const stats = {
      totalUsers,
      totalAuctions,
      activeAuctions,
      totalSoldAuctions,

      userTypeStats: userTypeStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),

      auctionStatusStats: auctionStatusStats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),

      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      todayRevenue: parseFloat(todayRevenue.toFixed(2)),
      highestSaleAmount: parseFloat(highestSaleAmount.toFixed(2)),
      averageSalePrice: parseFloat(averageSalePrice.toFixed(2)),
      highestSaleAuction: highestSaleAuction
        ? {
          title: highestSaleAuction.title,
          amount: parseFloat(convertAmount(highestSaleAuction.finalPrice, highestSaleAuction).toFixed(2)),
          amountOriginal: highestSaleAuction.finalPrice,
          seller: highestSaleAuction.seller?.username || highestSaleAuction.seller?.companyName || "Unknown",
          winner: highestSaleAuction.winner?.username || highestSaleAuction.winner?.companyName || "Unknown",
          date: highestSaleAuction.createdAt,
        }
        : null,

      successRate,
      pendingModeration,
      pendingListingEdits,
      recentUsers,

      totalComments,
      totalWatchlists,
      totalBids: totalBidsCount,
      recentBids: recentBidsCount,
      highestBidAmount: parseFloat(highestBidAmountConverted.toFixed(2)),
      averageBidAmount: parseFloat(averageBidAmountConverted.toFixed(2)),

      totalOffers: totalOffersCount,
      recentOffers: recentOffersCount,
      offersByStatus: offersByStatus.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      pendingOffers: offersByStatus.find(o => o._id === 'pending')?.count || 0,
      totalOfferValue: parseFloat(totalOfferValue.toFixed(2)),
      averageOfferAmount: parseFloat(avgOfferAmount.toFixed(2)),
      highestOfferAmount: parseFloat(highestOfferAmount.toFixed(2)),

      categoryStats,

      avgResponseTime: 2.3,
      systemHealth: 99.8,

      newUsersThisWeek: recentUsers,
      auctionsEndingToday,
      displayCurrency: userCurrency,
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get admin stats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching admin statistics",
    });
  }
};

// Get all users for admin
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", filter = "all" } = req.query;

    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = {
      $or: [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { companyName: { $regex: search, $options: "i" } },
      ],
    };

    // Add filter if not 'all'
    if (filter !== "all") {
      searchQuery.userType = filter;
    }

    // Get users with pagination
    const users = await User.find(searchQuery)
      .select(
        "-password -refreshToken -resetPasswordToken -emailVerificationToken",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(searchQuery);

    // Get user statistics
    const userStats = await User.aggregate([
      {
        $group: {
          _id: "$userType",
          count: { $sum: 1 },
        },
      },
    ]);

    // Convert stats to object
    const stats = {
      total: totalUsers,
      admins: userStats.find((stat) => stat._id === "admin")?.count || 0,
      sellers: userStats.find((stat) => stat._id === "seller")?.count || 0,
      bidders: userStats.find((stat) => stat._id === "bidder")?.count || 0,
    };

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers,
          hasNext: page * limit < totalUsers,
          hasPrev: page > 1,
        },
        stats,
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching users",
    });
  }
};

// Get user details with statistics
export const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "-password -refreshToken -resetPasswordToken -emailVerificationToken",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let userStats = {};

    if (user.userType === "seller") {
      // Seller statistics
      const auctionStats = await Auction.aggregate([
        { $match: { seller: user._id } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalRevenue: { $sum: "$finalPrice" },
          },
        },
      ]);

      const activeAuctions =
        auctionStats.find((stat) => stat._id === "active")?.count || 0;
      const soldAuctions =
        auctionStats.find((stat) => stat._id === "sold")?.count || 0;
      const totalRevenue =
        auctionStats.find((stat) => stat._id === "sold")?.totalRevenue || 0;

      // Calculate rating (you might want to implement a proper rating system)
      const rating = 4.5 + Math.random() * 0.5; // Mock rating for now

      userStats = {
        totalSales: totalRevenue,
        activeListings: activeAuctions,
        totalAuctions: await Auction.countDocuments({ seller: user._id }),
        soldAuctions,
        rating: Math.round(rating * 10) / 10,
      };
    } else if (user.userType === "bidder") {
      // Bidder statistics
      const totalOffers = await Auction.aggregate([
        { $match: { "offers.buyer": user._id } },
        { $unwind: "$offers" },
        { $match: { "offers.buyer": user._id } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      const wonAuctions = await Auction.countDocuments({
        winner: user._id,
        status: "sold",
      });

      const totalAuctionOfferSent = await Auction.countDocuments({
        "offers.buyer": user._id,
      });

      const watchlistItems = await Watchlist.countDocuments({
        user: user._id,
      });

      const totalOffersCount = totalOffers[0]?.count || 0;
      const successRate =
        totalOffersCount > 0
          ? Math.round((wonAuctions / totalAuctionOfferSent) * 100)
          : 0;

      userStats = {
        totalOffers: totalOffersCount,
        auctionsWon: wonAuctions,
        watchlistItems,
        successRate,
      };
    } else if (user.userType === "admin") {
      userStats = {
        role: "Super Admin", // You might want to store this in user model
        lastLogin: user.updatedAt,
      };
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...user.toObject(),
          stats: userStats,
        },
      },
    });
  } catch (error) {
    console.error("Get user details error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching user details",
    });
  }
};

// Update user status (activate/deactivate)
export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true, runValidators: true },
    ).select("-password -refreshToken");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: { user },
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating user status",
    });
  }
};

// Delete user and clean up related data
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account",
      });
    }

    // 1. Cancel all auctions created by this user
    const userAuctions = await Auction.find({ seller: userId });

    for (const auction of userAuctions) {
      // Cancel the auction
      auction.status = "cancelled";

      // Cancel agenda jobs for this auction
      await agendaService.cancelAuctionJobs(auction._id);

      await auction.save();
    }

    // 2. Remove user's bids from all auctions and update current highest bidder
    const auctionsWithUserBids = await Auction.find({
      "bids.bidder": userId,
      status: "active", // Only update active auctions
    });

    for (const auction of auctionsWithUserBids) {
      // Remove all bids by this user
      auction.bids = auction.bids.filter(
        (bid) => bid.bidder.toString() !== userId.toString(),
      );

      // Update bid count
      auction.bidCount = auction.bids.length;

      // Find the new highest bidder
      if (auction.bids.length > 0) {
        // Sort bids by amount descending and get the highest
        const sortedBids = auction.bids.sort((a, b) => b.amount - a.amount);
        const highestBid = sortedBids[0];

        auction.currentBidder = highestBid.bidder;
        auction.currentPrice = highestBid.amount;
      } else {
        // No bids left, reset to start price
        auction.currentBidder = null;
        auction.currentPrice = auction.startPrice;
      }

      await auction.save();
    }

    // 3. Delete user's comments (soft delete by marking as deleted)
    await Comment.updateMany(
      { user: userId },
      {
        status: "deleted",
        deletedAt: new Date(),
        deletedBy: req.user._id,
        adminDeleteReason: "User account deleted by admin",
      },
    );

    // 4. Remove user's watchlist items
    await Watchlist.deleteMany({ user: userId });

    // 5. Finally delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message:
        "User deleted successfully. All related data has been cleaned up.",
      data: {
        cancelledAuctions: userAuctions.length,
        updatedAuctions: auctionsWithUserBids.length,
      },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while deleting user",
    });
  }
};

// Update user role/type
export const updateUserType = async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType } = req.body;

    // Validate user type
    if (!["admin", "seller", "bidder"].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user type",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { userType },
      { new: true, runValidators: true },
    ).select("-password -refreshToken");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `User role updated to ${userType}`,
      data: { user },
    });
  } catch (error) {
    console.error("Update user type error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating user type",
    });
  }
};

// Get all auctions for admin
export const getAllAuctions = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", filter = "all" } = req.query;
    const skip = (page - 1) * limit;
    const userCurrency = req.query.currency || 'EUR';

    // Build search query
    let searchQuery = {
      $or: [
        { title: { $regex: search, $options: "i" } },
        { sellerUsername: { $regex: search, $options: "i" } },
        { categories: { $in: [new RegExp(search, "i")] } },
      ],
    };

    // Add status filter if not 'all'
    if (filter !== "all") {
      if (filter === "active") {
        searchQuery.status = "active";
        searchQuery.endDate = { $gt: new Date() };
      } else if (filter === "pending") {
        searchQuery.status = "draft";
      } else if (filter === "ended") {
        searchQuery.status = { $in: ["ended", "sold", "reserve_not_met"] };
      } else {
        searchQuery.status = filter;
      }
    }

    // Get auctions with pagination and populate seller info
    const auctions = await Auction.find(searchQuery)
      .populate("seller", "firstName lastName username companyName phone email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Convert auctions using convertPrice
    const auctionsWithConverted = auctions.map(auction => {
      const auctionObj = auction.toObject();

      return {
        ...auctionObj,
        convertedStartPrice: convertPrice(auction, userCurrency, 'startPrice'),
        convertedCurrentPrice: convertPrice(auction, userCurrency, 'currentPrice'),
        convertedBidIncrement: convertPrice(auction, userCurrency, 'bidIncrement'),
        convertedBuyNowPrice: convertPrice(auction, userCurrency, 'buyNowPrice'),
        convertedReservePrice: convertPrice(auction, userCurrency, 'reservePrice'),
        convertedFinalPrice: convertPrice(auction, userCurrency, 'finalPrice'),
        displayCurrency: userCurrency
      };
    });

    // Get total count for pagination
    const totalAuctions = await Auction.countDocuments(searchQuery);

    // Get auction statistics
    const auctionStats = await Auction.aggregate([
      {
        $facet: {
          total: [{ $count: "count" }],
          active: [
            {
              $match: {
                status: "active",
                endDate: { $gt: new Date() },
              },
            },
            { $count: "count" },
          ],
          draft: [{ $match: { status: "draft" } }, { $count: "count" }],
          sold: [{ $match: { status: "sold" } }, { $count: "count" }],
          featured: [{ $match: { isFeatured: true, status: "active" } }, { $count: "count" }]
        },
      },
    ]);

    const stats = {
      total: auctionStats[0]?.total[0]?.count || 0,
      active: auctionStats[0]?.active[0]?.count || 0,
      pending: auctionStats[0]?.draft[0]?.count || 0,
      sold: auctionStats[0]?.sold[0]?.count || 0,
      featured: auctionStats[0]?.featured[0]?.count || 0,
    };

    res.status(200).json({
      success: true,
      data: {
        auctions: auctionsWithConverted,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalAuctions / limit),
          totalAuctions,
          hasNext: page * limit < totalAuctions,
          hasPrev: page > 1,
        },
        stats,
      },
    });
  } catch (error) {
    console.error("Get all auctions error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching auctions",
    });
  }
};

// Get auction details
export const getAuctionDetails = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    const auction = await Auction.findById(auctionId)
      .populate("seller", "firstName lastName username companyName email phone")
      .populate("winner", "firstName lastName username companyName")
      .populate("currentBidder", "firstName lastName username companyName");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Convert specifications Map to plain object
    const auctionObject = auction.toObject();

    if (
      auctionObject.specifications &&
      auctionObject.specifications instanceof Map
    ) {
      auctionObject.specifications = Object.fromEntries(
        auctionObject.specifications,
      );
    } else if (
      auction.specifications &&
      auction.specifications instanceof Map
    ) {
      // Fallback: convert from the original document if toObject() doesn't preserve the Map
      auctionObject.specifications = Object.fromEntries(auction.specifications);
    }

    // Calculate additional statistics
    const auctionStats = {
      totalBids: auction.bidCount,
      totalWatchers: auction.watchlistCount,
      totalViews: auction.views,
      timeRemaining: auction.timeRemaining,
      isReserveMet: auction.isReserveMet(),
    };

    const convertedStartPrice = convertPrice(auction, userCurrency, 'startPrice');
    const convertedCurrentPrice = convertPrice(auction, userCurrency, 'currentPrice');
    const convertedBidIncrement = convertPrice(auction, userCurrency, 'bidIncrement');
    const convertedBuyNowPrice = convertPrice(auction, userCurrency, 'buyNowPrice');
    const convertedReservePrice = convertPrice(auction, userCurrency, 'reservePrice');
    const convertedFinalPrice = convertPrice(auction, userCurrency, 'finalPrice');

    res.status(200).json({
      success: true,
      data: {
        auction: {
          ...auctionObject,
          stats: auctionStats,
          convertedStartPrice,
          convertedCurrentPrice,
          convertedBidIncrement,
          convertedBuyNowPrice,
          convertedReservePrice,
          convertedFinalPrice,
          displayCurrency: userCurrency
        },
      },
    });
  } catch (error) {
    console.error("Get auction details error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching auction details",
    });
  }
};

// ============================================================
// MANUAL SELL (reserve_not_met / ended auctions only)
// ============================================================

// Lightweight paginated user search for the Manual Sell modal.
// Excludes admins, inactive users, and the auction's own seller.
export const searchUsersForManualSell = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { q = "", page = 1, limit = 10 } = req.query;

    const auction = await Auction.findById(auctionId).select("seller");
    if (!auction) {
      return res
        .status(404)
        .json({ success: false, message: "Auction not found" });
    }

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (currentPage - 1) * perPage;

    const escaped = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const filter = {
      userType: { $ne: "admin" },
      isActive: true,
      _id: { $nin: [auction.seller] },
    };

    if (escaped) {
      filter.$or = [
        { firstName: { $regex: escaped, $options: "i" } },
        { lastName: { $regex: escaped, $options: "i" } },
        { username: { $regex: escaped, $options: "i" } },
        { companyName: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(
          "firstName lastName username companyName email phone userType countryName"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage,
          totalPages: Math.ceil(total / perPage) || 1,
          totalUsers: total,
          hasNext: skip + users.length < total,
          hasPrev: skip > 0,
        },
      },
    });
  } catch (error) {
    console.error("Search users for manual sell error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while searching users",
    });
  }
};

// Admin marks a reserve_not_met / ended auction as manually sold to a chosen buyer.
export const manualSellAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { buyerId, finalPrice, paymentStatus } = req.body;

    // ---- Validation ----------------------------------------------------
    if (!buyerId) {
      return res
        .status(400)
        .json({ success: false, message: "Buyer is required" });
    }

    const parsedPrice = parseFloat(finalPrice);
    if (!finalPrice || isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Final price must be a positive number",
      });
    }

    if (!["pending", "completed"].includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Payment status must be 'pending' or 'completed'",
      });
    }

    const auction = await Auction.findById(auctionId).populate(
      "seller",
      "email username companyName firstName lastName currency"
    );

    if (!auction) {
      return res
        .status(404)
        .json({ success: false, message: "Auction not found" });
    }

    // Only reserve_not_met or ended can be manually sold
    if (!["reserve_not_met", "ended"].includes(auction.status)) {
      return res.status(400).json({
        success: false,
        message: `Only reserve-not-met or ended auctions can be manually sold. Current status: ${auction.status}`,
      });
    }

    // ---- Buyer validation ---------------------------------------------
    const buyer = await User.findById(buyerId).select(
      "firstName lastName username companyName email phone userType isActive currency"
    );

    if (!buyer) {
      return res
        .status(404)
        .json({ success: false, message: "Selected buyer not found" });
    }

    if (buyer.userType === "admin") {
      return res
        .status(400)
        .json({ success: false, message: "An admin cannot be assigned as buyer" });
    }

    if (buyer._id.toString() === auction.seller._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "The auction's own seller cannot be the buyer",
      });
    }

    // ---- Apply sale ----------------------------------------------------
    auction.winner = buyer._id;
    auction.finalPrice = parsedPrice;
    auction.currentPrice = parsedPrice;
    auction.status = "sold";
    auction.paymentMethod = "bank_transfer"; // recordkeeping

    if (paymentStatus === "completed") {
      auction.paymentStatus = "completed";
      auction.paymentDate = new Date();
    } else {
      auction.paymentStatus = "pending";
      auction.paymentDate = null;
    }

    // Commission (same calculation as normal sales)
    const commissionData = await calculateCommission(
      parsedPrice,
      auction.isFeatured,
      auction.baseCurrency
    );
    auction.commissionAmount = commissionData.commissionAmount;
    auction.sellerCommissionAmount = commissionData.sellerCommissionAmount;   // NEW
    auction.bidderCommissionAmount = commissionData.bidderCommissionAmount;   // NEW
    auction.commissionType = commissionData.commissionType;
    auction.commissionValue = commissionData.commissionValue;
    auction.featuredPremiumAmount = commissionData.featuredPremium;
    // Reject all pending offers
    auction.offers.forEach((offer) => {
      if (offer.status === "pending") {
        offer.status = "rejected";
        offer.sellerResponse = "Offer rejected - item manually sold by admin";
      }
    });

    await auction.save();

    // Reload with populated refs so emails + socket payload are complete
    const updatedAuction = await Auction.findById(auctionId)
      .populate("seller", "email username companyName firstName lastName currency")
      .populate("winner", "email username companyName firstName lastName currency")
      .populate("bids.bidder", "username companyName firstName lastName");

    // Broadcast so open tabs / cards refresh
    broadcastAuctionChange(auctionId);

    // ---- Respond immediately -------------------------------------------
    res.status(200).json({
      success: true,
      message: `Auction manually sold to ${buyer.username || buyer.companyName || buyer.firstName
        } for ${parsedPrice.toLocaleString()}`,
      data: { auction: updatedAuction },
    });

    // ---- Fire-and-forget emails ----------------------------------------
    setImmediate(async () => {
      try {
        // Buyer: "you won"
        sendAuctionWonEmail(updatedAuction).catch((err) =>
          console.error("Manual-sell buyer email failed:", err)
        );

        // Seller: auction ended / sold
        sendAuctionEndedSellerEmail(updatedAuction).catch((err) =>
          console.error("Manual-sell seller email failed:", err)
        );

        // Admins: sold notification
        const admins = await User.find({ userType: "admin" }).select(
          "email firstName currency"
        );
        for (const admin of admins) {
          auctionWonAdminEmail(
            admin.email,
            admin.currency,
            updatedAuction,
            updatedAuction.winner
          ).catch((err) =>
            console.error(
              `Manual-sell admin email to ${admin.email} failed:`,
              err
            )
          );
        }
      } catch (err) {
        console.error("Manual-sell background emails failed:", err);
      }
    });
  } catch (error) {
    console.error("Manual sell auction error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while manually selling auction",
    });
  }
};

// Update auction status
export const updateAuctionStatus = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { status, isFeatured } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;

    const auction = await Auction.findByIdAndUpdate(auctionId, updateData, {
      new: true,
      runValidators: true,
    }).populate("seller", "firstName lastName username companyName");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    let message = "Auction updated successfully";
    if (status) message = `Auction ${status} successfully`;
    if (isFeatured !== undefined) {
      message = `Auction ${isFeatured ? "featured" : "unfeatured"} successfully`;
    }

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message,
      data: { auction },
    });
  } catch (error) {
    console.error("Update auction status error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating auction status",
    });
  }
};

// Approve auction (change from draft to active)

// ── Closing-time slots ───────────────────────────────────────────────
// The sale date a listing belongs to (falls back to the listing's own
// end date with default slot settings if it has none).
const saleDateFor = async (auction) => {
  if (auction.auctionDate) {
    const sd = await AuctionDate.findById(auction.auctionDate).lean();
    if (sd) return sd;
  }
  return { endDate: auction.endDate };
};

// Map of slot time (ms) -> title of the listing holding it.
const takenSlotMap = async (slots, excludeId) => {
  if (slots.length === 0) return new Map();
  const holders = await Auction.find({
    _id: { $ne: excludeId },
    status: { $in: SLOT_HOLDING_STATUSES },
    endDate: { $in: slots },
  })
    .select("title endDate")
    .lean();
  return new Map(holders.map((h) => [new Date(h.endDate).getTime(), h.title]));
};

export const getClosingSlots = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.auctionId).select("title endDate auctionDate status");
    if (!auction) {
      return res.status(404).json({ success: false, message: "Auction not found" });
    }
    const saleDate = await saleDateFor(auction);
    // Menu settings come from the approve pop-up (Auctions tab):
    // ?from=HH:MM (first closing time, Irish time) & every=minutes.
    const from = isValidHHMM(req.query.from) ? req.query.from : undefined;
    const every = parseInt(req.query.every, 10) || undefined;
    const slots = buildClosingSlots({ endDate: saleDate.endDate, firstClosingTime: from, closingInterval: every });
    const taken = await takenSlotMap(slots, auction._id);

    res.status(200).json({
      success: true,
      data: {
        day: dublinDayKey(saleDate.endDate),
        saleDateLabel: saleDate.label || "",
        current: auction.endDate,
        currentLabel: dublinHHMM(auction.endDate),
        slots: slots.map((t) => ({
          time: t,
          label: dublinHHMM(t),
          taken: taken.has(t.getTime()),
          takenBy: taken.get(t.getTime()) || null,
        })),
      },
    });
  } catch (error) {
    console.error("Get closing slots error:", error);
    res.status(500).json({ success: false, message: "Failed to load closing times" });
  }
};

export const approveAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findById(auctionId).populate("seller");

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    if (auction.status !== "draft") {
      return res.status(400).json({
        success: false,
        message: "Only draft auctions can be approved",
      });
    }

    // Block approval until paid extras are settled
    const needsExtrasPayment =
      (auction.featuredRequested || auction.metaBoostPackage) &&
      auction.extrasPayment?.amount > 0;

    if (needsExtrasPayment && auction.extrasPayment?.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: `Seller has not completed payment for listing extras (status: ${auction.extrasPayment?.status || 'unknown'}). Cannot approve until paid.`,
      });
    }

    // Optional: closing time picked from the slot menu.
    const { closingTime } = req.body || {};
    let closingChanged = false;
    if (closingTime) {
      const chosen = new Date(closingTime);
      if (isNaN(chosen.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid closing time" });
      }
      const saleDate = await saleDateFor(auction);
      // Must be a whole minute on the sale's closing day (Irish time),
      // no later than the sale date's end.
      if (
        chosen.getTime() % 60000 !== 0 ||
        dublinDayKey(chosen) !== dublinDayKey(saleDate.endDate) ||
        chosen > new Date(saleDate.endDate)
      ) {
        return res.status(400).json({
          success: false,
          message: "That closing time isn't on this sale's closing day",
        });
      }
      const taken = await takenSlotMap([chosen], auction._id);
      if (taken.size > 0) {
        return res.status(409).json({
          success: false,
          message: `${dublinHHMM(chosen)} is already taken by "${[...taken.values()][0]}". Pick another time.`,
        });
      }
      if (chosen.getTime() !== new Date(auction.endDate).getTime()) {
        auction.endDate = chosen;
        closingChanged = true;
        // Drop jobs scheduled for the old time; rescheduled below.
        await agendaService.cancelAuctionJobs(auction._id);
      }
    }

    // Check if auction start date is in the future
    const now = new Date();
    if (auction.startDate > now) {
      auction.status = "approved";
      // Schedule activation for start date - keep as draft for now
      await agendaService.scheduleAuctionActivation(
        auction._id,
        auction.startDate,
      );
      auctionApprovedEmail(auction.seller, auction).catch((error) =>
        console.error("Failed to send auction approved email:", error),
      );
    } else {
      // Activate immediately
      auction.status = "active";

      await auction.populate("seller", "email username companyName firstName lastName");

      auctionListedEmail(auction, auction.seller).catch((error) =>
        console.error("Failed to send auction listed email:", error),
      );

      // If end date is in past, end the auction
      if (auction.endDate <= now) {
        await auction.endAuction();
      }
    }

    await auction.save();

    if (closingChanged && auction.endDate > new Date()) {
      await agendaService.scheduleAuctionEnd(auction._id, auction.endDate);
    }

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: closingChanged
        ? `Approved, closing at ${dublinHHMM(auction.endDate)}`
        : "Auction approved successfully",
      data: { auction },
    });

    // const bidders = await User.find({ userType: 'bidder' });
    const bidders = await User.find({
      _id: { $ne: auction?.seller?._id }, // Exclude auction owner
      userType: { $ne: "admin" }, // Exclude admin users
      isActive: true, // Only active users
    }).select("email username companyName firstName lastName preferences userType currency");

    // sendBulkAuctionNotifications(bidders, auction, auction.seller).catch((error) =>
    //   console.error("Failed to send bulk auction notifications email:", error),
    // );
  } catch (error) {
    console.error("Approve auction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while approving auction",
    });
  }
};

// Delete auction
export const deleteAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findById(auctionId);
    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Prevent deletion of active auctions with bids
    if (auction.status === "active" && auction.bidCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete active auction with bids. Please cancel it first.",
      });
    }

    await Auction.findByIdAndDelete(auctionId);

    broadcastAuctionRemoved(auctionId);

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

// End auction manually
export const endAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;

    const auction = await Auction.findById(auctionId);

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    if (auction.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Only active auctions can be ended manually",
      });
    }

    await auction.endAuction();

    broadcastAuctionChange(auctionId);

    res.status(200).json({
      success: true,
      message: "Auction ended successfully",
      data: { auction },
    });
  } catch (error) {
    console.error("End auction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while ending auction",
    });
  }
};

export const updateAuction = async (req, res) => {
  try {
    const { id } = req.params;

    // For FormData, we need to access fields from req.body directly
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

    // ========== AUCTION DATE SLOT RESOLUTION (ADMIN) ==========
    const isTimedAuction =
      auctionType === "standard" || auctionType === "reserve";

    const customDates = req.body.customDates === "true" || req.body.customDates === true;

    let resolvedStartDate = startDate;
    let resolvedEndDate = endDate;
    let auctionDateSlotId = auction.auctionDate || null;
    let clearAuctionDate = false;

    if (isTimedAuction && !customDates) {
      // Admin chose to use a slot (not custom dates)
      const { auctionDateId } = req.body;

      if (auctionDateId) {
        const slot = await AuctionDate.findById(auctionDateId);
        if (!slot || !slot.isActive) {
          return res.status(400).json({
            success: false,
            message: "Selected auction date slot is no longer available",
          });
        }
        resolvedStartDate = slot.startDate;
        resolvedEndDate = slot.endDate;
        auctionDateSlotId = slot._id;
      } else if (!auction.auctionDate) {
        // Neither a new slot nor a stored one, and not custom → require
        return res.status(400).json({
          success: false,
          message: "Please select a slot or enable custom dates",
        });
      } else {
        // Keep stored dates
        resolvedStartDate = auction.startDate;
        resolvedEndDate = auction.endDate;
      }
    } else if (isTimedAuction && customDates) {
      // Admin is overriding with custom dates
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Custom startDate and endDate are required",
        });
      }
      clearAuctionDate = true; // detach from any slot
    } else {
      // buy_now / giveaway
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "startDate and endDate are required for this auction type",
        });
      }
      if (auction.auctionDate) clearAuctionDate = true;
    }
    // ======================================================

    // ========== CATEGORIES HANDLING - FIXED ==========
    let categoriesArray = [];
    if (req.body.categories) {
      try {
        // Try to parse it as JSON first (from frontend JSON.stringify)
        const parsed = JSON.parse(req.body.categories);
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
          // Check if it's a comma-separated string
          categoriesArray = req.body.categories.includes(",")
            ? req.body.categories
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
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
    // =================================================

    // Basic validation - check if fields exist in req.body
    if (!title || !description || !auctionType || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
        missing: {
          title: !title,
          description: !description,
          auctionType: !auctionType,
          startDate: !startDate,
          endDate: !endDate,
        },
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

    // ========== FIX: Check if auction has no bids ==========
    const hasNoBids = auction.bids.length === 0;
    const parsedStartPrice = parseFloat(startPrice);

    // CHECK: If auction is sold, we'll reset everything
    const isSoldAuction =
      auction.status === "sold" || auction.status === "sold_buy_now";

    if (isSoldAuction) {
      const resetData = {
        // Reset all bidding/offers/winner data
        bids: [],
        offers: [],
        currentPrice: parsedStartPrice,
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

        // Reset views and watchlist if you want a fresh start
        views: 0,
        // watchlistCount: 0,

        // Reset commission
        featuredPremium: 0,
        commissionAmount: 0,
        commissionType: null,
        commissionValue: 0,
        bidPaymentRequired: true,

        // Set status based on new dates
        status: "draft", // Start as draft since it's being re-listed
      };

      // Apply reset data to auction object
      Object.assign(auction, resetData);
    }

    // ========== FIX: Update currentPrice if no bids exist ==========
    // If there are no bids and auction is not being reset as sold,
    // update currentPrice to match the new startPrice
    if (hasNoBids && !isSoldAuction) {
      auction.currentPrice = parsedStartPrice;
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
      if (!buyNowPrice || parseFloat(buyNowPrice) < parsedStartPrice) {
        return res.status(400).json({
          success: false,
          message:
            "Buy Now price must be provided and greater than or equal to start price",
        });
      }
    }

    // Validate reserve price for reserve auctions
    if (auctionType === "reserve") {
      if (!reservePrice || parseFloat(reservePrice) < parsedStartPrice) {
        return res.status(400).json({
          success: false,
          message:
            "Reserve price must be provided and greater than or equal to start price",
        });
      }
    }

    // Validate giveaway auctions
    if (auctionType === "giveaway") {
      // For giveaways, we don't need pricing fields
      // But we should ensure they're not being updated incorrectly
      if (buyNowPrice || reservePrice || bidIncrement) {
        console.log("Warning: Pricing fields ignored for giveaway auction");
      }
    }

    // Handle specifications
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
              if (removedPhoto.publicId) await deleteFromCloudinary(removedPhoto.publicId);
              if (removedPhoto.thumbPublicId) await deleteFromCloudinary(removedPhoto.thumbPublicId);
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

    // ========== SERVICE RECORD UPDATES ==========

    // Initialize finalServiceRecords here
    let finalServiceRecords = [...(auction.serviceRecords || [])];

    // Handle removed service records
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
              if (removedRecord.publicId) await deleteFromCloudinary(removedRecord.publicId);
              if (removedRecord.thumbPublicId) await deleteFromCloudinary(removedRecord.thumbPublicId);
              finalServiceRecords.splice(recordIndex, 1);
            }
          }
        }
      } catch (error) {
        console.error("Error processing removed service records:", error);
      }
    }

    // ========== PHOTO UPDATES ==========

    // Handle new photo uploads with captions
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

    // Update captions for existing photos (if sent from frontend)
    const existingPhotoCaptions = req.body.existingPhotoCaptions || [];
    finalPhotos.forEach((photo, index) => {
      if (
        index < existingPhotoCaptions.length &&
        existingPhotoCaptions[index] !== undefined
      ) {
        photo.caption = existingPhotoCaptions[index] || "";
      }
    });

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

    // ========== SERVICE RECORD UPDATES CONTINUED ==========

    // Handle new service record uploads with captions
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

    // Update captions for existing service records
    const existingServiceRecordCaptions =
      req.body.existingServiceRecordCaptions || [];
    finalServiceRecords.forEach((record, index) => {
      if (
        index < existingServiceRecordCaptions.length &&
        existingServiceRecordCaptions[index] !== undefined
      ) {
        record.caption = existingServiceRecordCaptions[index] || "";
      }
    });

    // ========== DATE VALIDATION ==========

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    // ========== STATUS DETERMINATION ==========

    // Determine status for always-available auctions (buy_now and giveaway)
    let newStatus;

    if (isSoldAuction) {
      // For sold auctions being reset, determine status based on new dates
      const originalStart = auction.startDate;
      const originalEnd = auction.endDate;
      const startChanged = start.getTime() !== originalStart.getTime();
      const endChanged = end.getTime() !== originalEnd.getTime();

      // If dates haven't changed, keep the original date logic but reset everything else
      if (!startChanged && !endChanged) {
        // Use the original date logic but with reset status
        if (originalStart > now) {
          newStatus = "draft"; // Future date, start as draft
        } else if (originalStart <= now && originalEnd > now) {
          newStatus = "active"; // Should be active now
        } else if (originalEnd <= now) {
          newStatus = "ended"; // Already ended
        }
      } else {
        // If dates have changed, use the new dates
        if (start > now) {
          newStatus = "draft"; // Future date, start as draft
        } else if (start <= now && end > now) {
          newStatus = "active"; // Should be active now
        } else if (end <= now) {
          newStatus = "ended"; // Already ended
        }
      }
    } else {
      // For non-sold auctions, determine status based on auction type and dates
      if (auctionType === "buy_now" || auctionType === "giveaway") {
        // Always-available auctions should be active if no winner
        newStatus = auction.winner ? auction.status : "active";
      } else {
        // Timed auctions (standard/reserve) - use date-based logic
        if (start > now && end > now) {
          // Dates are in future
          newStatus = "approved";
        } else if (end <= now) {
          // Auction has ended
          newStatus = "ended";
        } else if (start <= now && end > now) {
          // Auction should be active now
          newStatus = "active";
        } else {
          newStatus = auction.status; // Keep existing status as fallback
        }
      }
    }

    // ========== PREPARE UPDATE DATA ==========

    // Prepare update data
    const updateData = {
      title,
      subTitle: subTitle || "",
      categories: categoriesArray,
      features: features || "",
      description,
      specifications: finalSpecifications,
      location: location || "",
      videoLink: videoLink || "",
      startPrice: parsedStartPrice,
      // Only update currentPrice if no bids exist and auction is not being reset as sold
      ...((hasNoBids && !isSoldAuction) && { currentPrice: parsedStartPrice }),
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
      // Clear bid increment for other auction types
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

    // Add reset fields for sold auctions
    if (isSoldAuction) {
      updateData.bids = [];
      updateData.offers = [];
      updateData.currentPrice = parsedStartPrice;
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

    // Reschedule jobs if dates changed
    if (
      start.getTime() !== new Date(auction.startDate).getTime() ||
      end.getTime() !== new Date(auction.endDate).getTime()
    ) {
      await agendaService.cancelAuctionJobs(auction._id);

      // Only schedule jobs for timed auctions (standard/reserve)
      if (auctionType === "standard" || auctionType === "reserve") {
        // Schedule activation if start date is in future
        if (start > new Date()) {
          await agendaService.scheduleAuctionActivation(
            updatedAuction._id,
            start,
          );
        }

        // Always schedule end job for timed auctions
        await agendaService.scheduleAuctionEnd(updatedAuction._id, end);
      } else {
        // For buy_now and giveaway, no need to schedule jobs
        console.log(
          `🛒 ${auctionType} auction ${id} - no jobs scheduled (always available)`,
        );
      }
    }

    broadcastAuctionChange(id);

    res.status(200).json({
      success: true,
      message: isSoldAuction
        ? "Sold auction has been reset and updated successfully"
        : "Auction updated successfully",
      data: { auction: updatedAuction },
      reset: isSoldAuction,
    });
  } catch (error) {
    console.error("Update auction error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating auction",
    });
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = req.user;
    const { paymentStatus, paymentMethod, transactionId, notes } = req.body;

    // Find auction with populated data
    const auction = await Auction.findById(id)
      .populate("seller", "username companyName firstName lastName email phone currency")
      .populate("winner", "username companyName firstName lastName email phone currency")

    if (!auction) {
      return res.status(404).json({
        success: false,
        message: "Auction not found",
      });
    }

    // Validate auction is sold
    if (auction.status !== "sold" && auction.status !== "sold_buy_now") {
      return res.status(400).json({
        success: false,
        message: "Payment status can only be updated for sold auctions",
      });
    }

    // Validate payment status
    const validStatuses = [
      "pending",
      "processing",
      "completed",
      "failed",
      "refunded",
      "cancelled",
    ];
    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    // Handle invoice upload if provided
    let invoiceData = null;
    if (req.file) {
      const invoiceFile = req.file;
      try {
        const result = await uploadDocumentToCloudinary(
          invoiceFile.buffer,
          invoiceFile.originalname,
          "auction-invoices",
        );

        invoiceData = {
          url: result.secure_url,
          publicId: result.public_id,
          filename: invoiceFile.originalname,
          uploadedAt: new Date(),
          uploadedBy: admin._id,
        };
      } catch (uploadError) {
        console.error("Invoice upload error:", uploadError);
        return res.status(400).json({
          success: false,
          message: "Failed to upload invoice file",
        });
      }
    }

    // Update payment status and related fields
    auction.paymentStatus = paymentStatus;

    // Only update payment method if provided and status is not pending
    if (paymentMethod && paymentStatus !== "pending") {
      const validMethods = ["credit_card", "bank_transfer", "paypal", "other"];
      if (validMethods.includes(paymentMethod)) {
        auction.paymentMethod = paymentMethod;
      }
    }

    // Update transaction ID if provided
    if (transactionId && transactionId.trim() !== "") {
      auction.transactionId = transactionId.trim();
    }

    // Set payment date for completed status
    if (paymentStatus === "completed") {
      auction.paymentDate = new Date();
    }

    // Attach invoice if uploaded
    if (invoiceData) {
      auction.invoice = invoiceData;
    }

    await auction.save();

    // Populate updated auction
    const updatedAuction = await Auction.findById(id)
      .populate("seller", "username companyName firstName lastName email phone currency")
      .populate("winner", "username companyName firstName lastName email phone currency")

    broadcastAuctionChange(id);

    res.status(200).json({
      success: true,
      message: `Payment status updated to ${paymentStatus}`,
      data: {
        auction: updatedAuction,
      },
    });

    if (paymentStatus === "completed" && updatedAuction.winner) {
      // Send payment success email to winner
      paymentCompletedEmail(
        updatedAuction?.winner,
        updatedAuction,
        updatedAuction?.finalPrice,
      ).catch((error) =>
        console.error("Failed to send payment success email:", error),
      );

      // Send payment received email to seller
      paymentCompletedSellerEmail(
        updatedAuction?.seller,
        updatedAuction,
        updatedAuction?.winner,
      ).catch((error) =>
        console.error(
          "Failed to send seller payment notification email:",
          error,
        ),
      );
    }
  } catch (error) {
    console.error("Update payment status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update payment status",
    });
  }
};

export const fetchDVLAData = async (req, res) => {
  try {
    const { registrationNumber } = req.body;

    if (!registrationNumber) {
      return res.status(400).json({
        success: false,
        message: "registrationNumber is required",
      });
    }

    const response = await axios.post(
      process.env.DVLA_WORKER_URL,
      { registrationNumber },
      { timeout: 10000 },
    );

    res.status(200).json({
      success: true,
      message: "Vehicle details fetched successfully",
      data: response.data,
    });
  } catch (error) {
    console.error("DVLA Worker error:", error?.response?.data || error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch vehicle details",
    });
  }
};

// Verify user identity
export const verifyUserIdentity = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body; // Optional admin notes

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.identificationDocument) {
      return res.status(400).json({
        success: false,
        message: "User has not uploaded any identification document",
      });
    }

    // Update user verification status
    user.identificationStatus = "verified";
    user.identificationVerifiedAt = new Date();
    user.identificationRejectionReason = null;
    user.isVerified = true;

    await user.save();

    // Send approval email (fire and forget)
    accountApprovedEmail(user).catch(err =>
      console.error("Failed to send account approved email:", err)
    );

    res.status(200).json({
      success: true,
      message: "User identity verified successfully",
      data: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        identificationStatus: user.identificationStatus,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Verify user
export const verifyUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body; // Optional admin notes

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User is already verified.",
      });
    }

    // Update user verification status
    user.isVerified = true;

    await user.save();

    // Send approval email (fire and forget)
    accountApprovedEmail(user).catch(err =>
      console.error("Failed to send account approved email:", err)
    );

    res.status(200).json({
      success: true,
      message: "User verified successfully",
      data: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Reject user identity verification
export const rejectUserIdentity = async (req, res) => {
  try {
    const { userId } = req.params;
    const { rejectionReason, allowReupload = true } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Store old document info for potential cleanup
    const oldDocumentPublicId = user.identificationDocumentPublicId;

    // Update user verification status
    user.identificationStatus = "rejected";
    user.identificationRejectionReason = rejectionReason;

    // If user can reupload, keep the document for reference
    if (!allowReupload) {
      // Delete the document from Cloudinary
      if (oldDocumentPublicId) {
        try {
          await deleteFromCloudinary(oldDocumentPublicId, "raw");
        } catch (cloudinaryError) {
          console.error("Failed to delete rejected document:", cloudinaryError);
        }
      }

      // Clear document fields
      user.identificationDocument = null;
      user.identificationDocumentPublicId = null;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "User identity verification rejected",
      data: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        identificationStatus: user.identificationStatus,
        rejectionReason: user.identificationRejectionReason,
        canReupload: allowReupload,
      },
    });
  } catch (error) {
    console.error("Rejection error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Update the "contacted" status for a user (set or clear the contacted date).
 * @route PATCH /api/v1/admin/users/:userId/contact
 * @param {boolean} contacted - if true, set lastContactedAt = now; if false, set to null.
 */
export const updateUserContact = async (req, res) => {
  try {
    const { userId } = req.params;
    const { contacted } = req.body; // boolean

    // Validate input
    if (typeof contacted !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Invalid value for "contacted". Must be true or false.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update the field
    user.lastContactedAt = contacted ? new Date() : null;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User contact status updated.`,
      data: {
        userId: user._id,
        lastContactedAt: user.lastContactedAt,
      },
    });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating contact status',
    });
  }
};

// ── Edit a user's username / email (admin) ───────────────────────────
// Body: { username?, email?, force? }. force skips the "can this address
// receive email" check (for unusual domains the admin knows are real).
export const updateUserIdentity = async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, email, force } = req.body || {};
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const changes = {};

    if (email !== undefined) {
      const newEmail = String(email).toLowerCase().trim();
      if (!EMAIL_FORMAT.test(newEmail)) {
        return res.status(400).json({ success: false, message: "That isn't a valid email address" });
      }
      if (newEmail !== user.email) {
        const taken = await User.findOne({ email: newEmail, _id: { $ne: user._id } }).select("_id").lean();
        if (taken) return res.status(409).json({ success: false, message: "Another account already uses that email" });
        if (!force) {
          const check = await checkEmail(newEmail);
          if (!check.ok) {
            return res.status(400).json({
              success: false,
              message: check.suggestion
                ? `That address can't receive email. Did you mean ${check.suggestion}?`
                : "That address can't receive email (its domain has no mail server).",
              suggestion: check.suggestion || null,
              canForce: true,
            });
          }
        }
        changes.email = newEmail;
        changes.emailBounced = false;
        changes.emailBouncedAt = null;
      }
    }

    if (username !== undefined) {
      const newUsername = String(username).toLowerCase().trim();
      if (newUsername.length < 2 || newUsername.length > 40) {
        return res.status(400).json({ success: false, message: "Username must be 2 to 40 characters" });
      }
      if (newUsername !== (user.username || "")) {
        const taken = await User.findOne({ username: newUsername, _id: { $ne: user._id } }).select("_id").lean();
        if (taken) return res.status(409).json({ success: false, message: "Another account already uses that username" });
        changes.username = newUsername;
      }
    }

    if (Object.keys(changes).length === 0) {
      return res.status(200).json({ success: true, message: "No changes", data: { user } });
    }

    Object.assign(user, changes);
    await user.save();

    // Listings show the seller's username: keep them in step.
    if (changes.username) {
      await Auction.updateMany({ seller: user._id }, { sellerUsername: user.username || user.companyName || "" });
    }

    const safe = user.toObject();
    delete safe.password;
    delete safe.refreshToken;
    res.status(200).json({ success: true, message: "User updated", data: { user: safe } });
  } catch (error) {
    console.error("Update user identity error:", error);
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
};

// ── Email problems: typos, dead domains, bounced addresses ────────────
export const getEmailHealth = async (req, res) => {
  try {
    const users = await User.find({ userType: { $ne: "admin" } })
      .select("firstName lastName username companyName email userType isActive emailBounced emailBouncedAt createdAt")
      .lean();

    const issues = [];
    for (const u of users) {
      const check = await checkEmail(u.email || ""); // domain lookups are cached
      let problem = null;
      if (u.emailBounced) problem = "bounced";
      else if (check.problem === "format") problem = "invalid";
      else if (check.problem === "no_mail_server") problem = "no_mail_server";
      else if (check.problem === "typo") problem = "typo";
      if (!problem) continue;
      issues.push({
        _id: u._id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.companyName || "",
        username: u.username || "",
        email: u.email,
        userType: u.userType,
        isActive: u.isActive !== false,
        problem,
        suggestion: check.suggestion || null,
        bouncedAt: u.emailBouncedAt || null,
        createdAt: u.createdAt,
      });
    }

    const order = { invalid: 0, no_mail_server: 1, typo: 2, bounced: 3 };
    issues.sort((a, b) => order[a.problem] - order[b.problem]);
    res.status(200).json({ success: true, data: { issues, checked: users.length } });
  } catch (error) {
    console.error("Email health error:", error);
    res.status(500).json({ success: false, message: "Failed to check emails" });
  }
};

// Body: { emails: ["a@b.com", ...] } — marks matching users as bounced.
export const markEmailsBounced = async (req, res) => {
  try {
    const list = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const emails = [...new Set(list.map((e) => String(e).toLowerCase().trim()).filter((e) => EMAIL_FORMAT.test(e)))];
    if (emails.length === 0) return res.status(400).json({ success: false, message: "No email addresses given" });
    const result = await User.updateMany(
      { email: { $in: emails }, userType: { $ne: "admin" } },
      { emailBounced: true, emailBouncedAt: new Date() },
    );
    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} account(s) marked as bounced`,
      data: { matched: result.matchedCount, updated: result.modifiedCount, given: emails.length },
    });
  } catch (error) {
    console.error("Mark bounced error:", error);
    res.status(500).json({ success: false, message: "Failed to mark bounced emails" });
  }
};
