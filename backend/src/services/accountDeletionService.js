import crypto from "crypto";
import Stripe from "stripe";
import User from "../models/user.model.js";
import Auction from "../models/auction.model.js";
import Sale from "../models/sale.model.js";
import Payout from "../models/payout.model.js";
import Comment from "../models/comment.model.js";
import Watchlist from "../models/watchlist.model.js";
import Reminder from "../models/reminder.model.js";
import Device from "../models/device.model.js";
import Notification from "../models/notification.model.js";
import { deleteFromR2 } from "../utils/cloudinary.js";
import { endAllSessions } from "../utils/sessions.js";
import { accountDeletedEmail } from "../utils/nodemailer.js";

/**
 * Account deletion requested by the user (required by Apple and Google for
 * the app, and offered on the website too).
 *
 * The account is anonymised rather than removed: personal details, saved
 * cards, ID documents, devices, watchlist and reminders are deleted, but
 * sale records, receipts, statements and payouts are kept (with the names as
 * printed at the time), as RexBid must keep these for accounting and tax.
 *
 * Deletion waits until nothing is in progress: live or upcoming listings,
 * leading bids on live lots, open offers, unfinished sales or payouts.
 */

const OPEN_SALE = ["sold", "request_sent", "paid", "collected", "payout_due"];
const LIVE_LISTING = ["active", "approved"];

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Things that must be finished first. Returns [{ code, message }] (empty = can delete). */
export const findDeletionBlockers = async (userId) => {
    const [listings, leading, proxies, offers, sales, payouts] = await Promise.all([
        Auction.countDocuments({ seller: userId, status: { $in: LIVE_LISTING } }),
        Auction.countDocuments({ currentBidder: userId, status: "active" }),
        Auction.countDocuments({ status: "active", proxyBids: { $elemMatch: { bidder: userId, isActive: true } } }),
        Auction.countDocuments({ status: "active", offers: { $elemMatch: { buyer: userId, status: { $in: ["pending", "countered"] } } } }),
        Sale.countDocuments({
            status: { $in: OPEN_SALE },
            historical: { $ne: true },
            $or: [{ "buyer.user": userId }, { "seller.user": userId }],
        }),
        Payout.countDocuments({ seller: userId, status: { $in: ["pending", "processing"] } }),
    ]);

    const blockers = [];
    if (listings) blockers.push({ code: "listings", message: `You have ${plural(listings, "live or upcoming listing")}. They need to end or be withdrawn first.` });
    if (leading) blockers.push({ code: "leading", message: `You're the highest bidder on ${plural(leading, "live lot")}. Bids are binding, so wait until they end.` });
    if (proxies) blockers.push({ code: "proxies", message: `You have ${plural(proxies, "automatic (proxy) bid")} on live lots. Cancel them first.` });
    if (offers) blockers.push({ code: "offers", message: `You have ${plural(offers, "open offer")}. Withdraw them or wait for a reply.` });
    if (sales) blockers.push({ code: "sales", message: `You have ${plural(sales, "sale")} still in progress (payment, collection or payout).` });
    if (payouts) blockers.push({ code: "payouts", message: `A payout to you is still being processed.` });
    return blockers;
};

const stripeClient = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null);

/**
 * Anonymise the account. `user` is a full User document.
 * Throws if something is still in progress (check findDeletionBlockers first).
 */
export const deleteAccount = async (user, { reason } = {}) => {
    const blockers = await findDeletionBlockers(user._id);
    if (blockers.length) {
        const err = new Error("Account has activity in progress");
        err.blockers = blockers;
        throw err;
    }

    const original = {
        email: user.email,
        name: user.firstName || user.companyName || user.username || "there",
        userType: user.userType,
    };
    const id = String(user._id);
    const tag = `deleted-${id.slice(-8)}`;

    // Saved cards: delete the Stripe customer (Stripe keeps its own payment records).
    if (user.stripeCustomerId) {
        try {
            await stripeClient()?.customers.del(user.stripeCustomerId);
        } catch (err) {
            console.error("[account deletion] Stripe customer not deleted:", err.message);
        }
    }
    // Identity document.
    if (user.identificationDocumentPublicId) {
        try {
            await deleteFromR2(user.identificationDocumentPublicId, "raw");
        } catch (err) {
            console.error("[account deletion] ID document not deleted:", err.message);
        }
    }

    await Promise.all([
        Device.deleteMany({ user: user._id }),
        Notification.deleteMany({ user: user._id }),
        Watchlist.deleteMany({ user: user._id }),
        Reminder.deleteMany({ email: original.email }),
        // Questions and answers stay on the listings, without the name or photo.
        Comment.updateMany({ user: user._id }, { $set: { userName: "Deleted user", userAvatar: "" } }),
    ]);

    user.set({
        firstName: "Deleted",
        lastName: "user",
        username: tag,
        companyName: undefined,
        companyVATNumber: undefined,
        referredBy: undefined,
        email: `${tag}-${crypto.randomBytes(4).toString("hex")}@deleted.invalid`,
        password: crypto.randomBytes(32).toString("hex"),
        phone: null,
        image: undefined,
        address: {},
        stripeCustomerId: undefined,
        paymentMethodId: undefined,
        cardLast4: undefined,
        cardBrand: undefined,
        cardExpMonth: undefined,
        cardExpYear: undefined,
        isPaymentVerified: false,
        payoutMethods: undefined,
        defaultPayoutMethod: undefined,
        identificationDocument: undefined,
        identificationDocumentPublicId: undefined,
        identificationType: undefined,
        resetPasswordToken: undefined,
        resetPasswordTokenExpiry: undefined,
        emailVerificationToken: undefined,
        emailVerificationExpiry: undefined,
        unsubscribeToken: undefined,
        unsubscribeTokenExpiry: undefined,
        gaClientId: null,
        isActive: false,
        deletedAt: new Date(),
        deletionReason: reason ? String(reason).slice(0, 500) : undefined,
        "preferences.emailUpdates": false,
    });
    endAllSessions(user);
    await user.save({ validateBeforeSave: false });

    // Confirmation to the person (to their old address) and a note to the office.
    accountDeletedEmail(original, { reason }).catch((err) =>
        console.error("[account deletion] confirmation email failed:", err.message),
    );

    return { deleted: true };
};

export default { findDeletionBlockers, deleteAccount };

// Exported for tests.
export const __internals = { OPEN_SALE, LIVE_LISTING };

// Kept here so callers don't need to import User just to load the full document.
export const loadUserForDeletion = (id) => User.findById(id).select("+sessions");
