import { useCallback, useEffect, useState } from "react";
import axiosInstance from "../../../utils/axiosInstance";

// Everything the bidder dashboard home shows, from the same endpoints the
// separate bidder pages use (My Bids, Watchlist, My Offers, Documents).

const ENDED = ["sold", "sold_buy_now", "ended", "reserve_not_met", "cancelled"];

/** Bid status, also covering lots sold on Buy It Now (the API reports those as "outbid"). */
const bidStatus = (b, userId) => {
    if (ENDED.includes(b.auctionStatus)) {
        if (b.winnerInfo?.id && String(b.winnerInfo.id) === String(userId)) return "won";
        return b.status === "won" ? "won" : "lost";
    }
    return b.status;
};

const photoUrl = (p) => (typeof p === "string" ? p : p?.thumbUrl || p?.url || "");

export default function useBidderDashboard(user) {
    const currency = user?.currency || "EUR";
    const [state, setState] = useState({ loading: true, bids: [], watchlist: [], offers: [], documents: [], collections: [] });

    const load = useCallback(async () => {
        const get = (url) => axiosInstance.get(url).then((r) => r.data).catch(() => null);
        const [bids, watch, offers, docs, cols] = await Promise.all([
            get(`/api/v1/bids/my-bids?currency=${currency}&limit=100`),
            get(`/api/v1/watchlist/my-watchlist?currency=${currency}`),
            get(`/api/v1/offers/my?currency=${currency}`),
            get("/api/v1/sales/documents"),
            get("/api/v1/sales/collections"),
        ]);
        setState({
            loading: false,
            bids: (bids?.data?.bids || []).map((b) => ({
                id: b.id,
                title: b.title,
                image: b.image && !String(b.image).startsWith("/api/placeholder") ? b.image : "",
                status: bidStatus(b, user?._id),
                myBid: b.myBidAmount,
                currentBid: b.currentBid,
                nextMinBid: b.nextMinBid,
                endTime: b.endTime,
                bids: b.bids,
                reserveNotMet: b.reserveNotMet,
                currency: b.displayCurrency || currency,
            })),
            watchlist: (watch?.data?.watchlist || [])
                .filter((w) => w.auction)
                .map((w) => ({
                    id: w.auction._id,
                    title: w.auction.title,
                    image: photoUrl(w.auction.photos?.[0]),
                    currentBid: w.auction.convertedCurrentPrice || w.auction.convertedStartPrice,
                    endTime: w.auction.endDate,
                    bids: w.auction.bidCount || 0,
                    status: w.auction.status,
                    currency,
                })),
            offers: (offers?.data?.offers || [])
                .filter((o) => o.auction)
                .map((o) => ({
                    id: o._id,
                    auctionId: o.auction._id,
                    title: o.auction.title,
                    image: photoUrl(o.auction.photos?.[0]),
                    amount: o.convertedAmount,
                    counterAmount: o.convertedCounterAmount,
                    status: o.status,
                    expiresAt: o.expiresAt,
                    currency,
                })),
            documents: docs?.data || [],
            collections: cols?.data || [],
        });
    }, [currency, user?._id]);

    useEffect(() => {
        load();
    }, [load]);

    return { ...state, reload: load };
}
