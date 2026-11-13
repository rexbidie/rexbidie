import User from "../models/user.model.js";
import Watchlist from "../models/watchlist.model.js";
import { getCachedRates } from "../routes/currency.route.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import bcrypt from "bcrypt";
import { preferencesUpdate } from "../utils/emailPreferences.js";

const convertPrice = (auction, targetCurrency, priceField) => {
  const rates = getCachedRates();
  if (!rates) return auction[priceField]; // fallback
  const base = auction.baseCurrency;
  const rate = rates[base].rates[targetCurrency];
  if (!rate) return auction[priceField];
  return auction[priceField] * rate;
};

// Get user profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching profile",
    });
  }
};

// Update user profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      firstName,
      lastName,
      phone,
      countryCode,
      countryName,
      currency,
      county,
      line1,
      line2,
      state,
      postCode,
      country,
    } = req.body;

    const updateData = {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone && { phone }),
      ...(countryCode && { countryCode }),
      ...(countryName && { countryName }),
      ...(currency && { currency }),
    };

    // Handle address fields if provided
    if (line1 || line2 || county || state || postCode || country) {
      updateData.address = {
        ...(line1 && { line1 }),
        ...(line2 && { line2 }),
        ...(county && { county }),
        ...(state && { state }),
        ...(postCode && { postCode }),
        ...(country && { country }),
      };
    }

    // Handle avatar upload
    if (req.file) {
      try {
        // Delete old avatar if exists
        const oldUser = await User.findById(userId);
        if (oldUser.image) {
          await deleteFromCloudinary(oldUser.image);
        }

        // Upload new avatar
        const result = await uploadToCloudinary(
          req.file.buffer,
          "user-avatars"
        );
        updateData.image = result.secure_url;
      } catch (uploadError) {
        console.error("Avatar upload error:", uploadError);
        return res.status(400).json({
          success: false,
          message: "Failed to upload avatar image",
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -refreshToken");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating profile",
    });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await User.findById(userId);

    // Verify current password
    const isCurrentPasswordValid = await user.isPasswordCorrect(
      currentPassword
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while changing password",
    });
  }
};

// Update preferences
export const updatePreferences = async (req, res) => {
  try {
    const userId = req.user._id;
    const { preferences } = req.body;

    // emailUpdates (master switch) and/or per-category email / push choices.
    const $set = preferencesUpdate(preferences);
    if (!$set) {
      return res.status(400).json({
        success: false,
        message: "No valid preferences given",
      });
    }

    // Merge instead of replacing the whole object
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error("Update preferences error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating preferences",
    });
  }
};

export const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const { userType } = req.params;
    const userCurrency = req.query.currency || 'EUR';
    const rates = getCachedRates();

    const Auction = (await import("../models/auction.model.js")).default;

    let statistics = {};

    // Helper to convert amount using auction's base currency
    const convertAmount = (amount, auction) => {
      if (!amount) return 0;
      if (!rates) return amount;
      const base = auction.baseCurrency;
      const rate = rates[base]?.rates[userCurrency];
      if (!rate) return amount;
      return parseFloat((amount * rate).toFixed(2));
    };

    if (userType === "bidder") {
      // Bidder-specific statistics

      // 1. Total Bids Count (excluding buy now bids)
      const totalBidsResult = await Auction.aggregate([
        { $match: { "bids.bidder": userId } },
        { $unwind: "$bids" },
        { $match: { "bids.bidder": userId, "bids.isBuyNow": { $ne: true } } },
        { $group: { _id: null, total: { $sum: 1 } } },
      ]);

      // 2. Total Offers Count
      const totalOffersCount = await Auction.aggregate([
        { $match: { "offers.buyer": userId } },
        { $unwind: "$offers" },
        { $match: { "offers.buyer": userId } },
        { $group: { _id: null, total: { $sum: 1 } } },
      ]);

      // 3. Total Participated Auctions
      const participatedAuctions = await Auction.countDocuments({
        $or: [
          { "bids.bidder": userId },
          { "offers.buyer": userId },
          { winner: userId },
        ],
      });

      // 4. Active Auctions where user is currently winning
      const currentlyWinning = await Auction.countDocuments({
        currentBidder: userId,
        status: "active",
        endDate: { $gt: new Date() },
      });

      // 5. Active Bids
      const activeBidsResult = await Auction.aggregate([
        {
          $match: {
            "bids.bidder": userId,
            status: "active",
            endDate: { $gt: new Date() },
          },
        },
        { $unwind: "$bids" },
        { $match: { "bids.bidder": userId } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      const activeBids = activeBidsResult[0]?.count || 0;

      // 6. Active Offers
      const activeOffersResult = await Auction.aggregate([
        {
          $match: {
            "offers.buyer": userId,
            status: "active",
            endDate: { $gt: new Date() },
          },
        },
        { $unwind: "$offers" },
        { $match: { "offers.buyer": userId, "offers.status": "pending" } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      const activeOffers = activeOffersResult[0]?.count || 0;

      // 7. Won Auctions
      const wonAuctions = await Auction.countDocuments({
        winner: userId,
        status: { $in: ["sold", "sold_buy_now"] },
      });

      // 8. Watchlist count
      const watchlistItems = await Watchlist.aggregate([
        {
          $lookup: {
            from: "auctions",
            localField: "auction",
            foreignField: "_id",
            as: "auction",
          },
        },
        { $unwind: "$auction" },
        {
          $match: {
            "auction.status": "active",
            user: userId,
          },
        },
        { $count: "count" },
      ]);

      const watchlistCount = watchlistItems[0]?.count || 0;

      // 9. Total Spent (converted)
      let totalSpentConverted = 0;

      const winningBidsSpent = await Auction.aggregate([
        {
          $match: {
            winner: userId,
            status: { $in: ["sold"] },
            finalPrice: { $exists: true },
          },
        },
      ]);

      for (const auction of winningBidsSpent) {
        totalSpentConverted += convertAmount(auction.finalPrice, auction);
      }

      const acceptedOffersSpent = await Auction.aggregate([
        { $match: { "offers.buyer": userId, "offers.status": "accepted" } },
        { $unwind: "$offers" },
        { $match: { "offers.buyer": userId, "offers.status": "accepted" } },
      ]);

      for (const auction of acceptedOffersSpent) {
        totalSpentConverted += convertAmount(auction.offers.amount, auction);
      }

      // 10. Average Bid Amount
      const totalBids = totalBidsResult[0]?.total || 0;
      const totalOffers = totalOffersCount[0]?.total || 0;

      let totalBidAmountConverted = 0;
      const bidAmounts = await Auction.aggregate([
        { $match: { "bids.bidder": userId } },
        { $unwind: "$bids" },
        { $match: { "bids.bidder": userId, "bids.isBuyNow": { $ne: true } } },
      ]);

      for (const auction of bidAmounts) {
        totalBidAmountConverted += convertAmount(auction.bids.amount, auction);
      }

      const avgBidAmount = totalBids > 0 ? totalBidAmountConverted / totalBids : 0;

      // 11. Average Offer Amount
      let totalOfferValueConverted = 0;
      const offerAmounts = await Auction.aggregate([
        { $match: { "offers.buyer": userId } },
        { $unwind: "$offers" },
        { $match: { "offers.buyer": userId } },
      ]);

      for (const auction of offerAmounts) {
        totalOfferValueConverted += convertAmount(auction.offers.amount, auction);
      }

      const avgOfferAmount = totalOffers > 0 ? totalOfferValueConverted / totalOffers : 0;

      // 12. Success Rate
      const successRate =
        participatedAuctions > 0
          ? Math.round((wonAuctions / participatedAuctions) * 100)
          : 0;

      // 13. Buy Now purchases
      const buyNowPurchases = await Auction.countDocuments({
        winner: userId,
        status: "sold_buy_now",
      });

      // Total rejected offers count
      const rejectedOffersResult = await Auction.aggregate([
        { $match: { "offers.buyer": userId } },
        { $unwind: "$offers" },
        { $match: { "offers.buyer": userId, "offers.status": "rejected" } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      // Recent bids count
      const recentBidsResult = await Auction.aggregate([
        {
          $match: {
            "bids.bidder": userId,
            "bids.timestamp": {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
        { $unwind: "$bids" },
        {
          $match: {
            "bids.bidder": userId,
            "bids.timestamp": {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      statistics = {
        userType: "bidder",
        totalBids,
        totalOffers,
        activeOffers,
        activeBids,
        wonAuctions,
        watchlistCount,
        successRate,
        totalSpent: parseFloat(totalSpentConverted.toFixed(2)),
        avgBidAmount: parseFloat(avgBidAmount.toFixed(2)),
        avgOfferAmount: parseFloat(avgOfferAmount.toFixed(2)),
        currentlyWinning,
        totalParticipatedAuctions: participatedAuctions,
        buyNowPurchases,
        totalAcceptedOffers: acceptedOffersSpent.length,
        totalRejectedOffers: rejectedOffersResult[0]?.count || 0,
        recentBids: recentBidsResult[0]?.count || 0,
        displayCurrency: userCurrency,
      };

    } else if (userType === "seller") {
      // Seller-specific statistics
      const totalAuctions = await Auction.countDocuments({
        seller: userId,
      });

      const activeAuctions = await Auction.countDocuments({
        seller: userId,
        status: "active",
        endDate: { $gt: new Date() },
      });

      const soldAuctions = await Auction.countDocuments({
        seller: userId,
        status: "sold",
      });

      const draftAuctions = await Auction.countDocuments({
        seller: userId,
        status: "draft",
      });

      const endedNotSold = await Auction.countDocuments({
        seller: userId,
        status: "ended",
        winner: { $exists: false },
      });

      const endingSoonAuctions = await Auction.countDocuments({
        seller: userId,
        status: "active",
        endDate: {
          $gt: new Date(),
          $lt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const reserveNotMet = await Auction.countDocuments({
        seller: userId,
        status: "reserve_not_met",
      });

      // Calculate total revenue from sold auctions (converted)
      const soldAuctionsList = await Auction.find({
        seller: userId,
        status: "sold",
      }).select("finalPrice baseCurrency currentPrice");

      let totalRevenueConverted = 0;
      for (const auction of soldAuctionsList) {
        const finalPrice = auction.finalPrice || auction.currentPrice;
        totalRevenueConverted += convertAmount(finalPrice, auction);
      }

      const totalRevenue = totalRevenueConverted;
      const avgSalePrice = soldAuctions > 0 ? totalRevenue / soldAuctions : 0;

      // Success rate
      const completedAuctions = soldAuctions + endedNotSold + reserveNotMet;
      const successRate =
        completedAuctions > 0
          ? Math.round((soldAuctions / completedAuctions) * 100)
          : 0;

      // Total bids received
      const totalBidsOnAuctions = await Auction.aggregate([
        { $match: { seller: userId } },
        { $group: { _id: null, totalBids: { $sum: "$bidCount" } } },
      ]);

      const totalBidsReceived = totalBidsOnAuctions[0]?.totalBids || 0;
      const avgBidsPerAuction = totalAuctions > 0 ? totalBidsReceived / totalAuctions : 0;

      // Highest selling auction (converted)
      const highestSaleResult = await Auction.findOne({
        seller: userId,
        status: "sold",
      })
        .sort({ finalPrice: -1 })
        .select("title finalPrice baseCurrency");

      let highestSaleAmount = 0;
      if (highestSaleResult) {
        highestSaleAmount = convertAmount(highestSaleResult.finalPrice, highestSaleResult);
      }

      // Most popular auction
      const mostPopularAuction = await Auction.findOne({
        seller: userId,
        bidCount: { $gt: 0 },
      })
        .sort({ bidCount: -1 })
        .select("title bidCount watchlistCount");

      // Total watchlists
      const totalWatchlists = await Watchlist.aggregate([
        {
          $lookup: {
            from: "auctions",
            localField: "auction",
            foreignField: "_id",
            as: "auction",
          },
        },
        { $unwind: "$auction" },
        {
          $match: {
            "auction.status": "active",
            "auction.seller": userId,
          },
        },
        { $count: "count" },
      ]);

      const totalWatchlistsCount = totalWatchlists[0]?.count || 0;

      // Total views
      const totalViewsResult = await Auction.aggregate([
        { $match: { seller: userId } },
        { $group: { _id: null, totalViews: { $sum: "$views" } } },
      ]);

      statistics = {
        userType: "seller",
        totalAuctions,
        activeAuctions,
        soldAuctions,
        draftAuctions,
        endedNotSold,
        endingSoonAuctions,
        reserveNotMet,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        avgSalePrice: parseFloat(avgSalePrice.toFixed(2)),
        successRate,
        totalBidsReceived,
        avgBidsPerAuction: parseFloat(avgBidsPerAuction.toFixed(2)),
        highestSale: highestSaleResult
          ? {
            title: highestSaleResult.title,
            amount: parseFloat(highestSaleAmount.toFixed(2)),
            amountOriginal: highestSaleResult.finalPrice,
          }
          : null,
        mostPopularAuction: mostPopularAuction
          ? {
            title: mostPopularAuction.title,
            bidCount: mostPopularAuction.bidCount,
            watchlistCount: mostPopularAuction.watchlistCount,
          }
          : null,
        totalViews: totalViewsResult[0]?.totalViews || 0,
        totalWatchlists: totalWatchlistsCount,
        displayCurrency: userCurrency,
      };
    }

    res.status(200).json({
      success: true,
      data: {
        statistics,
        userType,
      },
    });
  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching user statistics",
    });
  }
};