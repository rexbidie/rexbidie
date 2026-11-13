import express, { Router } from 'express';
import {
    createAuction,
    getAuctions,
    getAuction,
    updateAuction,
    deleteAuction,
    placeBid,
    buyLiveBuyNow,
    liveBuyNowStatus,
    getUserAuctions,
    getBiddingStats,
    getWonAuctions,
    getSoldAuctions,
    getTopLiveAuctions,
    lowerReservePrice,
    getAuctionCommission,
    markAsFeatured,
    getHotListing,
    getFeaturedListings,
    getListingExtrasPricing,
    participateInGiveaway,
    getGiveawayParticipants,
    selectGiveawayWinner,
    placeProxyBid,
    updateProxyBid,
    cancelProxyBid,
    getProxyBidStatus,
    retryExtrasPayment
} from '../controllers/auction.controller.js';
import upload from '../middlewares/multer.middleware.js';
import { auth, authAdmin, authBidder, authSeller, optionalAuth } from '../middlewares/auth.middleware.js';

const auctionRouter = Router();

// Protected routes
auctionRouter.post('/create', authSeller, upload.fields([
    { name: 'photos' },
    { name: 'documents' },
    { name: 'serviceRecords' },
]), createAuction);

auctionRouter.put('/update/:id', authSeller, upload.fields([
    { name: 'photos' },
    { name: 'documents' },
    { name: 'serviceRecords' },
]), updateAuction);
auctionRouter.delete('/delete/:id', authSeller, deleteAuction);
auctionRouter.post('/bid/:id', authBidder, placeBid);
auctionRouter.post('/:id/live-buy-now', authBidder, buyLiveBuyNow);
auctionRouter.get('/:id/live-buy-now', liveBuyNowStatus);
auctionRouter.get('/user/my-auctions', authSeller, getUserAuctions);
auctionRouter.get('/stats', auth, getBiddingStats);
auctionRouter.get('/won-auctions', auth, getWonAuctions);
auctionRouter.get('/sold-auctions', authSeller, getSoldAuctions);
auctionRouter.get('/top', getTopLiveAuctions);
auctionRouter.get('/extras/pricing', getListingExtrasPricing);
auctionRouter.post("/:id/retry-extras-payment", authSeller, retryExtrasPayment);
auctionRouter.post("/:id/proxy-bid", authBidder, placeProxyBid);
auctionRouter.put("/:id/proxy-bid", authBidder, updateProxyBid);
auctionRouter.delete("/:id/proxy-bid", authBidder, cancelProxyBid);
auctionRouter.get("/:id/proxy-bid/status", auth, getProxyBidStatus);
auctionRouter.patch('/:id/lower-reserve', authSeller, lowerReservePrice);
auctionRouter.post('/:id/featured', authSeller, markAsFeatured);

// Public routes
auctionRouter.get('/', getAuctions);
auctionRouter.get('/hot', getHotListing);
auctionRouter.get('/featured', getFeaturedListings);
auctionRouter.get('/:id', optionalAuth, getAuction);
auctionRouter.get('/:id/commission', auth, getAuctionCommission);

// Giveaway routes
auctionRouter.post('/:id/participate', participateInGiveaway);
auctionRouter.get('/:id/participants', authAdmin, getGiveawayParticipants);
auctionRouter.post('/:id/select-winner', authAdmin, selectGiveawayWinner);

export default auctionRouter;