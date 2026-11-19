import { Router } from "express";
import upload from "../middlewares/multer.middleware.js";
import {
    createPaymentMethod,
    deleteIdentification,
    forgotPassword,
    getBillingInfo,
    getSellerStats,
    getVerificationStatus,
    loginUser,
    verifyEmail,
    resendVerification,
    logoutUser,
    refreshAccessToken,
    registerUser,
    checkEmailAddress,
    resetPassword,
    unsubscribeUser,
    updateCurrency,
    updatePaymentMethod,
    uploadIdentification,
} from "../controllers/user.controller.js";

import {
    getProfile,
    updateProfile,
    changePassword,
    updatePreferences,
    getUserStats,
} from "../controllers/profile.controller.js";

import { auth, optionalAuth } from "../middlewares/auth.middleware.js";
import { deleteMyAccount, deletionCheck } from "../controllers/accountDeletion.controller.js";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import { buyerTermsCurrent, buyerTermsUpdate, termsEveryMinutes, termsQuietMinutes } from "../utils/buyerTerms.js";

const userRouter = Router();

// Public routes
userRouter.post('/register', upload.single('identificationDocument'), registerUser);
// Live email check on the sign-up forms (format, mail server, typo suggestion)
userRouter.post('/check-email', checkEmailAddress);
userRouter.post('/login', loginUser);
// Confirm the email address with the 6-digit code from sign-up
userRouter.post('/verify-email', verifyEmail);
userRouter.post('/resend-verification', resendVerification);
userRouter.post('/refresh-token', refreshAccessToken);
userRouter.post('/logout', auth, logoutUser);
userRouter.get('/me/deletion-check', auth, deletionCheck);
userRouter.post('/me/delete', auth, deleteMyAccount);

// Buyer Terms agreement before bidding (utils/buyerTerms.js)
userRouter.get('/me/buyer-terms', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("buyerTerms.acceptedAt").lean();
        res.json({
            success: true,
            data: {
                current: buyerTermsCurrent(user),
                acceptedAt: user?.buyerTerms?.acceptedAt || null,
                // The page re-checks against these as time passes (30 min; never in a lot's last 10 min).
                everyMinutes: termsEveryMinutes(),
                quietMinutes: termsQuietMinutes(),
                serverNow: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("Buyer terms status error:", error);
        res.status(500).json({ success: false, message: "Couldn't check your Buyer Terms agreement" });
    }
});
userRouter.post('/me/buyer-terms', auth, async (req, res) => {
    try {
        const auctionId = mongoose.isValidObjectId(req.body?.auctionId) ? req.body.auctionId : null;
        const now = new Date();
        await User.updateOne(
            { _id: req.user._id },
            buyerTermsUpdate({ now, auctionId, ip: req.ip, userAgent: req.get("user-agent") })
        );
        res.json({ success: true, data: { current: true, acceptedAt: now } });
    } catch (error) {
        console.error("Buyer terms accept error:", error);
        res.status(500).json({ success: false, message: "Couldn't save your agreement. Please try again." });
    }
});
userRouter.post('/forgot-password', forgotPassword);
userRouter.post('/reset-password/:token', resetPassword);
userRouter.get('/unsubscribe/:token', unsubscribeUser);
userRouter.get("/:userId/seller-stats", optionalAuth, getSellerStats);

// Protected routes
userRouter.get('/profile', auth, getProfile);
userRouter.put('/profile', auth, upload.single('image'), updateProfile);
userRouter.put('/change-password', auth, changePassword);
userRouter.put('/preferences', auth, updatePreferences);
userRouter.get('/stats/:userType', auth, getUserStats);
userRouter.get('/billing', auth, getBillingInfo);
userRouter.post('/billing/create-card', auth, createPaymentMethod);
userRouter.put('/billing/update-card', auth, updatePaymentMethod);
userRouter.put("/currency", auth, updateCurrency);

// ID Verification routes (Protected)
userRouter.post('/upload-identification',
    auth,
    upload.single('identificationDocument'),
    uploadIdentification
);
userRouter.get('/verification-status', auth, getVerificationStatus);
userRouter.delete('/identification', auth, deleteIdentification);

export default userRouter;