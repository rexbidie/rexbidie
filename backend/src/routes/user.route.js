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
    logoutUser,
    refreshAccessToken,
    registerUser,
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

const userRouter = Router();

// Public routes
userRouter.post('/register', upload.single('identificationDocument'), registerUser);
userRouter.post('/login', loginUser);
userRouter.post('/refresh-token', refreshAccessToken);
userRouter.post('/logout', auth, logoutUser);
userRouter.get('/me/deletion-check', auth, deletionCheck);
userRouter.post('/me/delete', auth, deleteMyAccount);
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