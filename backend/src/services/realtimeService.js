import { getCachedRates } from "../routes/currency.route.js";
import { getIO } from "../utils/socket.js";
import { getManualPaymentFlags } from "../utils/manualPayment.js";
import { sanitizeAuctionForViewer } from "../utils/publicAuction.js";

const TICK_FIELDS = [
    "_id",
    "status",
    "auctionType",
    "currentPrice",
    "bidCount",
    "currentBidder",
    "winner",
    "finalPrice",
    "startDate",
    "endDate",
    "lastBidTime",
    "hasReserve",
    "reserveMet",
    "reserveStatus",
    "buyNowPrice",
    "watchlistCount",
    "paymentStatus",
    "updatedAt",
];

const pick = (obj, keys) => {
    const out = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
};

/**
 * Re-fetches the auction with populated refs, then:
 *   - emits a lightweight "auction:tick" to all clients (home/list pages)
 *   - emits the full auction to the room "auction:<id>" (detail page)
 *
 * Fire-and-forget safe. Call without await.
 */
export const broadcastAuctionChange = async (auctionId) => {
    const io = getIO();
    if (!io || !auctionId) return;

    try {
        const { default: Auction } = await import("../models/auction.model.js");

        const auction = await Auction.findById(auctionId)
            .populate("seller", "username firstName lastName companyName")
            .populate("currentBidder", "username firstName lastName")
            .populate("winner", "username firstName lastName")
            .populate("bids.bidder", "username firstName lastName")
            .populate("offers.buyer", "username firstName lastName")
            .lean();

        if (!auction) return;

        // Socket rooms are public: broadcast only the anonymous view, and leave
        // out per-user collections entirely so clients keep their own copy
        // (fetched via the authenticated REST call) instead of receiving
        // everyone else's proxy bids and offers.
        const { proxyBids, offers, participants, ...publicAuction } =
            sanitizeAuctionForViewer(auction, null);

        const serverTime = Date.now();
        const rates = getCachedRates() || null;
        const baseCurrency = auction.baseCurrency;

        io.to("global").emit("auction:tick", {
            ...pick(publicAuction, TICK_FIELDS),
            baseCurrency,
            rates,
            serverTime,
            ...getManualPaymentFlags(auction),
        });

        io.to(`auction:${auctionId}`).emit("auction:update", {
            serverTime,
            baseCurrency,
            rates,
            auction: {
                ...publicAuction,
                ...getManualPaymentFlags(auction),   // ← add
            },
        });
    } catch (err) {
        console.error("broadcastAuctionChange error:", err);
    }
};

export const broadcastAuctionRemoved = (auctionId) => {
    const io = getIO();
    if (!io || !auctionId) return;

    const payload = { _id: String(auctionId) };
    io.to("global").emit("auction:removed", payload);
    io.to(`auction:${auctionId}`).emit("auction:removed", payload);
};