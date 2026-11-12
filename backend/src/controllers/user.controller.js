import { checkEmail } from "../utils/emailCheck.js";
import User from "../models/user.model.js";
import { StripeService } from "../services/stripeService.js";
import jwt from "jsonwebtoken";
import {
  newUserRegistrationEmail,
  resetPasswordEmail,
  welcomeEmail,
} from "../utils/nodemailer.js";
import crypto from "crypto";
import BidPayment from "../models/bidPayment.model.js";
import Review from "../models/review.model.js";
import Auction from "../models/auction.model.js";
import mongoose from "mongoose";
import { publicName } from "../utils/displayName.js";
import { contactModeFor } from "../utils/contactPolicy.js";
import { getCachedRates } from "../routes/currency.route.js";
import {
  deleteFromCloudinary,
  uploadDocumentToCloudinary,
  uploadImageToCloudinary,
} from "../utils/cloudinary.js";
import { setTempData, getTempData, deleteTempData } from '../utils/tempCache.js';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';

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

// Helper function to generate tokens and set cookies
const generateTokensAndRespond = async (user, req, res, message) => {
  try {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    const resetToken = user.generateResetPasswordToken();

    // Save refresh token to user document
    user.refreshToken = refreshToken;

    // after successful authentication
    if (req.body.gaClientId) {
      user.gaClientId = req.body.gaClientId;
    }

    await user.save({ validateBeforeSave: false });

    // Remove sensitive data from user object
    const safeUser = user.toSafeObject();

    // await loginUser(req, res);

    // Set cookies and send response
    res
      .status(201)
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 60 * 1000, // 30 minutes
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      })
      .json({
        success: true,
        message,
        data: {
          user: safeUser,
          accessToken,
          refreshToken,
        },
      });
  } catch (error) {
    throw new Error(`Token generation failed: ${error.message}`);
  }
};

export const registerUser = async (req, res) => {
  try {
    // ========== STEP 1: Initiate registration ==========
    const {
      firstName,
      lastName,
      username,
      email,
      password,
      userType,
      companyName,
      companyVATNumber,
      countryCode,
      countryName,
      currency = 'EUR',
      phone = '',
      image = '',
      line1 = '',
      line2 = '',
      county = '',
      state = '',
      postCode = '',
      paymentMethodId,
    } = req.body;

    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedUsername = username?.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or username already exists',
      });
    }

    // Stop sign-ups with addresses that can't receive email (e.g. gmail.vom).
    const emailCheck = await checkEmail(normalizedEmail);
    if (!emailCheck.ok) {
      return res.status(400).json({
        success: false,
        message: emailCheck.suggestion
          ? `That email address can't receive email. Did you mean ${emailCheck.suggestion}?`
          : "That email address can't receive email. Please check it and try again.",
        suggestion: emailCheck.suggestion || null,
      });
    }

    // Handle ID document upload
    const identificationDocumentFile = req.file;
    let identificationDocumentUrl = null;
    let identificationDocumentPublicId = null;

    if (identificationDocumentFile) {
      const isImage = identificationDocumentFile.mimetype.startsWith('image/');

      let uploadResult;
      if (isImage) {
        // For images: (buffer, folder) → originalName uses default 'image.jpg'
        uploadResult = await uploadImageToCloudinary(
          identificationDocumentFile.buffer,
          'identification-documents'  // This is the FOLDER
          // No third argument → uses default 'image.jpg' → has .jpg extension!
        );
      } else {
        // For documents: (buffer, originalName, folder)
        uploadResult = await uploadDocumentToCloudinary(
          identificationDocumentFile.buffer,
          identificationDocumentFile.originalname,
          'identification-documents'
        );
      }

      identificationDocumentUrl = uploadResult.secure_url;
      identificationDocumentPublicId = uploadResult.public_id;
    }

    // Prepare user data (without payment info yet)
    const userData = {
      firstName,
      lastName,
      username: normalizedUsername,
      email: normalizedEmail,
      companyName: companyName || '',
      companyVATNumber: companyVATNumber || '',
      password,
      userType,
      countryCode,
      countryName,
      currency: currency || 'EUR',
      phone,
      image,
      isVerified: true, //changed
      // identificationDocument: identificationDocumentUrl,
      // identificationDocumentPublicId,
      // identificationStatus: identificationDocumentUrl ? 'pending' : undefined,
      address: {
        line1,
        line2,
        county,
        state,
        postCode,
        country: countryName,
      },
    };

    const user = await User.create(userData);

    if (!user) {
      return res.status(500).json({
        success: false,
        message: "User registration failed",
      });
    }

    // await generateTokensAndRespond(user, res, 'Registration successful');
    await generateTokensAndRespond(user, req, res, "Registration successful");

    //send registration email
    welcomeEmail(user).catch(err => console.error("failed to send welcome email:", err));

    // const adminUsers = await User.find({ userType: "admin" });
    // for (const admin of adminUsers) {
    //   await newUserRegistrationEmail(admin.email, user);
    // }
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
    });
  }
};

// Login Controller
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "No user found",
      });
    }

    // Check if user is active
    // if (!user.isActive) {
    //   return res.status(401).json({
    //     success: false,
    //     message: "Account is deactivated",
    //   });
    // }

    // Verify password
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Wrong password",
      });
    }

    // await generateTokensAndRespond(user, res, 'Login successful');
    await generateTokensAndRespond(user, req, res, "Login successful");
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during login",
    });
  }
};

// Logout Controller
export const logoutUser = async (req, res) => {
  try {
    const user = req.user;

    // Clear refresh token from database
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });

    // Clear cookies
    res.clearCookie("accessToken").clearCookie("refreshToken").json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during logout",
    });
  }
};

// Refresh Access Token
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Generate new tokens
    const newAccessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();

    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Access token refreshed",
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error("Token refresh error:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Refresh token expired",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error during token refresh",
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          "If an account with that email exists, a reset link has been sent.",
      });
    }

    const resetToken = await user.generateResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const url = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const emailSent = await resetPasswordEmail(user.email, url);

    if (!emailSent) {
      user.resetPasswordToken = null;
      user.resetPasswordTokenExpiry = null;
      await user.save({ validateBeforeSave: false });
      return res
        .status(500)
        .json({ success: false, message: "Could not send email" });
    }

    return res.status(200).json({
      success: true,
      message:
        "If an account with that email exists, a reset link has been sent.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const { newPassword } = req.body;

    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "Token is required" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(200)
        .json({ success: true, message: "Token is invalid or has expired" });
    }

    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({ success: true, message: "Password updated" });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to get user" });
  }
};

export const getBillingInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "stripeCustomerId paymentMethodId cardLast4 cardBrand cardExpMonth cardExpYear isPaymentVerified userType"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const billingInfo = {
      stripeCustomerId: user.stripeCustomerId,
      isPaymentVerified: user.isPaymentVerified,
      userType: user.userType,
      hasStripeCustomer: !!user.stripeCustomerId,
      hasCard: !!user.cardLast4,
      needsSetup: !user.stripeCustomerId, // Needs initial setup
    };

    // Add card details if available
    if (user.cardLast4) {
      billingInfo.card = {
        id: user.paymentMethodId,
        last4: user.cardLast4,
        brand: user.cardBrand,
        expMonth: user.cardExpMonth,
        expYear: user.cardExpYear,
      };
    }

    res.status(200).json({
      success: true,
      data: billingInfo,
    });
  } catch (error) {
    console.error("Get billing info error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching billing information",
    });
  }
};

export const createPaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    const userId = req.user._id;

    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "Payment method ID is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user already has a Stripe customer
    if (user.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "User already has a Stripe customer. Use update endpoint instead.",
      });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: {
        userId: user._id.toString(),
        userType: user.userType,
      },
    });

    // Attach payment method to customer
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    // Set as default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });

    // Update user with card details
    user.stripeCustomerId = customer.id;
    user.paymentMethodId = paymentMethod.id;
    user.cardLast4 = paymentMethod.card.last4;
    user.cardBrand = paymentMethod.card.brand;
    user.cardExpMonth = paymentMethod.card.exp_month;
    user.cardExpYear = paymentMethod.card.exp_year;
    user.isPaymentVerified = true;

    await user.save();

    const cardInfo = {
      last4: user.cardLast4,
      brand: user.cardBrand,
      expMonth: user.cardExpMonth,
      expYear: user.cardExpYear,
    };

    res.status(201).json({
      success: true,
      message: "Payment method added successfully!",
      data: {
        card: cardInfo,
        isPaymentVerified: true,
        userType: user.userType,
        stripeCustomerId: user.stripeCustomerId,
      },
    });
  } catch (error) {
    console.error("Create payment method error:", error);

    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        success: false,
        message: error.message || "Your card was declined. Please try a different card.",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to add payment method",
    });
  }
};

export const updatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.body;
    const userId = req.user._id;

    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: "Payment method ID is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // If user doesn't have a Stripe customer, create one
    if (!user.stripeCustomerId) {
      console.log(`🔄 User ${userId} has no Stripe customer. Creating one...`);
      return createPaymentMethod(req, res);
    }

    // ✅ STEP 1: Cancel ONLY pending authorizations (requires_capture) on old card
    const pendingAuthorizations = await BidPayment.find({
      bidder: userId,
      type: "bid_authorization",
      status: "requires_capture",
    });

    console.log(
      `🔄 Cancelling ${pendingAuthorizations.length} PENDING authorizations for user ${userId}`
    );

    let cancelledCount = 0;
    for (const payment of pendingAuthorizations) {
      try {
        await StripeService.cancelPaymentIntent(payment.paymentIntentId);
        payment.status = "canceled";
        await payment.save();
        cancelledCount++;
        console.log(
          `✅ Cancelled PENDING authorization for auction: ${payment.auction}`
        );
      } catch (error) {
        console.error(
          `❌ Failed to cancel authorization ${payment.paymentIntentId}:`,
          error.message
        );
      }
    }

    // ✅ STEP 2: Also mark any 'succeeded' bid_authorizations as 'replaced'
    const succeededAuthorizations = await BidPayment.find({
      bidder: userId,
      type: "bid_authorization",
      status: "succeeded",
    });

    for (const payment of succeededAuthorizations) {
      payment.status = "replaced";
      await payment.save();
      console.log(
        `📝 Marked succeeded authorization as replaced for auction: ${payment.auction}`
      );
    }

    // ✅ STEP 3: Attach new payment method to existing customer
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId,
    });

    // ✅ STEP 4: Set as default payment method
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });

    // ✅ STEP 5: Update user in database
    user.paymentMethodId = paymentMethod.id;
    user.cardLast4 = paymentMethod.card.last4;
    user.cardBrand = paymentMethod.card.brand;
    user.cardExpMonth = paymentMethod.card.exp_month;
    user.cardExpYear = paymentMethod.card.exp_year;
    user.isPaymentVerified = true;

    await user.save();

    const updatedCardInfo = {
      last4: user.cardLast4,
      brand: user.cardBrand,
      expMonth: user.cardExpMonth,
      expYear: user.cardExpYear,
    };

    res.status(200).json({
      success: true,
      message: `Payment method updated successfully. ${cancelledCount} pending authorizations cancelled.`,
      data: {
        card: updatedCardInfo,
        isPaymentVerified: true,
        userType: user.userType,
        stripeCustomerId: user.stripeCustomerId,
        cancelledAuthorizations: cancelledCount,
      },
    });
  } catch (error) {
    console.error("Update payment method error:", error);

    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return res.status(400).json({
        success: false,
        message: error.message || "Your card was declined. Please try a different card.",
      });
    }

    res.status(400).json({
      success: false,
      message: error.message || "Failed to update payment method",
    });
  }
};

// export const updatePaymentMethod = async (req, res) => {
//   try {
//     const { paymentMethodId } = req.body;
//     const userId = req.user._id;

//     if (!paymentMethodId) {
//       return res.status(400).json({
//         success: false,
//         message: "Payment method ID is required",
//       });
//     }

//     const user = await User.findById(userId);

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     if (!user.stripeCustomerId) {
//       return res.status(400).json({
//         success: false,
//         message: "No Stripe customer found",
//       });
//     }

//     // ✅ STEP 1: Cancel ONLY pending authorizations (requires_capture) on old card
//     // DO NOT cancel succeeded payments (already charged commissions)
//     const pendingAuthorizations = await BidPayment.find({
//       bidder: userId,
//       type: "bid_authorization",
//       status: "requires_capture", // ONLY this status!
//     });

//     console.log(
//       `🔄 Cancelling ${pendingAuthorizations.length} PENDING authorizations for user ${userId}`
//     );

//     let cancelledCount = 0;
//     for (const payment of pendingAuthorizations) {
//       try {
//         await StripeService.cancelPaymentIntent(payment.paymentIntentId);
//         payment.status = "canceled";
//         await payment.save();
//         cancelledCount++;
//         console.log(
//           `✅ Cancelled PENDING authorization for auction: ${payment.auction}`
//         );
//       } catch (error) {
//         console.error(
//           `❌ Failed to cancel authorization ${payment.paymentIntentId}:`,
//           error.message
//         );
//       }
//     }

//     // ✅ STEP 2: Also mark any 'succeeded' bid_authorizations as 'replaced'
//     // These are the old $2500 authorizations that were replaced by final commissions
//     const succeededAuthorizations = await BidPayment.find({
//       bidder: userId,
//       type: "bid_authorization",
//       status: "succeeded",
//     });

//     for (const payment of succeededAuthorizations) {
//       payment.status = "replaced"; // Mark as replaced for clarity
//       await payment.save();
//       console.log(
//         `📝 Marked succeeded authorization as replaced for auction: ${payment.auction}`
//       );
//     }

//     // ✅ STEP 3: Verify and update card with Stripe
//     const verificationResult = await StripeService.verifyAndSaveCard(
//       user.stripeCustomerId,
//       paymentMethodId
//     );

//     if (!verificationResult.success) {
//       throw new Error("Card verification failed");
//     }

//     const paymentMethodDetails = verificationResult.paymentMethod;

//     // ✅ STEP 4: Update user in database
//     user.paymentMethodId = paymentMethodDetails.id;
//     user.cardLast4 = paymentMethodDetails.last4;
//     user.cardBrand = paymentMethodDetails.brand;
//     user.cardExpMonth = paymentMethodDetails.expMonth;
//     user.cardExpYear = paymentMethodDetails.expYear;
//     user.isPaymentVerified = true;

//     await user.save();

//     const updatedCardInfo = {
//       last4: user.cardLast4,
//       brand: user.cardBrand,
//       expMonth: user.cardExpMonth,
//       expYear: user.cardExpYear,
//     };

//     res.status(200).json({
//       success: true,
//       message: `Payment method updated successfully. ${cancelledCount} pending authorizations cancelled.`,
//       data: {
//         card: updatedCardInfo,
//         isPaymentVerified: true,
//         userType: user.userType,
//         stripeCustomerId: user.stripeCustomerId,
//         cancelledAuthorizations: cancelledCount,
//       },
//     });
//   } catch (error) {
//     console.error("Update payment method error:", error);
//     res.status(400).json({
//       success: false,
//       message: error.message || "Failed to update payment method",
//     });
//   }
// };

/**
 * Get seller stats for a user (items sold, average rating, total reviews)
 */
export const getSellerStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const userCurrency = req.query.currency || 'EUR';

    const user = await User.findById(userId).select("username companyName firstName lastName countryName isVerified identificationStatus image phone currency");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Phone contact depends on the lot being viewed (?auctionId=...).
    let contactMode = "questions";
    const { auctionId } = req.query;
    if (auctionId && mongoose.isValidObjectId(auctionId)) {
      const lot = await Auction.findById(auctionId).select("seller auctionType reservePrice baseCurrency").lean();
      if (lot && lot.seller?.toString() === userId.toString()) contactMode = contactModeFor(lot);
    }

    // Count sold items (auctions where user is seller and status is 'sold')
    const itemsSold = await Auction.countDocuments({
      seller: userId,
      status: "sold",
    });

    const itemsAdded = await Auction.countDocuments({ seller: userId });

    // Get APPROVED reviews where user is the reviewee (ratings received)
    // Pending / rejected reviews are excluded from count and average
    const reviews = await Review.find({ reviewee: userId, status: "approved" });
    const totalReviews = reviews.length;
    const sellerImage = user?.image;
    const averageRating = totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;

    // Calculate percentage (e.g., positive experience – optional, you can compute as (averageRating / 5) * 100)
    const positivePercentage = averageRating > 0 ? (averageRating / 5) * 100 : 0;

    // Determine verified status: user.isVerified or identificationStatus === 'verified'
    const isVerified = user.isVerified || user.identificationStatus === "verified";

    // Optional: Calculate total revenue from sold auctions (converted to user's currency)
    let totalRevenueConverted = 0;
    let averageSalePriceConverted = 0;

    if (itemsSold > 0) {
      const soldAuctions = await Auction.find({
        seller: userId,
        status: "sold"
      }).select("finalPrice baseCurrency currentPrice");

      for (const auction of soldAuctions) {
        const finalPrice = auction.finalPrice || auction.currentPrice;
        if (finalPrice) {
          const convertedPrice = convertPrice(auction, userCurrency, 'finalPrice') || convertPrice(auction, userCurrency, 'currentPrice');
          totalRevenueConverted += convertedPrice || 0;
        }
      }
      averageSalePriceConverted = totalRevenueConverted / itemsSold;
    }

    res.status(200).json({
      success: true,
      data: {
        // First name only for individuals; company names in full (utils/displayName.js).
        displayName: publicName(user),
        companyName: user.companyName,
        // How buyers contact the seller about this lot ("phone" or "questions").
        contactMode,
        // The phone number is only given to signed-in users, and only for lots
        // whose contact mode is "phone" (utils/contactPolicy.js). Email is never public.
        phone: contactMode === "phone" && req.user ? user?.phone : undefined,
        country: user.countryName || "Not specified",
        currency: user?.currency || userCurrency,
        displayCurrency: userCurrency,
        isVerified,
        itemsSold,
        itemsAdded,
        sellerImage,
        averageRating: parseFloat(averageRating.toFixed(2)),
        totalReviews,
        positivePercentage: parseFloat(positivePercentage.toFixed(2)),
        // Optional revenue stats (converted)
        totalRevenue: parseFloat(totalRevenueConverted.toFixed(2)),
        averageSalePrice: parseFloat(averageSalePriceConverted.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Get seller stats error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Upload identification document
export const uploadIdentification = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only JPG, PNG, and PDF are allowed",
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user can upload (only if rejected or not verified)
    if (user.identificationStatus === "verified") {
      return res.status(400).json({
        success: false,
        message: "Your identity is already verified",
      });
    }

    // If user had previous document, delete it from Cloudinary
    if (user.identificationDocumentPublicId) {
      try {
        await deleteFromCloudinary(user.identificationDocumentPublicId, "raw");
      } catch (deleteError) {
        console.error("Failed to delete old document:", deleteError);
        // Continue with upload even if delete fails
      }
    }

    // Upload new document to Cloudinary
    const isImage = file.mimetype.startsWith("image/");
    let uploadResult;

    if (isImage) {
      uploadResult = await uploadImageToCloudinary(
        file.buffer,
        "identification-documents",
      );
    } else {
      uploadResult = await uploadDocumentToCloudinary(
        file.buffer,
        file.originalname,
        "identification-documents",
      );
    }

    // Update user with new document info
    user.identificationDocument = uploadResult.secure_url;
    user.identificationDocumentPublicId = uploadResult.public_id;
    user.identificationStatus = "pending";
    user.identificationRejectionReason = null; // Clear any previous rejection reason
    user.identificationVerifiedAt = null;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Identification document uploaded successfully",
      data: {
        user: user.toSafeObject(),
      },
    });
  } catch (error) {
    console.error("Upload identification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload identification document",
    });
  }
};

// Get user's verification status
export const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select(
      "identificationDocument identificationStatus identificationVerifiedAt identificationRejectionReason",
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
        status: user.identificationStatus || "not_uploaded",
        documentUrl: user.identificationDocument,
        verifiedAt: user.identificationVerifiedAt,
        rejectionReason: user.identificationRejectionReason,
      },
    });
  } catch (error) {
    console.error("Get verification status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch verification status",
    });
  }
};

// Delete identification document
export const deleteIdentification = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Only allow deletion if status is rejected or pending
    if (user.identificationStatus === "verified") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete verified document",
      });
    }

    // Delete from Cloudinary
    if (user.identificationDocumentPublicId) {
      try {
        await deleteFromCloudinary(user.identificationDocumentPublicId, "raw");
      } catch (deleteError) {
        console.error("Failed to delete from Cloudinary:", deleteError);
      }
    }

    // Clear document fields
    user.identificationDocument = null;
    user.identificationDocumentPublicId = null;
    user.identificationStatus = null;
    user.identificationRejectionReason = null;
    user.identificationVerifiedAt = null;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Identification document deleted successfully",
      data: {
        user: user.toSafeObject(),
      },
    });
  } catch (error) {
    console.error("Delete identification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete identification document",
    });
  }
};

export const unsubscribeUser = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Unsubscribe token is required"
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      unsubscribeToken: hashedToken,
      unsubscribeTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired unsubscribe token"
      });
    }

    // Disable both email and SMS updates
    user.preferences.emailUpdates = false;
    user.unsubscribeToken = undefined;
    user.unsubscribeTokenExpiry = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "You have been unsubscribed from all update notifications."
    });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unsubscribe"
    });
  }
};

export const updateCurrency = async (req, res) => {
  try {
    const { currency } = req.body;

    const allowed = ["EUR", "GBP"];
    if (!currency || !allowed.includes(currency)) {
      return res.status(400).json({
        success: false,
        message: `Invalid currency. Allowed: ${allowed.join(", ")}`,
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { currency },
      { new: true, runValidators: true }
    ).select("currency");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Currency updated successfully",
      data: { currency: user.currency },
    });
  } catch (error) {
    console.error("Update currency error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update currency" });
  }
};