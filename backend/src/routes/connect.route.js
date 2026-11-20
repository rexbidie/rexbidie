import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import {
    refreshSellerConnect,
    createOnboardingLink,
    createDashboardLink,
    payoutState,
    readPayoutSetupToken,
} from "../services/connectService.js";

// Mounted at /api/v1/stripe-connect (sellers and companies, signed in)
const connectRouter = Router();

const send = (res, sc) =>
    res.json({
        success: true,
        data: {
            state: payoutState(sc),
            payoutsEnabled: !!sc?.payoutsEnabled,
            detailsSubmitted: !!sc?.detailsSubmitted,
            requirementsDue: sc?.requirementsDue || 0,
            bankLast4: sc?.bankLast4,
            bankName: sc?.bankName,
        },
    });

const fail = (res, err) => {
    if (!err.status) console.error("Stripe Connect error:", err?.type, err?.code, err?.message);
    // Stripe's own reason (e.g. a detail it won't accept) helps the seller and us;
    // only a real connection problem gets the generic message.
    const stripeSaid = err?.type && err.type !== "StripeConnectionError" && err.type !== "StripeAPIError" ? err.message : null;
    res.status(err.status || (stripeSaid ? 400 : 500)).json({
        success: false,
        message: err.status ? err.message : stripeSaid ? `Stripe says: ${stripeSaid}` : "Stripe could not be reached. Please try again.",
    });
};

connectRouter.get("/status", auth, async (req, res) => {
    try {
        send(res, await refreshSellerConnect(req.user._id));
    } catch (err) {
        fail(res, err);
    }
});

connectRouter.post("/onboarding-link", auth, async (req, res) => {
    try {
        const { default: User } = await import("../models/user.model.js");
        const user = await User.findById(req.user._id);
        res.json({ success: true, data: { url: await createOnboardingLink(user) } });
    } catch (err) {
        fail(res, err);
    }
});

connectRouter.post("/dashboard-link", auth, async (req, res) => {
    try {
        const { default: User } = await import("../models/user.model.js");
        const user = await User.findById(req.user._id);
        res.json({ success: true, data: { url: await createDashboardLink(user) } });
    } catch (err) {
        fail(res, err);
    }
});

// Public: the emailed payout setup link (no sign-in). Returns a fresh Stripe link.
connectRouter.get("/setup/:token", async (req, res) => {
    try {
        const uid = readPayoutSetupToken(req.params.token);
        if (!uid) return res.status(410).json({ success: false, message: "This link has expired. Please ask RexBid for a new one." });
        const { default: User } = await import("../models/user.model.js");
        const user = await User.findById(uid);
        if (!user || user.deletedAt) return res.status(404).json({ success: false, message: "This link is no longer valid." });
        const site = process.env.FRONTEND_URL || "https://rexbid.ie";
        const url = await createOnboardingLink(user, {
            refreshUrl: `${site}/payout-setup/${req.params.token}`,
            returnUrl: `${site}/payout-setup/done`,
        });
        res.json({ success: true, data: { url } });
    } catch (err) {
        fail(res, err);
    }
});

export default connectRouter;
