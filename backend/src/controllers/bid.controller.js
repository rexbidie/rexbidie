import mongoose from 'mongoose';
import { StripeService } from '../services/stripeService.js';
import User from '../models/user.model.js';
import Auction from '../models/auction.model.js';
import { getCachedRates } from '../routes/currency.route.js';
import { retractBids } from '../services/bidRetractionService.js';

const convertPrice = (auction, targetCurrency, priceField) => {
    const rates = getCachedRates();
    if (!rates) return auction[priceField]; // fallback
    const base = auction.baseCurrency;
    const rate = rates[base].rates[targetCurrency];
    if (!rate) return auction[priceField];
    return auction[priceField] * rate;
};

export const chargeWinningBidder = async (req, res) => {
    try {
        const { userId, amount, auctionId, description } = req.body;

        // Find user and verify they have payment method
        const user = await User.findById(userId);
        if (!user || !user.stripeCustomerId || !user.isPaymentVerified) {
            return res.status(400).json({
                success: false,
                message: 'User payment method not available'
            });
        }

        // Charge the customer automatically
        const chargeResult = await StripeService.chargeCustomer(
            user.stripeCustomerId,
            amount,
            description || `Winning bid for auction ${auctionId}`
        );

        if (chargeResult.success) {
            // Update your database - mark auction as paid, etc.
            await Auction.findByIdAndUpdate(auctionId, {
                status: 'paid',
                paymentIntentId: chargeResult.paymentIntent.id,
                paidAt: new Date()
            });

            return res.status(200).json({
                success: true,
                message: 'Payment processed successfully',
                data: {
                    paymentIntentId: chargeResult.paymentIntent.id,
                    amount: amount
                }
            });
        }

    } catch (error) {
        console.error('Charge error:', error);
        return res.status(400).json({
            success: false,
            message: `Payment failed: ${error.message}`
        });
    }
};

// Optional: Pre-authorize bid amount when user places bid
export const authorizeBidAmount = async (req, res) => {
    try {
        const { userId, amount, auctionId } = req.body;

        const user = await User.findById(userId);
        if (!user || !user.stripeCustomerId) {
            return res.status(400).json({
                success: false,
                message: 'User payment method not available'
            });
        }

        // Create payment intent (but don't capture yet)
        const paymentIntent = await StripeService.createBidPaymentIntent(
            user.stripeCustomerId,
            amount,
            `Bid authorization for auction ${auctionId}`
        );

        return res.status(200).json({
            success: true,
            message: 'Bid authorized',
            data: {
                paymentIntentId: paymentIntent.id,
                clientSecret: paymentIntent.client_secret
            }
        });

    } catch (error) {
        console.error('Bid authorization error:', error);
        return res.status(400).json({
            success: false,
            message: `Bid authorization failed: ${error.message}`
        });
    }
};

// Test charge controller (create a temporary route for testing)
export const testCharge = async (req, res) => {
    try {
        const userId = '68d3c193ff8daa10eed9f0f5';
        const amount = 10.00; // $10 test charge

        const user = await User.findById(userId);

        const chargeResult = await StripeService.chargeCustomer(
            user.stripeCustomerId,
            amount,
            'Test auction win charge'
        );

        res.json({ success: true, chargeResult });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// Get user's bidding activity
export const getMyBids = async (req, res) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 12, status, search, sortBy = 'recent' } = req.query;
        const userCurrency = req.query.currency || 'EUR';
        const rates = getCachedRates();

        // Build base query for all user bids
        const baseQuery = { 'bids.bidder': userId };
        const total = await Auction.countDocuments(baseQuery);

        // Get auctions without pagination for stats (or keep as is)
        const auctions = await Auction.find(baseQuery)
            .populate('seller', 'username companyName firstName lastName')
            .populate('currentBidder', 'username companyName firstName')
            .populate('winner', 'username companyName firstName lastName')
            .sort({ 'bids.timestamp': -1 });

        // ------------------------- STATISTICS (with conversion) -------------------------
        let totalWonAmountConverted = 0;
        let totalWonCount = 0;
        let totalLostCount = 0;
        let totalWinningCount = 0;
        let totalOutbidCount = 0;

        for (const auction of auctions) {
            const base = auction.baseCurrency;
            const rate = (rates && rates[base]?.rates[userCurrency]) || 1;
            const userBids = auction.bids.filter(bid => bid.bidder.toString() === userId.toString());
            const latestUserBid = userBids.reduce((latest, bid) => bid.timestamp > latest.timestamp ? bid : latest, userBids[0]);
            if (!latestUserBid) continue;

            // Determine bid status
            let bidStatus = 'outbid';
            if (auction.status === 'sold' || auction.status === 'ended') {
                if (auction.winner && auction.winner._id.toString() === userId.toString()) {
                    bidStatus = 'won';
                    totalWonCount++;
                    // Convert finalPrice to user's currency
                    const convertedFinal = (auction.finalPrice || 0) * rate;
                    totalWonAmountConverted += convertedFinal;
                } else {
                    bidStatus = 'lost';
                    totalLostCount++;
                }
            } else if (auction.status === 'active') {
                if (auction.currentBidder && auction.currentBidder._id.toString() === userId.toString()) {
                    bidStatus = 'winning';
                    totalWinningCount++;
                } else {
                    bidStatus = 'outbid';
                    totalOutbidCount++;
                }
            } else if (auction.status === 'reserve_not_met') {
                bidStatus = 'lost';
                totalLostCount++;
            }
        }

        const totalBids = auctions.length;
        const totalActiveBids = totalWinningCount + totalOutbidCount;
        const completedAuctions = totalWonCount + totalLostCount;
        const successRate = completedAuctions > 0 ? Math.round((totalWonCount / completedAuctions) * 100) : 0;
        const avgWinAmount = totalWonCount > 0 ? Math.round(totalWonAmountConverted / totalWonCount) : 0;

        // ------------------------- TRANSFORM BIDS WITH CONVERSION -------------------------
        const transformedBids = auctions.map(auction => {
            const base = auction.baseCurrency;
            const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

            const userBids = auction.bids.filter(bid => bid.bidder.toString() === userId.toString());
            const latestUserBid = userBids.reduce((latest, bid) => bid.timestamp > latest.timestamp ? bid : latest, userBids[0]);

            // Determine bid status (same logic as above)
            let status = 'outbid';
            if (auction.status === 'sold' || auction.status === 'ended') {
                if (auction.winner && auction.winner._id.toString() === userId.toString()) status = 'won';
                else status = 'lost';
            } else if (auction.status === 'active') {
                if (auction.currentBidder && auction.currentBidder._id.toString() === userId.toString()) status = 'winning';
                else status = 'outbid';
            } else if (auction.status === 'reserve_not_met') {
                status = 'lost';
            }

            // ----- Post-auction eligibility (reserve_not_met) -----
            let isTopBidder = false;
            let topBidderRank = null;
            let canMakePostAuctionOffer = false;
            let postAuctionOffer = null;

            if (auction.status === "reserve_not_met") {
                const highestByBidder = new Map();
                for (const b of auction.bids) {
                    const id = b.bidder?.toString();
                    if (!id) continue;
                    const prev = highestByBidder.get(id);
                    if (!prev || b.amount > prev.amount) {
                        highestByBidder.set(id, { bidder: b.bidder, amount: b.amount });
                    }
                }
                const topBidders = Array.from(highestByBidder.values())
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, 2);

                const myIndex = topBidders.findIndex(
                    (b) => b.bidder.toString() === userId.toString(),
                );

                if (myIndex >= 0) {
                    isTopBidder = true;
                    topBidderRank = myIndex + 1;

                    const myOffers = (auction.offers || [])
                        .filter((o) => o.buyer?.toString() === userId.toString())
                        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                    const pendingOffer = myOffers.find((o) => o.status === "pending");
                    const latestOffer = myOffers[0];

                    if (pendingOffer) {
                        postAuctionOffer = {
                            _id: pendingOffer._id,
                            amount: pendingOffer.amount,
                            convertedAmount: parseFloat((pendingOffer.amount * rate).toFixed(2)),
                            status: "pending",
                        };
                        canMakePostAuctionOffer = false;
                    } else if (latestOffer && latestOffer.isPostAuction) {
                        postAuctionOffer = {
                            _id: latestOffer._id,
                            amount: latestOffer.amount,
                            convertedAmount: parseFloat((latestOffer.amount * rate).toFixed(2)),
                            status: latestOffer.status,
                        };
                        canMakePostAuctionOffer = ["rejected", "expired", "withdrawn"].includes(
                            latestOffer.status,
                        );
                    } else {
                        canMakePostAuctionOffer = true;
                    }
                }
            }

            // Convert all price fields
            const myBidConverted = latestUserBid.amount * rate;
            const currentPriceConverted = auction.currentPrice * rate;
            const startPriceConverted = auction.startPrice * rate;
            const bidIncrementConverted = (auction.bidIncrement || 0) * rate;
            let nextMinBidConverted = null;
            if (auction.status === 'active') {
                nextMinBidConverted = (auction.currentPrice + (auction.bidIncrement || 0)) * rate;
            }

            return {
                id: auction._id.toString(),
                auctionId: `AU${auction._id.toString().slice(-6).toUpperCase()}`,
                title: auction.title,
                description: auction.description,
                category: auction.categories?.[0] || '',
                // Original amounts (in base currency)
                myBidAmountOriginal: latestUserBid.amount,
                currentBidOriginal: auction.currentPrice,
                startingBidOriginal: auction.startPrice,
                bidIncrementOriginal: auction.bidIncrement,
                nextMinBidOriginal: nextMinBidConverted ? (auction.currentPrice + auction.bidIncrement) : null,
                // Converted amounts
                myBidAmount: parseFloat(myBidConverted.toFixed(2)),
                currentBid: parseFloat(currentPriceConverted.toFixed(2)),
                startingBid: parseFloat(startPriceConverted.toFixed(2)),
                bidIncrement: parseFloat(bidIncrementConverted.toFixed(2)),
                nextMinBid: nextMinBidConverted ? parseFloat(nextMinBidConverted.toFixed(2)) : null,
                // Status and metadata
                status: status,
                bidTime: latestUserBid.timestamp,
                endTime: auction.endDate,
                bids: auction.bidCount,
                watchers: auction.watchlistCount,
                image: auction.photos.length > 0 ? auction.photos[0].url : '/api/placeholder/400/300',
                location: auction.location,
                sellerRating: 4.5, // placeholder
                timeLeft: calculateTimeLeft(auction.endDate),
                auctionStatus: auction.status,
                winnerInfo: auction.winner ? {
                    id: auction.winner._id.toString(),
                    name: `${auction.winner.firstName} ${auction.winner.lastName}`.trim()
                } : null,
                currentBidderInfo: auction.currentBidder ? {
                    id: auction.currentBidder._id.toString(),
                    name: auction.currentBidder.firstName
                } : null,
                // Currency info
                displayCurrency: userCurrency,
                baseCurrency: auction.baseCurrency,
                reserveNotMet: auction.status === "reserve_not_met",
                reservePriceOriginal: auction.reservePrice,
                reservePrice:
                    auction.reservePrice != null
                        ? parseFloat((auction.reservePrice * rate).toFixed(2))
                        : null,
                isTopBidder,
                topBidderRank,
                canMakePostAuctionOffer,
                postAuctionOffer,
            };
        });

        // Apply filtering and sorting (same as before, but using converted amounts where needed)
        let filteredBids = transformedBids.filter(bid => {
            const matchesStatus = !status || status === 'all' || bid.status === status;
            const matchesSearch = !search ||
                bid.title.toLowerCase().includes(search.toLowerCase()) ||
                bid.description.toLowerCase().includes(search.toLowerCase());
            return matchesStatus && matchesSearch;
        });

        filteredBids.sort((a, b) => {
            switch (sortBy) {
                case 'recent': return new Date(b.bidTime) - new Date(a.bidTime);
                case 'ending_soon': return new Date(a.endTime) - new Date(b.endTime);
                case 'bid_amount': return b.myBidAmount - a.myBidAmount;
                case 'auction_value': return b.currentBid - a.currentBid;
                default: return new Date(b.bidTime) - new Date(a.bidTime);
            }
        });

        // Paginate
        const start = (parseInt(page) - 1) * parseInt(limit);
        const paginatedBids = filteredBids.slice(start, start + parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                bids: paginatedBids,
                statistics: {
                    totalBids,
                    totalActiveBids,
                    totalWinning: totalWinningCount,
                    totalWon: totalWonCount,
                    totalLost: totalLostCount,
                    totalWonAmount: parseFloat(totalWonAmountConverted.toFixed(2)),   // now converted to user's currency
                    successRate,
                    avgWinAmount: parseFloat(avgWinAmount.toFixed(2))
                },
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(filteredBids.length / limit),
                    totalBids: total
                }
            }
        });

    } catch (error) {
        console.error('Get my bids error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching bids'
        });
    }
};

// Get bid statistics for dashboard
export const getBidStats = async (req, res) => {
    try {
        const userId = req.user._id;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Total bids placed
        const totalBidsResult = await Auction.aggregate([
            { $match: { 'bids.bidder': userId } },
            { $unwind: '$bids' },
            { $match: { 'bids.bidder': userId } },
            { $group: { _id: null, total: { $sum: 1 } } }
        ]);

        // Active bids (bids on active auctions)
        const activeBids = await Auction.countDocuments({
            'bids.bidder': userId,
            status: 'active',
            endDate: { $gt: new Date() }
        });

        // Winning bids
        const winningBids = await Auction.countDocuments({
            'bids.bidder': userId,
            'currentBidder': userId,
            status: 'active',
            endDate: { $gt: new Date() }
        });

        // Won auctions
        const wonAuctions = await Auction.countDocuments({
            winner: userId,
            status: 'sold'
        });

        // Recent bidding activity (last 30 days)
        const recentActivity = await Auction.aggregate([
            {
                $match: {
                    'bids.bidder': userId,
                    'bids.timestamp': { $gte: thirtyDaysAgo }
                }
            },
            { $unwind: '$bids' },
            {
                $match: {
                    'bids.bidder': userId,
                    'bids.timestamp': { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$bids.timestamp" }
                    },
                    bidsCount: { $sum: 1 },
                    totalAmount: { $sum: "$bids.amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const totalBids = totalBidsResult[0]?.total || 0;
        const successRate = totalBids > 0 ? Math.round((wonAuctions / totalBids) * 100) : 0;

        res.status(200).json({
            success: true,
            data: {
                totalBids,
                activeBids,
                winningBids,
                wonAuctions,
                successRate,
                recentActivity,
                lastUpdated: new Date()
            }
        });

    } catch (error) {
        console.error('Get bid stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching bid statistics'
        });
    }
};

// Helper function to calculate time left
const calculateTimeLeft = (endDate) => {
    const now = new Date();
    const end = new Date(endDate);
    const diffMs = end - now;

    if (diffMs <= 0) return 'Ended';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

// Get detailed bid history for seller's auctions
export const getSellerBidHistory = async (req, res) => {
    try {
        const sellerId = req.user._id;
        const { auctionId, page = 1, limit = 50 } = req.query;
        const userCurrency = req.query.currency || 'EUR';
        const rates = getCachedRates();

        let filter = { seller: sellerId };

        // Filter by specific auction if provided
        if (auctionId) {
            filter._id = auctionId;
        }

        const auctions = await Auction.find(filter)
            .populate('bids.bidder', 'username companyName firstName lastName email company')
            .populate('winner', 'username companyName firstName lastName email company')
            .sort({ endDate: -1 });

        // Convert each auction and its bids
        const convertedAuctions = auctions.map(auction => {
            const auctionObj = auction.toObject();
            const base = auction.baseCurrency;
            const rate = (rates && rates[base]?.rates[userCurrency]) || 1;

            // Helper to convert a single price field
            const convert = (value) => (value !== null && value !== undefined) ? parseFloat((value * rate).toFixed(2)) : null;

            // Convert auction prices
            const convertedStartPrice = convert(auction.startPrice);
            const convertedCurrentPrice = convert(auction.currentPrice);
            const convertedFinalPrice = convert(auction.finalPrice);
            const convertedReservePrice = convert(auction.reservePrice);
            const convertedBidIncrement = convert(auction.bidIncrement);
            const convertedBuyNowPrice = convert(auction.buyNowPrice);

            // Convert all bids in this auction
            const convertedBids = auction.bids.map(bid => ({
                ...bid.toObject(),
                convertedAmount: convert(bid.amount),
                originalAmount: bid.amount,
                originalCurrency: base,
                bidder: bid.bidder,
                isProxyBid: bid.isProxyBid || false,
            }));

            // Calculate bid statistics for this auction
            const totalBids = auction.bids.length;
            const highestBid = auction.bids.length > 0
                ? Math.max(...auction.bids.map(b => b.amount))
                : 0;
            const convertedHighestBid = convert(highestBid);

            // Get unique bidders count
            const uniqueBidders = new Set(auction.bids.map(bid => bid.bidder?._id?.toString())).size;

            // Check if reserve was met
            const reserveMet = auction.reservePrice ? auction.currentPrice >= auction.reservePrice : true;

            return {
                ...auctionObj,
                // Original values
                startPriceOriginal: auction.startPrice,
                currentPriceOriginal: auction.currentPrice,
                finalPriceOriginal: auction.finalPrice,
                reservePriceOriginal: auction.reservePrice,
                bidIncrementOriginal: auction.bidIncrement,
                buyNowPriceOriginal: auction.buyNowPrice,
                // Converted values
                convertedStartPrice,
                convertedCurrentPrice,
                convertedFinalPrice,
                convertedReservePrice,
                convertedBidIncrement,
                convertedBuyNowPrice,
                displayCurrency: userCurrency,
                // Converted bids array
                bids: convertedBids,
                // Bid statistics (converted)
                bidStats: {
                    totalBids,
                    uniqueBidders,
                    highestBid: convertedHighestBid,
                    highestBidOriginal: highestBid,
                    averageBid: totalBids > 0 ? convert(auction.bids.reduce((sum, b) => sum + b.amount, 0) / totalBids) : null,
                    reserveMet
                },
                winner: auction.winner,
                endDate: auction.endDate,
                status: auction.status,
                title: auction.title
            };
        });

        // Pagination (after conversion)
        const start = (parseInt(page) - 1) * parseInt(limit);
        const paginatedAuctions = convertedAuctions.slice(start, start + parseInt(limit));
        const total = convertedAuctions.length;

        // Calculate overall seller statistics
        let totalWonAmount = 0;
        let totalSoldCount = 0;
        let totalBidsReceived = 0;

        for (const auction of convertedAuctions) {
            if (auction.status === 'sold' && auction.winner) {
                totalWonAmount += auction.convertedFinalPrice || auction.convertedCurrentPrice || 0;
                totalSoldCount++;
            }
            totalBidsReceived += auction.bidStats.totalBids;
        }

        res.status(200).json({
            success: true,
            data: {
                auctions: paginatedAuctions,
                statistics: {
                    totalAuctions: total,
                    totalSold: totalSoldCount,
                    totalRevenue: parseFloat(totalWonAmount.toFixed(2)),
                    averageSalePrice: totalSoldCount > 0 ? parseFloat((totalWonAmount / totalSoldCount).toFixed(2)) : 0,
                    totalBidsReceived,
                    averageBidsPerAuction: total > 0 ? Math.round(totalBidsReceived / total) : 0
                },
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / limit),
                    totalAuctions: total,
                    hasNextPage: start + paginatedAuctions.length < total,
                    hasPrevPage: start > 0
                }
            }
        });

    } catch (error) {
        console.error('Get seller bid history error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching bid history'
        });
    }
};

// Lot statuses an admin can filter the Bids page by (value → label).
export const ADMIN_BID_STATUSES = [
    { value: 'active', label: 'Live' },
    { value: 'sold', label: 'Sold' },
    { value: 'sold_buy_now', label: 'Sold (Buy It Now)' },
    { value: 'reserve_not_met', label: 'Reserve not met' },
    { value: 'ended', label: 'Ended' },
    { value: 'cancelled', label: 'Cancelled' },
];

const ADMIN_BID_SORTS = ['recent', 'ending_soon', 'most_bids', 'highest_bid', 'seller_name'];
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "First Last", else username, else company name (never "undefined undefined").
const personName = (u) => {
    if (!u) return '';
    const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return full || u.companyName || u.username || '';
};

/**
 * @desc    Admin Bids page: lots with bids (or retracted bids), filtered, sorted and paged on the server.
 * @route   GET /api/v1/bids/admin/history
 * @query   page, limit (max 100), status, seller, search, sortBy, currency
 * @access  Admin
 */
export const getAdminBidHistory = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const { status, seller } = req.query;
        const search = String(req.query.search || '').trim();
        const sortBy = ADMIN_BID_SORTS.includes(req.query.sortBy) ? req.query.sortBy : 'recent';
        const userCurrency = req.query.currency || 'EUR';
        const rates = getCachedRates();

        const convertAmount = (amount, auction) => {
            if (!amount) return 0;
            if (!rates) return amount;
            const base = auction.baseCurrency || 'EUR';
            const rate = rates[base]?.rates?.[userCurrency];
            if (!rate) return amount;
            return parseFloat((amount * rate).toFixed(2));
        };

        // Lots that have had bidding: current bids, or bids an admin retracted.
        const hasBidding = { $or: [{ 'bids.0': { $exists: true } }, { 'retractedBids.0': { $exists: true } }] };
        const and = [hasBidding];

        if (status && status !== 'all') and.push({ status });
        if (seller && seller !== 'all' && mongoose.isValidObjectId(seller)) {
            and.push({ seller: new mongoose.Types.ObjectId(seller) });
        }
        if (search) {
            const rx = new RegExp(escapeRegex(search), 'i');
            const people = await User.find({
                $or: [{ username: rx }, { firstName: rx }, { lastName: rx }, { companyName: rx }, { email: rx }],
            }).select('_id').limit(500).lean();
            const ids = people.map((p) => p._id);
            const or = [{ title: rx }, { 'bids.bidderUsername': rx }, { 'retractedBids.bidderUsername': rx }];
            if (mongoose.isValidObjectId(search)) or.push({ _id: new mongoose.Types.ObjectId(search) });
            if (ids.length) or.push({ seller: { $in: ids } }, { 'bids.bidder': { $in: ids } });
            and.push({ $or: or });
        }
        const match = { $and: and };

        const now = new Date();
        const sortStages = {
            recent: [{ $sort: { createdAt: -1, _id: -1 } }],
            // Live lots closing soonest first, then everything else most recently ended.
            ending_soon: [
                { $addFields: { _closed: { $lt: ['$endDate', now] }, _endTs: { $toLong: '$endDate' } } },
                { $addFields: { _endKey: { $cond: ['$_closed', { $multiply: ['$_endTs', -1] }, '$_endTs'] } } },
                { $sort: { _closed: 1, _endKey: 1, _id: -1 } },
            ],
            most_bids: [{ $sort: { bidCount: -1, createdAt: -1, _id: -1 } }],
            highest_bid: [{ $sort: { currentPrice: -1, createdAt: -1, _id: -1 } }],
            seller_name: [
                { $lookup: { from: 'users', localField: 'seller', foreignField: '_id', as: '_s' } },
                { $addFields: { _s: { $arrayElemAt: ['$_s', 0] } } },
                { $addFields: { _sellerName: { $toLower: { $trim: { input: { $concat: [
                    { $ifNull: ['$_s.firstName', ''] }, ' ',
                    { $ifNull: ['$_s.lastName', ''] }, ' ',
                    { $ifNull: ['$_s.companyName', ''] },
                ] } } } } } },
                { $sort: { _sellerName: 1, createdAt: -1, _id: -1 } },
            ],
        };

        const [facet] = await Auction.aggregate([
            { $match: match },
            ...sortStages[sortBy],
            {
                $facet: {
                    ids: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 1 } }],
                    total: [{ $count: 'n' }],
                },
            },
        ]);
        const pageIds = (facet?.ids || []).map((d) => d._id);
        const total = facet?.total?.[0]?.n || 0;

        const docs = await Auction.find({ _id: { $in: pageIds } })
            .populate('seller', 'username companyName firstName lastName email company')
            .populate('winner', 'username companyName firstName lastName email')
            .populate('bids.bidder', 'username companyName firstName lastName email company')
            .lean();
        const byId = new Map(docs.map((d) => [d._id.toString(), d]));
        const auctions = pageIds.map((id) => byId.get(id.toString())).filter(Boolean);

        const transformedAuctions = auctions.map((auction) => {
            const sortedBids = [...(auction.bids || [])].sort((a, b) =>
                b.amount !== a.amount ? b.amount - a.amount : new Date(b.timestamp) - new Date(a.timestamp)
            );
            const winnerId = auction.winner?._id?.toString();

            const bids = sortedBids.map((bid, index) => {
                let bidStatus = 'Outbid';
                if (auction.status === 'active') {
                    if (index === 0) bidStatus = 'Winning';
                } else if (['sold', 'ended', 'sold_buy_now'].includes(auction.status)) {
                    if (index === 0 && winnerId && winnerId === bid.bidder?._id?.toString()) bidStatus = 'Winner';
                } else if (auction.status === 'reserve_not_met') {
                    bidStatus = 'Reserve Not Met';
                }
                return {
                    id: bid._id?.toString(),
                    bidder: {
                        id: bid.bidder?._id?.toString(),
                        name: personName(bid.bidder) || bid.bidderUsername || 'Deleted user',
                        username: bid.bidder?.username || bid.bidderUsername || '',
                        companyName: bid.bidder?.companyName || '',
                        email: bid.bidder?.email,
                    },
                    amount: bid.amount,
                    convertedAmount: convertAmount(bid.amount, auction),
                    time: bid.timestamp,
                    status: bidStatus,
                    isHighest: index === 0,
                    isProxyBid: !!bid.isProxyBid,
                };
            });

            return {
                id: auction._id.toString(),
                auctionId: `AU${auction._id.toString().slice(-6).toUpperCase()}`,
                title: auction.title,
                category: auction.category,
                auctionType: auction.auctionType === 'reserve' ? 'Reserve Auction' : 'Standard Auction',
                startTime: auction.startDate,
                endTime: auction.endDate,
                status: auction.status,
                hasReserve: Number(auction.reservePrice) > 0,
                reserveMet: !(Number(auction.reservePrice) > 0) || Number(auction.currentPrice) >= Number(auction.reservePrice),
                convertedStartingBid: convertAmount(auction.startPrice, auction),
                convertedReservePrice: convertAmount(auction.reservePrice, auction),
                convertedCurrentPrice: convertAmount(auction.currentPrice, auction),
                convertedWinningBid: convertAmount(sortedBids[0]?.amount || auction.currentPrice, auction),
                convertedFinalPrice: convertAmount(auction.finalPrice, auction),
                displayCurrency: userCurrency,
                seller: {
                    id: auction.seller?._id?.toString(),
                    name: personName(auction.seller) || auction.sellerUsername || 'Unknown seller',
                    username: auction.seller?.username || '',
                    email: auction.seller?.email,
                },
                winner: auction.winner ? { id: winnerId, name: personName(auction.winner) } : null,
                totalBids: (auction.bids || []).length,
                uniqueBidders: new Set((auction.bids || []).map((b) => (b.bidder?._id ?? b.bidder)?.toString())).size,
                retractions: (auction.retractedBids || []).map((r) => ({
                    bidderUsername: r.bidderUsername,
                    bidCount: r.bids?.length || 0,
                    convertedHighestBid: convertAmount(Math.max(0, ...(r.bids || []).map((b) => b.amount || 0)), auction),
                    convertedPriceBefore: convertAmount(r.priceBefore, auction),
                    convertedPriceAfter: convertAmount(r.priceAfter, auction),
                    reason: r.reason,
                    retractedAt: r.retractedAt,
                })),
                bids,
                createdAt: auction.createdAt,
            };
        });

        // Seller dropdown: everyone who has a lot with bidding, by name.
        const sellerIds = await Auction.distinct('seller', hasBidding);
        const sellerUsers = await User.find({ _id: { $in: sellerIds } })
            .select('username firstName lastName companyName').lean();
        const sellers = sellerUsers
            .map((u) => ({ id: u._id.toString(), name: personName(u) || 'Unnamed seller' }))
            .sort((a, b) => a.name.localeCompare(b.name, 'en-IE'));

        res.status(200).json({
            success: true,
            data: {
                auctions: transformedAuctions,
                filterOptions: { statuses: ADMIN_BID_STATUSES, sellers },
                pagination: {
                    currentPage: page,
                    limit,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                    totalAuctions: total,
                    hasNextPage: page * limit < total,
                    hasPrevPage: page > 1,
                },
            },
        });
    } catch (error) {
        console.error('Admin bid history error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching bid history',
        });
    }
};

export const getAdminBidStats = async (req, res) => {
    try {
        // Get comprehensive bid statistics for admin dashboard
        const today = new Date();
        const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Total bids placed
        const totalBids = await Auction.aggregate([
            { $unwind: '$bids' },
            { $count: 'total' }
        ]);

        // Bids in last 7 days
        const recentBids = await Auction.aggregate([
            { $unwind: '$bids' },
            { $match: { 'bids.timestamp': { $gte: lastWeek } } },
            { $count: 'total' }
        ]);

        // Revenue statistics
        const revenueStats = await Auction.aggregate([
            { $match: { status: 'sold' } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$commissionAmount' },
                    averageSalePrice: { $avg: '$finalPrice' },
                    totalSales: { $sum: 1 }
                }
            }
        ]);

        // Bid activity by category
        const bidsByCategory = await Auction.aggregate([
            { $unwind: '$bids' },
            {
                $group: {
                    _id: '$category',
                    totalBids: { $sum: 1 },
                    averageBid: { $avg: '$bids.amount' }
                }
            }
        ]);

        // Active bidders count (users who placed bids in last 30 days)
        const activeBidders = await Auction.aggregate([
            { $unwind: '$bids' },
            { $match: { 'bids.timestamp': { $gte: lastMonth } } },
            { $group: { _id: '$bids.bidder' } },
            { $count: 'total' }
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalBids: totalBids[0]?.total || 0,
                recentBids: recentBids[0]?.total || 0,
                totalRevenue: revenueStats[0]?.totalRevenue || 0,
                averageSalePrice: revenueStats[0]?.averageSalePrice || 0,
                totalSales: revenueStats[0]?.totalSales || 0,
                bidsByCategory,
                activeBidders: activeBidders[0]?.total || 0
            }
        });

    } catch (error) {
        console.error('Admin bid stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching bid statistics'
        });
    }
};
/**
 * @desc    Admin retracts all of a bidder's bids on a live lot (e.g. a bidder
 *          withdrawing under s.58(2) Sale of Goods Act 1893 before close).
 *          Their proxy bid is switched off and the remaining bids re-compete.
 * @route   POST /api/v1/bids/admin/auctions/:auctionId/retract
 * @body    { bidderId: string, reason?: string }
 * @access  Admin
 */
export const retractBidderBids = async (req, res) => {
    try {
        const { auctionId } = req.params;
        const { bidderId, reason } = req.body || {};

        if (!bidderId) {
            return res.status(400).json({ success: false, message: "bidderId is required" });
        }

        const result = await retractBids({ auctionId, bidderId, reason, admin: req.user });
        const a = result.auction;

        console.log(
            `Bid retraction: admin ${req.user?._id} retracted ${result.removedCount} bid(s) by ${bidderId} on ${auctionId}` +
            ` (${result.previousPrice} -> ${a.currentPrice})`
        );

        res.status(200).json({
            success: true,
            message: result.removedCount
                ? `Retracted ${result.removedCount} bid${result.removedCount === 1 ? "" : "s"}.`
                : "Proxy bid switched off.",
            data: {
                auctionId: a._id,
                removedCount: result.removedCount,
                previousPrice: result.previousPrice,
                currentPrice: a.currentPrice,
                currentBidder: a.currentBidder,
                bidCount: a.bidCount,
                reserveMet: !(a.auctionType === "reserve" && Number(a.reservePrice) > 0) || a.currentPrice >= a.reservePrice,
            },
        });
    } catch (error) {
        console.error("Retract bid error:", error);
        const status = error.message === "Auction not found" ? 404 : 400;
        res.status(status).json({ success: false, message: error.message || "Failed to retract bid" });
    }
};
