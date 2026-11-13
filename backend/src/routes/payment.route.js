import { Router } from "express";
import {
    confirmCheckoutPayment,
    confirmListingExtrasPayment,
    createBankTransferPayment,
    createCheckoutPayment,
    createWonAuctionPayment,
    getAuctionPaymentStatus,
    paySellerCommission,
} from "../controllers/payment.controller.js";
import { auth } from "../middlewares/auth.middleware.js";

const paymentRouter = Router();

// Protected routes
paymentRouter.use(auth);
paymentRouter.post("/create-won-auction-payment", createWonAuctionPayment);
paymentRouter.get("/auction/:auctionId/status", getAuctionPaymentStatus);

// Add these new routes
paymentRouter.post("/create-checkout-payment", createCheckoutPayment);
paymentRouter.post("/confirm-checkout-payment", confirmCheckoutPayment);
paymentRouter.post("/create-bank-transfer-payment", createBankTransferPayment);
paymentRouter.post("/pay-commission", paySellerCommission);
paymentRouter.post("/confirm-listing-extras", confirmListingExtrasPayment);

// The Stripe webhook is registered in server.js, ahead of the JSON body
// parser and without login, so Stripe's signature check can work.

export default paymentRouter;