import Auction from "../models/auction.model.js";
import { placeBidDirect } from "../controllers/auction.controller.js";

/**
 * Cascade all active proxy bids for an auction.
 * ALL amounts here are in auction.baseCurrency — no currency conversion.
 */
export const processProxyBids = async (auctionId) => {
    const visited = new Set();
    await runProxyBidPass(auctionId, visited);
};

const runProxyBidPass = async (auctionId, visited) => {
    const auction = await Auction.findById(auctionId);
    if (!auction || auction.status !== "active") return;

    const activeProxies = auction.proxyBids
        .filter((pb) => pb.isActive)
        .sort((a, b) => b.maxAmount - a.maxAmount);

    if (activeProxies.length === 0) return;

    let highestBidder = auction.currentBidder?.toString() || null;
    let highestBid = auction.currentPrice;   // BASE
    let placedAny = false;

    for (const proxy of activeProxies) {
        const bidderId = proxy.bidder.toString();
        if (highestBidder === bidderId) continue;

        const nextBid = highestBid + auction.bidIncrement;   // BASE
        if (proxy.maxAmount < nextBid) continue;

        await placeBidDirect(
            auctionId,
            proxy.bidder,
            proxy.bidderUsername,
            nextBid,
            proxy._id
        );

        highestBidder = bidderId;
        highestBid = nextBid;
        placedAny = true;
    }

    // Cascade: any new highest bidder may still be out-bid by another proxy
    if (placedAny) return runProxyBidPass(auctionId, visited);

    // Bidding has settled. If the leader's proxy maximum covers the reserve but the
    // price is still below it, lift the price to the reserve so the lot can sell.
    // (Otherwise a single bidder with a €10k max on a €5k reserve stays at the start
    // price and the lot ends "reserve not met".)
    await raiseLeaderToReserve(auction);
};

export const reserveRaiseFor = (auction) => {
    if (auction.auctionType !== "reserve") return null;
    const reserve = Number(auction.reservePrice) || 0;
    if (!reserve || !auction.currentBidder || auction.currentPrice >= reserve) return null;
    const leaderId = auction.currentBidder.toString();
    const proxy = (auction.proxyBids || []).find(
        (pb) => pb.isActive && pb.bidder.toString() === leaderId
    );
    if (!proxy || proxy.maxAmount < reserve) return null;
    return { proxy, amount: reserve };   // BASE
};

const raiseLeaderToReserve = async (auction) => {
    const raise = reserveRaiseFor(auction);
    if (!raise) return;
    await placeBidDirect(
        auction._id,
        raise.proxy.bidder,
        raise.proxy.bidderUsername,
        raise.amount,
        raise.proxy._id,
        3,
        { raiseOwnBid: true }
    );
};