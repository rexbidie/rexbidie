import User from "../models/user.model.js";

/**
 * Which emails people can switch off.
 *
 * Always sent (can't be switched off): account and security, anything about
 * money (payment requests, reminders, receipts, statements, payouts), auction
 * won, your item sold, offer accepted, giveaway won, and emails to admins.
 *
 * Everything else belongs to a category the user can switch off in their
 * profile (Notifications), on the website or in the app. The same categories
 * apply to app notifications (see utils/push.js).
 */
export const TRANSACTIONAL_EMAILS = new Set([
    // Account / security
    "welcome",
    "resetPassword",
    "accountApproved",
    "accountDeleted",
    "newUserRegistration",     // to admin
    "contact",                 // to admin
    "contactConfirmation",     // to the user (acknowledgement)

    // Payments / payouts / invoices
    "paymentCompleted",
    "paymentSuccess",
    "paymentCompletedSeller",
    "payoutInitiated",
    "payoutCompleted",
    "payoutFailed",
    "sendAuctionWon",          // invoice to winner

    // Offer accepted (a sale)
    "offerAccepted",

    // Your item sold / your listing ended
    "sendAuctionEndedSeller",

    // Admin / system
    "auctionWonAdmin",
    "auctionEndedAdmin",
    "flaggedCommentAdmin",
    "deliveryQuoteAdmin",
    "deliveryQuoteUser",

    // Giveaway win (must notify winner to claim)
    "giveawayWinner",
]);

/** Categories shown to users, in display order. */
export const NOTIFICATION_CATEGORIES = [
    { key: "bidding", label: "Bidding", description: "Bid confirmations, outbid alerts and reserve not met" },
    { key: "reminders", label: "Ending soon", description: "Reminders before lots you bid on or follow close" },
    { key: "watchlist", label: "Watchlist", description: "New bids on lots in your watchlist" },
    { key: "offers", label: "Offers", description: "Offers made, countered, declined or withdrawn" },
    { key: "buyItNow", label: "Last Chance", description: "Lots you bid on or follow going on Last Chance (fixed price for 48 hours after the auction)" },
    { key: "questions", label: "Questions", description: "Questions and answers on listings" },
    { key: "myListings", label: "My listings (sellers)", description: "New bids, approvals, reserve tips and Last Chance for your own listings" },
    { key: "newListings", label: "New listings", description: "Alerts about newly listed machinery" },
    { key: "news", label: "News and offers from RexBid", description: "Occasional updates, sale dates and promotions" },
];
export const CATEGORY_KEYS = NOTIFICATION_CATEGORIES.map((c) => c.key);

/** Email type → category. Types not listed and not transactional count as "news". */
export const EMAIL_CATEGORY = {
    bidConfirmation: "bidding",
    outbid: "bidding",
    reserveNotMet: "bidding",

    endingSoon: "reminders",

    watchlist: "watchlist",

    offerConfirmation: "offers",
    newOffer: "offers",
    offerRejected: "offers",
    offerCanceled: "offers",
    offerCountered: "offers",
    buyerCountered: "offers",
    counterOfferRejected: "offers",

    postAuctionBin: "buyItNow",
    postAuctionBinTopBidder: "buyItNow",

    newComment: "questions",
    newQuestionSeller: "questions",
    questionAnswered: "questions",

    newBid: "myListings",
    endingSoonSeller: "myListings",
    reserveNudge: "myListings",
    postAuctionBinSeller: "myListings",
    auctionApproved: "myListings",
    auctionListed: "myListings",
    binInvite: "myListings",

    newAuction: "newListings",

    giveawayParticipation: "news",
    marketing: "news",
};

const categoryFor = (emailType) => EMAIL_CATEGORY[emailType] || "news";

/** Is this category switched on for this channel ("email" or "push")? */
export const wantsCategory = (user, category, channel = "email") => {
    if (!user) return false;
    const prefs = user.preferences || {};
    // The old single switch still turns off every optional email.
    if (channel === "email" && prefs.emailUpdates === false) return false;
    return prefs[channel]?.[category] !== false;
};

/**
 * Sync check — call when you already have a user object in hand
 * (it needs `preferences` and `userType`).
 * Returns true if the email should be sent.
 */
export const canEmailUser = (user, emailType = "notification") => {
    if (!user) return false;
    if (TRANSACTIONAL_EMAILS.has(emailType)) return true;
    if (user.userType === "admin") return true;
    return wantsCategory(user, categoryFor(emailType), "email");
};

/**
 * Async check — call when you only have an email string.
 * Looks up the user; if the recipient is the system/admin address,
 * we treat it as a system recipient and always send.
 */
export const canSendEmail = async (email, emailType = "notification") => {
    if (!email) return false;

    // System / admin recipient — always send
    const systemEmail = process.env.EMAIL_USER?.toLowerCase();
    if (systemEmail && email.toLowerCase() === systemEmail) return true;

    // Transactional — always send
    if (TRANSACTIONAL_EMAILS.has(emailType)) return true;

    const user = await User.findOne({ email: email.toLowerCase() })
        .select("preferences userType")
        .lean();

    if (!user) return false;
    return canEmailUser(user, emailType);
};

/**
 * Clean a preferences update from the browser/app. Returns the $set object
 * (only known keys, booleans only), or null if there's nothing valid.
 */
export const preferencesUpdate = (input = {}) => {
    const set = {};
    if (typeof input.emailUpdates === "boolean") set["preferences.emailUpdates"] = input.emailUpdates;
    for (const channel of ["email", "push"]) {
        const given = input[channel];
        if (!given || typeof given !== "object") continue;
        for (const key of CATEGORY_KEYS) {
            if (typeof given[key] === "boolean") set[`preferences.${channel}.${key}`] = given[key];
        }
    }
    return Object.keys(set).length ? set : null;
};
