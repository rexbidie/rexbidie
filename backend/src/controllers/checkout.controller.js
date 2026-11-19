import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { getCachedRates } from "../routes/currency.route.js";
import {
    getManualPaymentFlags,
    isManualPaymentRequired,
} from "../utils/manualPayment.js";

const convertPrice = (auction, targetCurrency, priceField) => {
    const rates = getCachedRates();
    if (!rates) return auction[priceField]; // fallback
    const base = auction.baseCurrency;
    const rate = rates[base].rates[targetCurrency];
    if (!rate) return auction[priceField];
    return auction[priceField] * rate;
};

/**
 * Get checkout data for a won auction
 * Only accessible by the auction winner
 * Returns auction details, seller info, and bidder address
 */
export const getCheckoutData = async (req, res) => {
    try {
        const { auctionId } = req.params;
        const userId = req.user._id;
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

        // Find the auction and populate necessary fields
        const auction = await Auction.findById(auctionId)
            .populate(
                "seller",
                "firstName lastName username companyName email phone address countryName countryCode payoutMethods",
            )
            .populate(
                "winner",
                "firstName lastName username companyName email phone address countryName countryCode stripeCustomerId paymentMethodId cardLast4 cardBrand cardExpMonth cardExpYear isPaymentVerified",
            );

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Check if the user is the winner
        if (
            !auction.winner ||
            auction.winner._id.toString() !== userId.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to checkout this auction",
            });
        }

        // Check if auction is sold
        if (auction.status !== "sold" && auction.status !== "sold_buy_now") {
            return res.status(400).json({
                success: false,
                message: "This auction is not in sold status",
            });
        }

        // Check if payment is still pending
        if (
            auction.paymentStatus === "completed" ||
            auction.paymentStatus === "processing"
        ) {
            return res.status(400).json({
                success: false,
                message: `Payment for this auction is already ${auction.paymentStatus}`,
            });
        }

        // ─── Manual payment gate (≥ €1,000, fail-safe on rate error) ───
        if (isManualPaymentRequired(auction)) {
            return res.status(403).json({
                success: false,
                errorCode: "MANUAL_PAYMENT_REQUIRED",
                message:
                    "This item requires manual payment arrangement. Our admin team will be in touch shortly with your invoice and payment link.",
                data: getManualPaymentFlags(auction),
            });
        }

        // Get seller data (already populated)
        const seller = auction.seller;

        // Get bidder/winner data (already populated)
        const bidder = auction.winner;

        const hasSavedCard = !!(
            bidder?.stripeCustomerId && bidder?.paymentMethodId
        );

        // Format seller address
        const sellerAddress = seller.address
            ? {
                name: `${seller.firstName} ${seller.lastName}`,
                company: seller.businessName || "",
                line1: seller.address.line1 || "",
                line2: seller.address.line2 || "",
                county: seller.address.county || "",
                state: seller.address.state || "",
                zip: seller.address.postCode || "",
                country: seller.countryCode || "US",
                phone: seller.phone || "",
                email: seller.email || "",
            }
            : null;

        // Format bidder address
        const bidderAddress = bidder.address
            ? {
                name: `${bidder.firstName} ${bidder.lastName}`,
                company: "",
                line1: bidder.address.line1 || "",
                line2: bidder.address.line2 || "",
                county: bidder.address.county || "",
                state: bidder.address.state || "",
                zip: bidder.address.postCode || "",
                country: bidder.countryCode || "US",
                phone: bidder.phone || "",
                email: bidder.email || "",
            }
            : null;

        // Convert auction prices — the buyer pays finalPrice + bidder commission
        const convertedFinalPrice = convertAmount(auction.finalPrice || auction.currentPrice, auction);
        const convertedBidderCommission = convertAmount(auction.bidderCommissionAmount || 0, auction);
        const convertedSellerCommission = convertAmount(auction.sellerCommissionAmount || 0, auction);
        // VAT, worked out as on the Sales page (and charged at checkout).
        const { checkoutFiguresFor } = await import("../services/saleService.js");
        const figures = await checkoutFiguresFor(auction._id).catch(() => null);
        const convertedVat = convertAmount(figures?.vatAmount || 0, auction);
        const convertedTotalAmount = figures ? convertAmount(figures.total, auction) : convertedFinalPrice + convertedBidderCommission;


        // Prepare auction data for response with converted amounts
        const auctionData = {
            _id: auction._id,
            title: auction.title,
            description: auction.description,
            // Original values
            finalPriceOriginal: auction.finalPrice || 0,
            commissionAmountOriginal: auction.bidderCommissionAmount || 0,
            sellerCommissionAmountOriginal: auction.sellerCommissionAmount || 0,
            // Converted values
            finalPrice: convertedFinalPrice,
            // `commissionAmount` is the buyer's side — kept for frontend compat
            commissionAmount: convertedBidderCommission,
            bidderCommissionAmount: convertedBidderCommission,
            sellerCommissionAmount: convertedSellerCommission,
            auctionType: auction.auctionType,
            status: auction.status,
            paymentStatus: auction.paymentStatus,
            vatIncluded: auction.vatIncluded,
            vatAmount: convertedVat,
            vatRate: figures?.vatRate || 0,
            vatTreatment: figures?.vatTreatment || "not_applicable",
            vatReviewRequired: !!figures?.reviewRequired,
            totalAmount: convertedTotalAmount,
            paymentCollectionPreference: auction.paymentCollectionPreference,
            baseCurrency: auction.baseCurrency,
            displayCurrency: userCurrency,
            photos: auction.photos?.length > 0 ? [auction.photos[0]] : [],
            endDate: auction.endDate,
            createdAt: auction.createdAt,
        };

        // Get admin's bank details for bank transfer payments
        const adminUser = await User.findOne({ userType: "admin" }).select(
            "payoutMethods firstName lastName email",
        );

        // Prepare admin bank details if available
        const adminBankDetails = adminUser?.payoutMethods?.bankTransfer
            ? {
                accountHolderName:
                    adminUser.payoutMethods.bankTransfer.accountHolderName,
                bankName: adminUser.payoutMethods.bankTransfer.bankName,
                accountNumber: adminUser.payoutMethods.bankTransfer.accountNumber,
                routingNumber: adminUser.payoutMethods.bankTransfer.routingNumber,
                iban: adminUser.payoutMethods.bankTransfer.iban,
                swiftCode: adminUser.payoutMethods.bankTransfer.swiftCode,
                bankAddress: adminUser.payoutMethods.bankTransfer.bankAddress,
                currency: adminUser.payoutMethods.bankTransfer.currency || "EUR",
            }
            : null;

        // Prepare seller data for response
        const sellerData = {
            _id: seller._id,
            firstName: seller.firstName,
            lastName: seller.lastName,
            username: seller.username || '',
            companyName: seller.companyName,
            email: seller.email,
            phone: seller.phone,
            memberSince: seller.createdAt,
            address: sellerAddress,
            payoutMethods: seller.payoutMethods
                ? {
                    bankTransfer: seller.payoutMethods.bankTransfer
                        ? {
                            accountHolderName:
                                seller.payoutMethods.bankTransfer.accountHolderName,
                            bankName: seller.payoutMethods.bankTransfer.bankName,
                            accountNumber:
                                seller.payoutMethods.bankTransfer.accountNumber,
                            routingNumber:
                                seller.payoutMethods.bankTransfer.routingNumber,
                            iban: seller.payoutMethods.bankTransfer.iban,
                            swiftCode: seller.payoutMethods.bankTransfer.swiftCode,
                            bankAddress: seller.payoutMethods.bankTransfer.bankAddress,
                            currency: seller.payoutMethods.bankTransfer.currency || "EUR",
                        }
                        : null,
                }
                : null,
        };

        // Prepare bidder address data for response
        const bidderAddressData = bidderAddress;

        return res.status(200).json({
            success: true,
            message: "Checkout data retrieved successfully",
            data: {
                auction: {
                    ...auctionData,
                    ...getManualPaymentFlags(auction),
                },
                seller: sellerData,
                bidderAddress: bidderAddressData,
                paymentInfo: {
                    hasSavedCard,
                    savedCard: hasSavedCard
                        ? {
                            last4: bidder?.cardLast4,
                            brand: bidder?.cardBrand,
                            expiryMonth: bidder?.cardExpMonth,
                            expiryYear: bidder?.cardExpYear,
                            isVerified: bidder?.isPaymentVerified,
                        }
                        : null,
                },
                totals: {
                    winningBid: convertedFinalPrice,
                    winningBidOriginal: auction.finalPrice || 0,
                    commission: convertedBidderCommission,
                    commissionOriginal: auction.bidderCommissionAmount || 0,
                    subtotal: parseFloat(convertedTotalAmount.toFixed(2)),
                    subtotalOriginal:
                        (auction.finalPrice || 0) +
                        (auction.bidderCommissionAmount || 0),
                    displayCurrency: userCurrency,
                },
                adminBankDetails: adminBankDetails,
            },
        });
    } catch (error) {
        console.error("Get checkout data error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error while fetching checkout data",
            error: error.message,
        });
    }
};

/**
 * Verify checkout access before creating payment
 * This can be used as a middleware
 */
export const verifyCheckoutAccess = async (req, res, next) => {
    try {
        const { auctionId } = req.params;
        const userId = req.user._id;

        const auction = await Auction.findById(auctionId);

        if (!auction) {
            return res.status(404).json({
                success: false,
                message: "Auction not found",
            });
        }

        // Check if user is winner
        if (!auction.winner || auction.winner.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to checkout this auction",
            });
        }

        // Check auction status
        if (auction.status !== "sold" && auction.status !== "sold_buy_now") {
            return res.status(400).json({
                success: false,
                message: "This auction is not in sold status",
            });
        }

        // Check payment status
        if (auction.paymentStatus !== "pending") {
            return res.status(400).json({
                success: false,
                message: `Payment for this auction is already ${auction.paymentStatus}`,
            });
        }

        // ─── Manual payment gate ───
        if (isManualPaymentRequired(auction)) {
            return res.status(403).json({
                success: false,
                errorCode: "MANUAL_PAYMENT_REQUIRED",
                message:
                    "This item requires manual payment arrangement. Our admin team will be in touch shortly with your invoice and payment link.",
                data: getManualPaymentFlags(auction),
            });
        }

        // Attach auction to request for next middleware
        req.checkoutAuction = auction;
        next();
    } catch (error) {
        console.error("Verify checkout access error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error while verifying checkout access",
        });
    }
};