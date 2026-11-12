import { Router } from "express";
import { auth, authAdmin } from "../middlewares/auth.middleware.js";
import {
    listSales,
    runSync,
    getSale,
    updateVat,
    issuePaymentRequests,
    previewPaymentRequest,
    myDocuments,
    downloadDocument,
    issueDocuments,
    previewDocument,
    failSale,
    reopen,
    importHistory,
    sendPayoutSetupEmail,
    releaseEarly,
    paySellers,
    matchTransfers,
    myCollections,
    confirmMyCollection,
    payoutDetails,
    manualPayout,
    recordPaymentManually,
    matchStripePayments,
    unlinkedStripeAccounts,
    linkSellerStripeAccount,
    updateBuyerFee,
    importFees,
} from "../controllers/sale.controller.js";

// Mounted at /api/v1/admin/sales
export const adminSaleRouter = Router();
adminSaleRouter.get("/", authAdmin, listSales);
adminSaleRouter.post("/sync", authAdmin, runSync);
adminSaleRouter.post("/issue-payment-requests", authAdmin, issuePaymentRequests);
adminSaleRouter.post("/issue-documents", authAdmin, issueDocuments);
adminSaleRouter.post("/import-history", authAdmin, importHistory);
adminSaleRouter.post("/pay-sellers", authAdmin, paySellers);
adminSaleRouter.post("/match-transfers", authAdmin, matchTransfers);
adminSaleRouter.post("/match-payments", authAdmin, matchStripePayments);
adminSaleRouter.get("/stripe-accounts/unlinked", authAdmin, unlinkedStripeAccounts);
adminSaleRouter.post("/import-buyer-fees", authAdmin, importFees);
adminSaleRouter.get("/:saleId", authAdmin, getSale);
adminSaleRouter.patch("/:saleId/vat", authAdmin, updateVat);
adminSaleRouter.get("/:saleId/payment-request/preview", authAdmin, previewPaymentRequest);
adminSaleRouter.get("/:saleId/:type/preview", authAdmin, previewDocument);
adminSaleRouter.post("/:saleId/fail", authAdmin, failSale);
adminSaleRouter.post("/:saleId/reopen", authAdmin, reopen);
adminSaleRouter.post("/:saleId/payout-setup-email", authAdmin, sendPayoutSetupEmail);
adminSaleRouter.post("/:saleId/release-payout", authAdmin, releaseEarly);
adminSaleRouter.get("/:saleId/payout-details", authAdmin, payoutDetails);
adminSaleRouter.post("/:saleId/manual-payout", authAdmin, manualPayout);
adminSaleRouter.post("/:saleId/record-payment", authAdmin, recordPaymentManually);
adminSaleRouter.post("/:saleId/link-payout-account", authAdmin, linkSellerStripeAccount);
adminSaleRouter.patch("/:saleId/buyer-fee", authAdmin, updateBuyerFee);
adminSaleRouter.get("/:saleId/documents/:documentId", authAdmin, downloadDocument);

// Mounted at /api/v1/sales (buyers and sellers)
export const saleRouter = Router();
saleRouter.get("/documents", auth, myDocuments);
saleRouter.get("/collections", auth, myCollections);
saleRouter.post("/:saleId/confirm-collection", auth, confirmMyCollection);
saleRouter.get("/:saleId/documents/:documentId", auth, downloadDocument);
