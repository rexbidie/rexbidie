import { model, Schema } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const userSchema = new Schema(
  {
    // Basic Info
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: false,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    companyVATNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    referredBy: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      lowercase: true,
      validate: {
        validator: function (email) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        },
        message: "Please enter a valid email address",
      },
    },
    password: {
      type: String,
      required: true,
    },

    // User Type
    userType: {
      type: String,
      enum: ["bidder", "seller", "broker", "admin", "cashier", "staff", "company"],
      required: true,
    },

    // Additional Info
    countryCode: {
      type: String,
      required: false,
      trim: true,
    },
    countryName: {
      type: String,
      required: false,
      trim: true,
    },
    currency: {
      type: String,
      required: false,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      // unique: true,
      sparse: true,
      default: null,
    },
    image: {
      type: String,
      trim: true,
    },
    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      county: { type: String, trim: true },
      state: { type: String, trim: true },
      postCode: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    preferences: {
      // Old single switch: false turns off every optional email.
      emailUpdates: { type: Boolean, default: true },
      // Per-category choices (see utils/emailPreferences.js). Payments, auction
      // won, offer accepted, item sold and account emails can't be turned off.
      email: {
        bidding: { type: Boolean, default: true },
        reminders: { type: Boolean, default: true },
        watchlist: { type: Boolean, default: true },
        offers: { type: Boolean, default: true },
        buyItNow: { type: Boolean, default: true },
        questions: { type: Boolean, default: true },
        myListings: { type: Boolean, default: true },
        newListings: { type: Boolean, default: true },
        news: { type: Boolean, default: true },
      },
      push: {
        bidding: { type: Boolean, default: true },
        reminders: { type: Boolean, default: true },
        watchlist: { type: Boolean, default: true },
        offers: { type: Boolean, default: true },
        buyItNow: { type: Boolean, default: true },
        questions: { type: Boolean, default: true },
        myListings: { type: Boolean, default: true },
        newListings: { type: Boolean, default: true },
        news: { type: Boolean, default: true },
      },
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    permissions: {
      type: [String],
      default: [],
      enum: [
        "view_dashboard",
        "manage_users",
        "manage_cashiers",
        "manage_auctions",
        "manage_bids",
        "manage_offers",
        "manage_transactions",
        "manage_subscriptions",
        "manage_categories",
        "manage_videos",
        "manage_inquiries",
        "manage_commissions",
        "manage_admins",
        "manage_email",
      ],
    },

    // Stripe Payment Info (For Bidders Only)
    stripeCustomerId: {
      type: String,
      sparse: true,
    },
    paymentMethodId: {
      type: String,
      sparse: true,
    },
    cardLast4: {
      type: String,
      trim: true,
    },
    cardBrand: {
      type: String,
      trim: true,
    },
    cardExpMonth: {
      type: Number,
    },
    cardExpYear: {
      type: Number,
    },

    // Payment status
    isPaymentVerified: {
      type: Boolean,
      default: false,
    },

    // Stripe Connect (Express) account that seller payouts are transferred to.
    // Status is cached from Stripe and refreshed when it matters.
    stripeConnect: {
      accountId: { type: String, sparse: true },
      payoutsEnabled: { type: Boolean, default: false },
      detailsSubmitted: { type: Boolean, default: false },
      requirementsDue: { type: Number, default: 0 },
      bankLast4: String,
      bankName: String,
      checkedAt: Date,
    },

    // Payout Methods for Sellers
    payoutMethods: {
      paypal: {
        email: {
          type: String,
          trim: true,
          lowercase: true,
          validate: {
            validator: function (email) {
              if (!email) return true; // Optional field
              return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            },
            message: "Please enter a valid PayPal email address",
          },
        },
        isVerified: {
          type: Boolean,
          default: false,
        },
        addedAt: Date,
        updatedAt: Date,
      },
      payoneer: {
        email: {
          type: String,
          trim: true,
          lowercase: true,
          validate: {
            validator: function (email) {
              if (!email) return true; // Optional field
              return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            },
            message: "Please enter a valid Payoneer email address",
          },
        },
        isVerified: {
          type: Boolean,
          default: true,
        },
        addedAt: Date,
        updatedAt: Date,
      },
      bankTransfer: {
        accountHolderName: {
          type: String,
          trim: true,
        },
        bankName: {
          type: String,
          trim: true,
        },
        accountNumber: {
          type: String,
          trim: true,
        },
        routingNumber: {
          type: String,
          trim: true,
        },
        iban: {
          type: String,
          trim: true,
        },
        swiftCode: {
          type: String,
          trim: true,
        },
        currency: {
          type: String,
          default: "EUR",
          trim: true,
        },
        bankAddress: {
          type: String,
          trim: true,
        },
        isVerified: {
          type: Boolean,
          default: true,
        },
        addedAt: Date,
        updatedAt: Date,
      },
    },

    // Default payout method preference
    defaultPayoutMethod: {
      type: String,
      enum: ["paypal", "payoneer", "bankTransfer", null],
      default: "bankTransfer",
    },

    // Account Status
    isVerified: {
      type: Boolean,
      default: false, //changed
    },
    isEmailVerified: {
      type: Boolean,
      default: false, //changed
    },
    // Set when the user deleted their account (it is anonymised, not removed).
    deletedAt: { type: Date, default: null },
    deletionReason: { type: String, trim: true },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Set by an admin when email to this address bounced. The site stops
    // emailing it until the address is changed.
    emailBounced: {
      type: Boolean,
      default: false,
    },
    emailBouncedAt: Date,

    // ID Verification Fields
    identificationDocument: {
      type: String, // Cloudinary URL
      trim: true,
    },
    identificationDocumentPublicId: {
      type: String, // Cloudinary public ID for deletion
      trim: true,
    },
    identificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "verified",
    },
    identificationVerifiedAt: {
      type: Date,
    },
    identificationRejectionReason: {
      type: String,
      trim: true,
    },
    identificationType: {
      type: String,
      enum: ["passport", "drivers_license", "national_id", "other"],
    },

    // Tokens
    // Legacy single refresh token (sign-ins from before per-device sessions).
    refreshToken: {
      type: String,
    },
    // One entry per signed-in device / browser (see utils/sessions.js).
    sessions: {
      type: [
        {
          _id: false,
          hash: String,
          rememberMe: Boolean,
          createdAt: Date,
          expiresAt: Date,
          rotatedAt: Date,
        },
      ],
      default: [],
      select: false,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordTokenExpiry: {
      type: Date,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpiry: {
      type: Date,
    },
    unsubscribeToken: {
      type: String,
    },
    unsubscribeTokenExpiry: {
      type: Date,
    },

    // Admin contact tracking
    lastContactedAt: {
      type: Date,
      default: null
    },

    gaClientId: {
      type: String,
      default: null,
      index: true
    }

  },
  { timestamps: true },
);

// Index for better query performance
userSchema.index({ userType: 1, email: 1 });

// Pre-save middleware for password hashing
userSchema.pre("save", async function (next) {
  try {
    if (this.isModified("password")) {
      this.password = await bcrypt.hash(this.password, 10);
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Method to validate password
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Token generation methods
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      userType: this.userType,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  });
};

userSchema.methods.generateResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

  return resetToken;
};

userSchema.methods.generateUnsubscribeToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.unsubscribeToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.unsubscribeTokenExpiry = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year
  return token;
};

// Method to get user data without sensitive information
userSchema.methods.toSafeObject = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshToken;
  delete userObject.sessions;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordTokenExpiry;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpiry;
  return userObject;
};

const User = model("User", userSchema);

export default User;
