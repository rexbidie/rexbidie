import { Router } from 'express';
import { 
    getAdminStats,
    getAllUsers,
    getUserDetails,
    updateUserStatus,
    deleteUser,
    updateUserType,
    getAllAuctions,
    getAuctionDetails,
    updateAuctionStatus,
    approveAuction,
    getClosingSlots,
    updateUserIdentity,
    getEmailHealth,
    markEmailsBounced,
    endAuction,
    deleteAuction,
    updateAuction,
    updatePaymentStatus,
    fetchDVLAData,
    verifyUserIdentity,
    verifyUser,
    rejectUserIdentity,
    updateUserContact,
    searchUsersForManualSell,
    manualSellAuction
} from '../controllers/admin.controller.js';
import { authAdmin } from '../middlewares/auth.middleware.js';
import { pendingEdits, approve as approveListingEdit, reject as rejectListingEdit } from '../controllers/listingEdit.controller.js';
import upload from '../middlewares/multer.middleware.js';
import { getAdminTransactions, getTransactionStats } from '../controllers/transaction.controller.js';

const AdminRouter = Router();

AdminRouter.get('/stats', authAdmin, getAdminStats);
// Edits to live listings waiting for approval
AdminRouter.get('/listing-edits', authAdmin, pendingEdits);
AdminRouter.post('/listing-edits/:id/approve', authAdmin, approveListingEdit);
AdminRouter.post('/listing-edits/:id/reject', authAdmin, rejectListingEdit);
AdminRouter.get('/users', authAdmin, getAllUsers);
AdminRouter.get('/users/:userId', authAdmin, getUserDetails);
AdminRouter.patch('/users/:userId/status', authAdmin, updateUserStatus);
AdminRouter.patch('/users/:userId/type', authAdmin, updateUserType);
AdminRouter.delete('/users/:userId', authAdmin, deleteUser);
AdminRouter.patch('/users/:userId/identificationDocument/verify', authAdmin, verifyUserIdentity);
AdminRouter.patch('/users/:userId/verify', authAdmin, verifyUser);
AdminRouter.patch('/users/:userId/identificationDocument/reject', authAdmin, rejectUserIdentity);
AdminRouter.patch('/users/:userId/contact', authAdmin, updateUserContact);
AdminRouter.patch('/users/:userId/identity', authAdmin, updateUserIdentity);
AdminRouter.get('/email-health', authAdmin, getEmailHealth);
AdminRouter.post('/email-health/bounced', authAdmin, markEmailsBounced);

//dvla api route
AdminRouter.post('/dvla', authAdmin, fetchDVLAData);

// Auction management routes
AdminRouter.get('/auctions', authAdmin, getAllAuctions);
AdminRouter.get('/auctions/:auctionId', authAdmin, getAuctionDetails);
AdminRouter.patch('/auctions/:auctionId/status', authAdmin, updateAuctionStatus);
AdminRouter.get('/auctions/:auctionId/closing-slots', authAdmin, getClosingSlots);
AdminRouter.patch('/auctions/:auctionId/approve', authAdmin, approveAuction);
AdminRouter.patch('/auctions/:auctionId/end', authAdmin, endAuction);
AdminRouter.delete('/auctions/:auctionId', authAdmin, deleteAuction);
AdminRouter.put('/auctions/:id', authAdmin, upload.fields([
    { name: 'photos' },
    { name: 'documents' },
    { name: 'serviceRecords' },
]), updateAuction);
AdminRouter.get('/auctions/:auctionId/manual-sell/users', authAdmin, searchUsersForManualSell);
AdminRouter.post('/auctions/:auctionId/manual-sell', authAdmin, manualSellAuction);
AdminRouter.get('/transactions', authAdmin, getAdminTransactions);
AdminRouter.get('/transactions/stats', authAdmin, getTransactionStats);
AdminRouter.put('/:id/payment-status', 
    authAdmin, 
    upload.single('invoice'), 
    updatePaymentStatus
);

export default AdminRouter;