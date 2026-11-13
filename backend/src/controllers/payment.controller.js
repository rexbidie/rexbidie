import Stripe from "stripe";
import Auction from "../models/auction.model.js";
import BidPayment from "../models/bidPayment.model.js";
import User from "../models/user.model.js";
import Commission from "../models/commission.model.js";
import {
    paymentCompletedEmail,
} from "../utils/nodemailer.js";
import { getCommissionSettings } from "../utils/commissionCalculator.js";
import { getCachedRates } from "../routes/currency.route.js";
import { recordPayment, recordPartialFunding } from "../services/saleService.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createWonAuctionPayment = async (req, res) => {
    try {
        const { auctionId } = req.body;
        const userId = req.user.id;

        // Find the auction
        const auction = await Auction.findById(auctionId)
            .populate("seller", "email username companyName firstName lastName")
            .populate(
                "winner",
                "email username companyName firstName lastName stripeCustomerId paymentMethodId",
            );

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Verify user is the winner
        if (auction.winner?._id.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You are not the winner of this auction",
            });
        }

        // Check if already paid
        if (auction.paymentStatus === "completed") {
            return res.status(400).json({
                success: false,
                message: "This auction has already been paid for",
            });
        }

        // Get user's stripe info
        const user = await User.findById(userId);
        if (!user.stripeCustomerId || !user.paymentMethodId) {
            return res.status(400).json({
                success: false,
                message: "No payment method found. Please add a card to your account.",
            });
        }

        const commissionSettings = await getCommissionSettings();

        // Calculate total amount (finalPrice + commission)
        const bidAmount = auction.finalPrice || auction.currentPrice;
        const commissionAmount = auction.bidderCommissionAmount || 0;
        const totalAmount = bidAmount + commissionAmount;
        // Check if payment record already exists
        let bidPayment = await BidPayment.findOne({
            auction: auctionId,
            bidder: userId,
        });

        try {
            // Create Stripe payment intent for immediate charge
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(totalAmount * 100), // Convert to cents
                currency: "EUR",
                customer: user.stripeCustomerId,
                payment_method: user.paymentMethodId,
                description: `Payment for auction: ${auction.title}`,
                confirm: true, // Confirm immediately to charge
                off_session: true,
                metadata: {
                    auctionId: auctionId,
                    userId: userId,
                    type: "won_auction_payment",
                },
            });

            // Update or create bid payment record
            if (bidPayment) {
                bidPayment.paymentIntentId = paymentIntent.id;
                bidPayment.clientSecret = paymentIntent.client_secret;
                bidPayment.status = paymentIntent.status;
                bidPayment.bidAmount = bidAmount;
                bidPayment.commissionAmount = commissionAmount;
                bidPayment.totalAmount = totalAmount;
                bidPayment.chargeAttempted = true;
                bidPayment.chargeSucceeded = paymentIntent.status === "succeeded";
                await bidPayment.save();
            } else {
                bidPayment = await BidPayment.create({
                    auction: auctionId,
                    bidder: userId,
                    bidAmount: bidAmount,
                    commissionAmount: commissionAmount,
                    totalAmount: totalAmount,
                    paymentIntentId: paymentIntent.id,
                    clientSecret: paymentIntent.client_secret,
                    status: paymentIntent.status,
                    chargeAttempted: true,
                    chargeSucceeded: paymentIntent.status === "succeeded",
                    type: "final_commission",
                });
            }

            // If payment succeeded immediately, update auction
            if (paymentIntent.status === "succeeded") {
                auction.paymentStatus = "completed";
                auction.paymentMethod = "credit_card";
                auction.paymentDate = new Date();
                auction.transactionId = paymentIntent.id;
                await auction.save();
            }

            // Payment emails are always sent (they can't be switched off).
            paymentCompletedEmail(user, auction).catch(console.error);

            return res.status(200).json({
                success: true,
                data: {
                    paymentIntent: {
                        id: paymentIntent.id,
                        status: paymentIntent.status,
                        clientSecret: paymentIntent.client_secret,
                    },
                    bidPayment: bidPayment,
                    auction: {
                        id: auction._id,
                        paymentStatus: auction.paymentStatus,
                    },
                },
            });
        } catch (stripeError) {
            console.error("Stripe payment error:", stripeError);

            // Update bid payment with failed status if it exists
            if (bidPayment) {
                bidPayment.status = "processing_failed";
                bidPayment.chargeAttempted = true;
                await bidPayment.save();
            }

            // Update auction payment status to failed
            auction.paymentStatus = "failed";
            await auction.save();

            return res.status(400).json({
                success: false,
                message: stripeError.message || "Payment processing failed",
                error: stripeError.code,
            });
        }
    } catch (error) {
        console.error("Create won auction payment error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// Webhook handler for Stripe events
export const handleStripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET,
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const pi = event.data.object;
    // Bank-transfer payment requests raised from a Sale record.
    const isSale = pi?.metadata?.source === "sale_payment_request";

    try {
        switch (event.type) {
            case "payment_intent.succeeded":
                if (isSale) await recordPayment(pi);
                else if (pi?.metadata?.type === 'listing_extras') await handleListingExtrasSuccess(pi);
                else await handlePaymentSuccess(pi);
                break;
            case "payment_intent.partially_funded":
                if (isSale) await recordPartialFunding(pi);
                break;
            case "payment_intent.payment_failed":
                if (isSale) { /* nothing */ }
                else if (pi?.metadata?.type === 'listing_extras') await handleListingExtrasFailure(pi);
                else await handlePaymentFailure(pi);
                break;
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (err) {
        // Let Stripe retry.
        console.error(`Webhook ${event.type} failed:`, err);
        return res.status(500).json({ received: false });
    }

    res.json({ received: true });
};

// Webhook handler for Stripe events
async function handlePaymentSuccess(paymentIntent) {
    try {
        const { auctionId } = paymentIntent.metadata;

        // Find the bid payment
        const bidPayment = await BidPayment.findOne({
            paymentIntentId: paymentIntent.id,
        });

        if (!bidPayment) {
            console.error(
                "BidPayment not found for payment intent:",
                paymentIntent.id,
            );
            return;
        }

        // Fetch the auction and update via .save() so the GA4 purchase hook fires
        const auction = await Auction.findById(auctionId);
        if (!auction) {
            console.error("Auction not found for payment intent:", paymentIntent.id);
            return;
        }

        // Only proceed if payment hasn't already been marked completed
        // (avoids the case where the inline client path already fired)
        if (auction.paymentStatus !== "completed") {
            auction.paymentStatus = "completed";
            auction.paymentMethod = "credit_card";
            auction.paymentDate = new Date();
            auction.transactionId = paymentIntent.id;
            await auction.save();   // ← triggers the GA4 purchase hook
        }

        // Update bid payment
        await BidPayment.findOneAndUpdate(
            { paymentIntentId: paymentIntent.id },
            { status: "succeeded", chargeSucceeded: true },
        );

        console.log(`Payment succeeded for auction ${auctionId}`);
    } catch (error) {
        console.error("Error handling payment success:", error);
    }
}

async function handlePaymentFailure(paymentIntent) {
    try {
        const { auctionId } = paymentIntent.metadata;

        // Update auction
        await Auction.findByIdAndUpdate(auctionId, {
            paymentStatus: "failed",
        });

        // Update bid payment
        await BidPayment.findOneAndUpdate(
            { paymentIntentId: paymentIntent.id },
            {
                status: "processing_failed",
                chargeSucceeded: false,
            },
        );

        console.log(`Payment failed for auction ${auctionId}`);
    } catch (error) {
        console.error("Error handling payment failure:", error);
    }
}

async function handleListingExtrasSuccess(paymentIntent) {
    try {
        const auctionId = paymentIntent.metadata?.auctionId;
        if (!auctionId) return;

        const auction = await Auction.findById(auctionId);
        if (!auction) return;

        auction.extrasPayment.status = 'completed';
        auction.extrasPayment.paidAt = new Date();

        if (
            (auction.auctionType === 'buy_now' || auction.auctionType === 'giveaway') &&
            auction.status === 'draft'
        ) {
            auction.status = 'active';
        }

        await auction.save();
        console.log(`✅ Listing extras paid for auction ${auctionId}`);
    } catch (err) {
        console.error('handleListingExtrasSuccess error:', err);
    }
}

async function handleListingExtrasFailure(paymentIntent) {
    try {
        const auctionId = paymentIntent.metadata?.auctionId;
        if (!auctionId) return;
        await Auction.findByIdAndUpdate(auctionId, {
            'extrasPayment.status': 'failed',
        });
        console.log(`❌ Listing extras payment failed for auction ${auctionId}`);
    } catch (err) {
        console.error('handleListingExtrasFailure error:', err);
    }
}

// Get payment status for an auction
export const getAuctionPaymentStatus = async (req, res) => {
    try {
        const { auctionId } = req.params;
        const userId = req.user.id;

        const auction = await Auction.findById(auctionId).select(
            "paymentStatus paymentMethod paymentDate transactionId finalPrice commissionAmount",
        );

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        const bidPayment = await BidPayment.findOne({
            auction: auctionId,
            bidder: userId,
        }).select("status paymentIntentId createdAt");

        return res.status(200).json({
            success: true,
            data: {
                auction: {
                    paymentStatus: auction.paymentStatus,
                    paymentMethod: auction.paymentMethod,
                    paymentDate: auction.paymentDate,
                    transactionId: auction.transactionId,
                    finalPrice: auction.finalPrice,
                    commissionAmount: auction.commissionAmount,
                    totalAmount:
                        (auction.finalPrice || 0) + (auction.commissionAmount || 0),
                },
                bidPayment: bidPayment,
            },
        });
    } catch (error) {
        console.error("Get payment status error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

// Charge in Auction's Base Currency
// export const createCheckoutPayment = async (req, res) => {
//     try {
//         const { auctionId } = req.body;
//         const userId = req.user.id;
//         const userCurrency = req.query.currency || 'EUR';
//         const rates = getCachedRates();

//         // Helper to convert amount using auction's base currency (for display only)
//         const convertAmount = (amount, auction) => {
//             if (!amount) return 0;
//             if (!rates) return amount;
//             const base = auction.baseCurrency || 'EUR';
//             const rate = rates[base]?.rates[userCurrency];
//             if (!rate) return amount;
//             return parseFloat((amount * rate).toFixed(2));
//         };

//         // 1. Find auction and verify winner
//         const auction = await Auction.findById(auctionId)
//             .populate("seller", "email username firstName lastName")
//             .populate(
//                 "winner",
//                 "email username firstName lastName stripeCustomerId paymentMethodId cardLast4 cardBrand",
//             );

//         if (!auction) {
//             return res
//                 .status(404)
//                 .json({ success: false, message: "Auction not found" });
//         }

//         if (auction.winner?._id.toString() !== userId) {
//             return res
//                 .status(403)
//                 .json({ success: false, message: "Not authorized" });
//         }

//         if (auction.paymentStatus === "completed") {
//             return res.status(400).json({ success: false, message: "Already paid" });
//         }

//         // 2. Get user's saved card
//         const user = await User.findById(userId);
//         if (!user.stripeCustomerId || !user.paymentMethodId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "No saved card found. Please add a card to your account.",
//             });
//         }

//         const commissionSettings = await getCommissionSettings();

//         // 3. Calculate total in base currency (original - this is what Stripe will charge)
//         const bidAmount = auction.finalPrice || auction.currentPrice;
//         const commissionAmount = auction.commissionAmount || 0;
//         const totalAmountInBase = commissionSettings && commissionSettings.isEnabled && commissionSettings.appliesTo?.includes('bidder') 
//             ? bidAmount + commissionAmount 
//             : bidAmount;

//         // Charge in auction's base currency (EUR or GBP)
//         const amountToCharge = Math.round(totalAmountInBase * 100);
//         const chargeCurrency = auction.baseCurrency === 'GBP' ? 'gbp' : 'eur';

//         // 4. Create and confirm payment immediately
//         const paymentIntent = await stripe.paymentIntents.create({
//             amount: amountToCharge,
//             currency: chargeCurrency,
//             customer: user.stripeCustomerId,
//             payment_method: user.paymentMethodId,
//             description: `Payment for auction: ${auction.title}`,
//             confirm: true,
//             off_session: true,
//             metadata: {
//                 auctionId: auctionId,
//                 userId: userId,
//                 baseCurrency: auction.baseCurrency,
//                 originalAmount: totalAmountInBase,
//                 userCurrency: userCurrency,
//             },
//         });

//         if (paymentIntent.status !== "succeeded") {
//             return res.status(400).json({
//                 success: false,
//                 message: `Payment failed: ${paymentIntent.status}`,
//             });
//         }

//         // 5. Update auction payment status
//         auction.paymentStatus = "completed";
//         auction.paymentMethod = "credit_card";
//         auction.paymentDate = new Date();
//         auction.transactionId = paymentIntent.id;
//         await auction.save();

//         // 6. Store payment record with converted amounts for display
//         const convertedBidAmount = convertAmount(bidAmount, auction);
//         const convertedCommissionAmount = convertAmount(commissionAmount, auction);
//         const convertedTotalAmount = convertAmount(totalAmountInBase, auction);

//         const bidPayment = await BidPayment.create({
//             auction: auctionId,
//             bidder: userId,
//             bidAmount: bidAmount,
//             bidAmountConverted: convertedBidAmount,
//             commissionAmount: commissionAmount,
//             commissionAmountConverted: convertedCommissionAmount,
//             totalAmount: totalAmountInBase,
//             totalAmountConverted: convertedTotalAmount,
//             paymentIntentId: paymentIntent.id,
//             status: "succeeded",
//             chargeSucceeded: true,
//             type: "checkout_payment",
//             displayCurrency: userCurrency,
//         });

//         // 7. Send email to buyer (optional)
//         if (user.preferences?.emailUpdates) {
//             paymentCompletedEmail(user, auction).catch(console.error);
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Payment successful!",
//             data: {
//                 paymentIntent: {
//                     id: paymentIntent.id,
//                     status: paymentIntent.status,
//                 },
//                 auction: {
//                     id: auction._id,
//                     paymentStatus: auction.paymentStatus,
//                 },
//                 paymentDetails: {
//                     amountPaid: convertedTotalAmount,
//                     currency: userCurrency,
//                     amountPaidOriginal: totalAmountInBase,
//                     originalCurrency: auction.baseCurrency,
//                 },
//             },
//         });
//     } catch (error) {
//         console.error("Checkout payment error:", error);
//         return res.status(500).json({
//             success: false,
//             message: error.message || "Payment processing failed",
//         });
//     }
// };

// Convert to User's Currency Before Charging
export const createCheckoutPayment = async (req, res) => {
    try {
        const { auctionId } = req.body;
        const userId = req.user.id;
        const userCurrency = req.query.currency || 'EUR';
        const rates = getCachedRates();

        // Helper to convert amount using auction's base currency
        const convertAmount = (amount, auction) => {
            if (!amount) return 0;
            if (!rates) return amount;
            const base = auction.baseCurrency || 'EUR';
            const rate = rates[base]?.rates[userCurrency];
            if (!rate) return amount;
            return parseFloat((amount * rate).toFixed(2));
        };

        // 1. Find auction and verify winner
        const auction = await Auction.findById(auctionId)
            .populate("seller", "email username companyName firstName lastName")
            .populate(
                "winner",
                "email username companyName firstName lastName stripeCustomerId paymentMethodId cardLast4 cardBrand",
            );

        if (!auction) {
            return res
                .status(404)
                .json({ success: false, message: "Auction not found" });
        }

        if (auction.winner?._id.toString() !== userId) {
            return res
                .status(403)
                .json({ success: false, message: "Not authorized" });
        }

        if (auction.paymentStatus === "completed") {
            return res.status(400).json({ success: false, message: "Already paid" });
        }

        // 2. Get user's saved card
        const user = await User.findById(userId);
        if (!user.stripeCustomerId || !user.paymentMethodId) {
            return res.status(400).json({
                success: false,
                message: "No saved card found. Please add a card to your account.",
            });
        }

        const commissionSettings = await getCommissionSettings();

        // 3. Calculate total in base currency (original)
        const bidAmount = auction.finalPrice || auction.currentPrice;
        const commissionAmount = auction.bidderCommissionAmount || 0;
        // bidderCommissionAmount is 0 when bidder is not in appliesTo.
        const totalAmountInBase = bidAmount + commissionAmount;

        // Convert to user's currency before charging
        const totalAmountConverted = convertAmount(totalAmountInBase, auction);
        const amountToCharge = Math.round(totalAmountConverted * 100);
        const chargeCurrency = userCurrency === 'GBP' ? 'gbp' : 'eur';

        // 4. Create and confirm payment immediately
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountToCharge,
            currency: chargeCurrency,
            customer: user.stripeCustomerId,
            payment_method: user.paymentMethodId,
            description: `Payment for auction: ${auction.title}`,
            confirm: true,
            off_session: true,
            metadata: {
                auctionId: auctionId,
                userId: userId,
                baseCurrency: auction.baseCurrency,
                originalAmount: totalAmountInBase,
                originalCurrency: auction.baseCurrency,
                convertedAmount: totalAmountConverted,
                userCurrency: userCurrency,
            },
        });

        if (paymentIntent.status !== "succeeded") {
            return res.status(400).json({
                success: false,
                message: `Payment failed: ${paymentIntent.status}`,
            });
        }

        // 5. Update auction payment status
        auction.paymentStatus = "completed";
        auction.paymentMethod = "credit_card";
        auction.paymentDate = new Date();
        auction.transactionId = paymentIntent.id;
        await auction.save();

        // 6. Store payment record with converted amounts
        const convertedBidAmount = convertAmount(bidAmount, auction);
        const convertedCommissionAmount = convertAmount(commissionAmount, auction);

        const bidPayment = await BidPayment.create({
            auction: auctionId,
            bidder: userId,
            bidAmount: bidAmount,
            bidAmountConverted: convertedBidAmount,
            commissionAmount: commissionAmount,
            commissionAmountConverted: convertedCommissionAmount,
            totalAmount: totalAmountInBase,
            totalAmountConverted: totalAmountConverted,
            paymentIntentId: paymentIntent.id,
            status: "succeeded",
            chargeSucceeded: true,
            type: "checkout_payment",
            displayCurrency: userCurrency,
        });

        // 7. Send email to buyer (payment emails are always sent)
        paymentCompletedEmail(user, auction).catch(console.error);

        return res.status(200).json({
            success: true,
            message: "Payment successful!",
            data: {
                paymentIntent: {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                },
                auction: {
                    id: auction._id,
                    paymentStatus: auction.paymentStatus,
                },
                paymentDetails: {
                    amountPaid: totalAmountConverted,
                    currency: userCurrency,
                    amountPaidOriginal: totalAmountInBase,
                    originalCurrency: auction.baseCurrency,
                },
            },
        });
    } catch (error) {
        console.error("Checkout payment error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Payment processing failed",
        });
    }
};

export const createBankTransferPayment = async (req, res) => {
    try {
        const { auctionId } = req.body;
        const userId = req.user.id;
        const userCurrency = req.query.currency || 'EUR';
        const rates = getCachedRates();

        // Helper to convert amount using auction's base currency
        const convertAmount = (amount, auction) => {
            if (!amount) return 0;
            if (!rates) return amount;
            const base = auction.baseCurrency || 'EUR';
            const rate = rates[base]?.rates[userCurrency];
            if (!rate) return amount;
            return parseFloat((amount * rate).toFixed(2));
        };

        // Find the auction and verify winner
        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res
                .status(404)
                .json({ success: false, message: "Auction not found" });
        }

        if (auction.winner?._id.toString() !== userId) {
            return res
                .status(403)
                .json({ success: false, message: "Not authorized" });
        }

        if (
            auction.paymentStatus === "completed" ||
            auction.paymentStatus === "processing"
        ) {
            return res
                .status(400)
                .json({ success: false, message: "Payment already processed" });
        }

        const commissionSettings = await getCommissionSettings();

        // Calculate total in base currency
        const bidAmount = auction.finalPrice || auction.currentPrice;
        const commissionAmount = auction.bidderCommissionAmount || 0;
        const totalAmountInBase = bidAmount + commissionAmount;

        // Convert to user's currency for display
        const convertedBidAmount = convertAmount(bidAmount, auction);
        const convertedCommissionAmount = convertAmount(commissionAmount, auction);
        const convertedTotalAmount = convertAmount(totalAmountInBase, auction);

        // Update auction status to pending (bank transfer)
        auction.paymentStatus = "processing";
        auction.paymentMethod = "bank_transfer";
        await auction.save();

        // Create bid payment record with converted amounts
        await BidPayment.create({
            auction: auctionId,
            bidder: userId,
            bidAmount: bidAmount,
            bidAmountConverted: convertedBidAmount,
            commissionAmount: commissionAmount,
            commissionAmountConverted: convertedCommissionAmount,
            totalAmount: totalAmountInBase,
            totalAmountConverted: convertedTotalAmount,
            status: "pending",
            type: "bank_transfer_payment",
            paymentMethod: "bank_transfer",
            displayCurrency: userCurrency,
        });

        // Fetch admin's bank details from database
        const adminUser = await User.findOne({ userType: "admin" }).select(
            "payoutMethods firstName lastName email",
        );

        // Prepare admin bank details
        let bankDetails = null;
        if (adminUser?.payoutMethods?.bankTransfer) {
            bankDetails = {
                accountHolderName:
                    adminUser.payoutMethods.bankTransfer.accountHolderName,
                bankName: adminUser.payoutMethods.bankTransfer.bankName,
                accountNumber: adminUser.payoutMethods.bankTransfer.accountNumber,
                routingNumber: adminUser.payoutMethods.bankTransfer.routingNumber,
                iban: adminUser.payoutMethods.bankTransfer.iban,
                swiftCode: adminUser.payoutMethods.bankTransfer.swiftCode,
                bankAddress: adminUser.payoutMethods.bankTransfer.bankAddress,
                currency: adminUser.payoutMethods.bankTransfer.currency || userCurrency,
            };
        }

        // If no bank details found, return a generic message
        if (!bankDetails) {
            return res.status(400).json({
                success: false,
                message: "Admin bank details not configured. Please contact support.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Bank transfer selected. Please complete the transfer.",
            data: {
                bankDetails,
                auction: {
                    id: auction._id,
                    totalAmount: convertedTotalAmount,
                    totalAmountOriginal: totalAmountInBase,
                    title: auction.title,
                    currency: userCurrency,
                    baseCurrency: auction.baseCurrency,
                },
            },
        });
    } catch (error) {
        console.error("Bank transfer error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to process bank transfer",
        });
    }
};

/**
 * Confirm checkout payment (for saved card or new card)
 */
export const confirmCheckoutPayment = async (req, res) => {
    try {
        const { paymentIntentId, auctionId } = req.body;
        const userId = req.user.id;

        // Find the bid payment
        const bidPayment = await BidPayment.findOne({
            paymentIntentId,
            bidder: userId,
        });

        if (!bidPayment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found",
            });
        }

        // Confirm the payment intent
        const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);

        if (paymentIntent.status === "succeeded") {
            // Update auction
            const auction = await Auction.findById(auctionId);
            auction.paymentStatus = "completed";
            auction.paymentMethod = "credit_card";
            auction.paymentDate = new Date();
            auction.transactionId = paymentIntent.id;
            await auction.save();

            // Update bid payment
            bidPayment.status = "succeeded";
            bidPayment.chargeSucceeded = true;
            await bidPayment.save();

            return res.status(200).json({
                success: true,
                message: "Payment successful!",
                data: {
                    paymentIntent: {
                        id: paymentIntent.id,
                        status: paymentIntent.status,
                    },
                    auction: {
                        id: auction._id,
                        paymentStatus: auction.paymentStatus,
                    },
                },
            });
        } else {
            return res.status(400).json({
                success: false,
                message: `Payment status: ${paymentIntent.status}`,
            });
        }
    } catch (error) {
        console.error("Confirm payment error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Payment confirmation failed",
        });
    }
};

/**
 * @desc    Seller pays commission when buyer paid manually (bank transfer)
 * @route   POST /api/v1/payments/pay-commission
 * @access  Private (Seller only)
 */
export const paySellerCommission = async (req, res) => {
    try {
        const { auctionId } = req.body;
        const sellerId = req.user.id;
        const userCurrency = req.query.currency || 'EUR';
        const rates = getCachedRates();

        // Helper to convert amount using auction's base currency
        const convertAmount = (amount, auction) => {
            if (!amount) return 0;
            if (!rates) return amount;
            const base = auction.baseCurrency || 'EUR';
            const rate = rates[base]?.rates[userCurrency];
            if (!rate) return amount;
            return parseFloat((amount * rate).toFixed(2));
        };

        // 1. Find auction and verify seller
        const auction = await Auction.findById(auctionId).populate(
            "seller",
            "stripeCustomerId paymentMethodId email username companyName"
        );

        if (!auction) {
            return res.status(404).json({ success: false, message: "Auction not found" });
        }

        // Must be seller
        if (auction.seller._id.toString() !== sellerId) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        // Must be sold, bank_transfer method, and payment not completed
        if (auction.status !== "sold") {
            return res.status(400).json({ success: false, message: "Auction is not sold" });
        }
        if (auction.paymentMethod !== "bank_transfer") {
            return res.status(400).json({ success: false, message: "Payment method is not bank transfer" });
        }
        if (auction.paymentStatus === "completed") {
            return res.status(400).json({ success: false, message: "Commission already paid" });
        }

        // 2. Get seller commission amount (already includes featured premium if applicable)
        const commissionAmount = auction.sellerCommissionAmount || 0;
        if (commissionAmount <= 0) {
            return res.status(400).json({ success: false, message: "No commission due" });
        }

        // Convert commission amount for display
        const convertedCommissionAmount = convertAmount(commissionAmount, auction);

        // 3. Get seller's saved card info
        const seller = await User.findById(sellerId);
        if (!seller.stripeCustomerId || !seller.paymentMethodId) {
            return res.status(400).json({
                success: false,
                message: "No saved card found. Please add a card to your account.",
            });
        }

        // 4. Charge the seller using Stripe (charge in auction's base currency)
        const amountToCharge = Math.round(commissionAmount * 100);
        const chargeCurrency = auction.baseCurrency === 'GBP' ? 'gbp' : 'eur';

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountToCharge,
            currency: chargeCurrency,
            customer: seller.stripeCustomerId,
            payment_method: seller.paymentMethodId,
            description: `Commission payment for auction: ${auction.title}`,
            confirm: true,
            off_session: true,
            metadata: {
                auctionId: auctionId,
                sellerId: sellerId,
                type: "seller_commission",
                baseCurrency: auction.baseCurrency,
                originalAmount: commissionAmount,
                userCurrency: userCurrency,
                convertedAmount: convertedCommissionAmount,
            },
        });

        if (paymentIntent.status !== "succeeded") {
            return res.status(400).json({
                success: false,
                message: `Payment failed: ${paymentIntent.status}`,
            });
        }

        // 5. Update auction payment status
        auction.paymentStatus = "completed";
        auction.paymentDate = new Date();
        auction.transactionId = paymentIntent.id;
        // Keep paymentMethod as "bank_transfer" (the original method used by buyer)
        await auction.save();

        // 6. Create BidPayment record for this commission with converted amounts
        await BidPayment.create({
            auction: auctionId,
            bidder: sellerId, // seller is paying commission
            bidAmount: 0, // not applicable
            commissionAmount: commissionAmount,
            commissionAmountConverted: convertedCommissionAmount,
            totalAmount: commissionAmount,
            totalAmountConverted: convertedCommissionAmount,
            paymentIntentId: paymentIntent.id,
            status: "succeeded",
            chargeSucceeded: true,
            type: "seller_commission_payment",
            paymentMethod: "credit_card",
            displayCurrency: userCurrency,
        });

        // 7. Send confirmation email (optional)
        // if (seller.preferences?.emailUpdates) {
        //   // You may create a new email template or reuse existing
        //   paymentCompletedEmail(seller, auction).catch(console.error);
        // }

        return res.status(200).json({
            success: true,
            message: "Commission paid successfully!",
            data: {
                paymentIntent: {
                    id: paymentIntent.id,
                    status: paymentIntent.status
                },
                auction: {
                    id: auction._id,
                    paymentStatus: auction.paymentStatus
                },
                paymentDetails: {
                    commissionPaid: convertedCommissionAmount,
                    commissionPaidOriginal: commissionAmount,
                    currency: userCurrency,
                    originalCurrency: auction.baseCurrency,
                },
            },
        });
    } catch (error) {
        console.error("Seller commission payment error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to process commission payment",
        });
    }
};

/**
 * @desc Confirm a listing-extras payment from the client (fallback for slow webhooks)
 * @route POST /api/v1/payments/confirm-listing-extras
 * @access Private (seller)
 */
export const confirmListingExtrasPayment = async (req, res) => {
    try {
        const { paymentIntentId, saveCard } = req.body;
        const userId = req.user.id;

        if (!paymentIntentId) {
            return res
                .status(400)
                .json({ success: false, message: "paymentIntentId is required" });
        }

        const auction = await Auction.findOne({
            "extrasPayment.paymentIntentId": paymentIntentId,
            seller: userId,
        });

        if (!auction) {
            return res
                .status(404)
                .json({ success: false, message: "Listing payment not found" });
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== "succeeded") {
            return res.status(400).json({
                success: false,
                message: `Payment not yet succeeded (status: ${paymentIntent.status})`,
            });
        }

        // ─── 1. Mark extras paid (idempotent — safe if webhook beat us) ───
        if (auction.extrasPayment.status !== "completed") {
            auction.extrasPayment.status = "completed";
            auction.extrasPayment.paidAt = new Date();
            if (
                (auction.auctionType === "buy_now" ||
                    auction.auctionType === "giveaway") &&
                auction.status === "draft"
            ) {
                auction.status = "active";
            }
            await auction.save();
        }

        // ─── 2. Save the card to the seller's account (independent of #1) ───
        if (saveCard && paymentIntent.payment_method) {
            try {
                const pm = await stripe.paymentMethods.retrieve(
                    paymentIntent.payment_method
                );

                if (pm?.card) {
                    const user = await User.findById(userId);
                    if (user) {
                        user.paymentMethodId = pm.id;
                        user.cardLast4 = pm.card.last4;
                        user.cardBrand = pm.card.brand;
                        user.cardExpMonth = pm.card.exp_month;
                        user.cardExpYear = pm.card.exp_year;
                        user.isPaymentVerified = true;
                        await user.save();

                        if (user.stripeCustomerId) {
                            await stripe.customers.update(user.stripeCustomerId, {
                                invoice_settings: { default_payment_method: pm.id },
                            });
                        }
                    }
                }
            } catch (err) {
                // Extras are already paid — don't fail the request just
                // because we couldn't save the card. Seller can re-add
                // via Billing.
                console.error("Save-card after listing extras failed:", err);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Payment confirmed",
            data: {
                auctionId: auction._id,
                extrasPaid: true,
                cardSaved: !!saveCard,
            },
        });
    } catch (error) {
        console.error("Confirm listing extras error:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
};