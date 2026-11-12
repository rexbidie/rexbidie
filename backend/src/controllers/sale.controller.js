import Sale from "../models/sale.model.js";
import {
    syncSales,
    setVatDecision,
    issuePaymentRequest,
    paymentRequestSnapshot,
    ensureBuyerIban,
} from "../services/saleService.js";
import {
    issueBuyerReceipt,
    issueSellerStatement,
    markSaleFailed,
    reopenSale,
    importHistoricalSales,
    receiptSnapshot,
    statementSnapshot,
} from "../services/saleLifecycleService.js";
import { renderBuyerReceiptPdf, renderSellerStatementPdf } from "../utils/documents/pdf.js";
import { renderDocumentPdf, renderPaymentRequestPdf } from "../utils/documents/pdf.js";
import { REGIONS } from "../utils/region.js";
import User from "../models/user.model.js";
import { payoutState } from "../services/connectService.js";

const LIST_FIELDS = "-documents.snapshot -notes";

const fail = (res, err) => {
    const status = err.status || 500;
    if (status >= 500) console.error("Sale error:", err);
    return res.status(status).json({ success: false, message: err.message || "Something went wrong" });
};

// ─── Admin ─────────────────────────────────────────────────

export const listSales = async (req, res) => {
    try {
        // Pick up any lots sold since the last scheduled sync, and their IBANs.
        await syncSales({ ibanLimit: 15 });
        const { status, search, review, historical } = req.query;
        const q = {};
        if (status && status !== "all") q.status = status === "paid" ? { $in: ["paid", "collected"] } : status;
        // Earlier (imported) sales have their own tab and stay out of the working tabs.
        if (historical === "true") q.historical = true;
        else if (status && status !== "all") q.historical = { $ne: true };
        if (review === "true") q["vat.reviewRequired"] = true;
        if (search?.trim()) {
            const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            q.$or = [{ reference: rx }, { title: rx }, { "buyer.name": rx }, { "buyer.email": rx }, { "seller.name": rx }, { "seller.companyName": rx }];
        }
        const sales = await Sale.find(q, LIST_FIELDS).sort({ saleDate: -1 }).limit(500).lean();
        // Seller payout readiness (Stripe connected account), from the cached status.
        const sellerIds = [...new Set(sales.map((x) => String(x.seller?.user)).filter(Boolean))];
        const sellers = await User.find({ _id: { $in: sellerIds } }, "stripeConnect phone").lean();
        const byId = new Map(sellers.map((u) => [String(u._id), u]));
        for (const x of sales) {
            const u = byId.get(String(x.seller?.user));
            x.sellerPayout = { state: payoutState(u?.stripeConnect), bankLast4: u?.stripeConnect?.bankLast4 };
            if (!x.seller?.phone && u?.phone) x.seller.phone = u.phone;
        }
        const counts = await Sale.aggregate([
            { $match: { historical: { $ne: true } } },
            { $group: { _id: "$status", n: { $sum: 1 } } },
        ]);
        const historicalCount = await Sale.countDocuments({ historical: true });
        const needsReview = await Sale.countDocuments({ "vat.reviewRequired": true, status: { $in: ["sold", "request_sent"] } });
        res.json({
            success: true,
            data: {
                sales,
                counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
                historicalCount,
                needsReview,
            },
        });
    } catch (err) {
        fail(res, err);
    }
};

export const runSync = async (req, res) => {
    try {
        res.json({ success: true, data: await syncSales() });
    } catch (err) {
        fail(res, err);
    }
};

export const getSale = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.saleId, "-documents.snapshot")
            .populate("notes.by", "firstName lastName username")
            .lean();
        if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
        res.json({ success: true, data: sale });
    } catch (err) {
        fail(res, err);
    }
};

export const updateVat = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.saleId);
        if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
        const { treatment, rate, note, itemRegion, buyerRegion } = req.body || {};
        if (treatment && !["standard", "zero_rated", "clear"].includes(treatment)) {
            return res.status(400).json({ success: false, message: "Unknown VAT treatment" });
        }
        for (const r of [itemRegion, buyerRegion]) {
            if (r && !REGIONS.includes(r)) return res.status(400).json({ success: false, message: `Unknown region ${r}` });
        }
        if (rate !== undefined && rate !== "" && !(Number(rate) >= 0 && Number(rate) <= 30)) {
            return res.status(400).json({ success: false, message: "VAT rate must be between 0 and 30" });
        }
        await setVatDecision(sale, { treatment, rate, note, itemRegion, buyerRegion }, req.user);
        const out = sale.toObject();
        out.documents?.forEach((d) => delete d.snapshot);
        res.json({ success: true, data: out });
    } catch (err) {
        fail(res, err);
    }
};

export const issuePaymentRequests = async (req, res) => {
    const { saleIds, sendEmail = true } = req.body || {};
    if (!Array.isArray(saleIds) || saleIds.length === 0) {
        return res.status(400).json({ success: false, message: "Select at least one sale" });
    }
    if (saleIds.length > 50) {
        return res.status(400).json({ success: false, message: "Send at most 50 at a time" });
    }
    const results = [];
    // One at a time: each call talks to Stripe and the mail server.
    for (const id of saleIds) {
        try {
            const { sale, emailed } = await issuePaymentRequest(id, req.user, { sendEmail: sendEmail !== false });
            results.push({ saleId: id, reference: sale.reference, ok: true, emailed });
        } catch (err) {
            if (!err.status || err.status >= 500) console.error(`Payment request for sale ${id} failed:`, err);
            results.push({ saleId: id, ok: false, message: err.message });
        }
    }
    const sent = results.filter((r) => r.ok).length;
    res.json({ success: true, data: { sent, failed: results.length - sent, results } });
};

/** Draft PDF of the payment request with current figures (no IBAN until issued). */
export const previewPaymentRequest = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.saleId);
        if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
        const snapshot = paymentRequestSnapshot(sale);
        if (!snapshot.bank) {
            await ensureBuyerIban(sale);
            Object.assign(snapshot, paymentRequestSnapshot(sale));
        }
        if (!snapshot.bank) snapshot.bank = { iban: "Not available yet - see the Sales page", reference: sale.reference };
        const pdf = await renderPaymentRequestPdf(snapshot);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${sale.reference}-PR-draft.pdf"`);
        res.send(pdf);
    } catch (err) {
        fail(res, err);
    }
};

// ─── Buyers and sellers ────────────────────────────────────

// Which documents each party may see.
const BUYER_DOCS = ["payment_request", "buyer_receipt"];
const SELLER_DOCS = ["seller_statement"];

const visibleDocs = (sale, userId) => {
    const id = String(userId);
    const asBuyer = String(sale.buyer?.user) === id;
    const asSeller = String(sale.seller?.user) === id;
    return (sale.documents || []).filter(
        (d) => (asBuyer && BUYER_DOCS.includes(d.type)) || (asSeller && SELLER_DOCS.includes(d.type)),
    );
};

export const myDocuments = async (req, res) => {
    try {
        const uid = req.user._id;
        const sales = await Sale.find({ $or: [{ "buyer.user": uid }, { "seller.user": uid }] }, "-notes -documents.snapshot")
            .sort({ saleDate: -1 })
            .lean();
        const items = [];
        for (const s of sales) {
            for (const d of visibleDocs(s, uid)) {
                items.push({
                    saleId: s._id,
                    documentId: d._id,
                    type: d.type,
                    number: d.number,
                    title: s.title,
                    reference: s.reference,
                    total: d.total,
                    currency: d.currency,
                    issuedAt: d.issuedAt,
                    current: !d.supersededAt,
                    role: String(s.buyer?.user) === String(uid) ? "buyer" : "seller",
                    saleStatus: s.status,
                });
            }
        }
        items.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
        res.json({ success: true, data: items });
    } catch (err) {
        fail(res, err);
    }
};

/** PDF download. Admins see every document; buyers and sellers only their own. */
export const downloadDocument = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.saleId).lean();
        if (!sale) return res.status(404).json({ success: false, message: "Document not found" });
        const isAdmin = req.user.userType === "admin";
        const docs = isAdmin ? sale.documents : visibleDocs(sale, req.user._id);
        const doc = docs.find((d) => String(d._id) === req.params.documentId);
        if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
        const pdf = await renderDocumentPdf(doc.type, doc.snapshot);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${doc.number}.pdf"`);
        res.setHeader("Cache-Control", "private, no-store");
        res.send(pdf);
    } catch (err) {
        fail(res, err);
    }
};

// ─── Receipts, statements, failed sales, earlier sales ─────

const ISSUERS = { buyer_receipt: issueBuyerReceipt, seller_statement: issueSellerStatement };

export const issueDocuments = async (req, res) => {
    const { saleIds, type } = req.body || {};
    const issue = ISSUERS[type];
    if (!issue) return res.status(400).json({ success: false, message: "Unknown document type" });
    if (!Array.isArray(saleIds) || saleIds.length === 0) {
        return res.status(400).json({ success: false, message: "Select at least one sale" });
    }
    if (saleIds.length > 50) return res.status(400).json({ success: false, message: "Send at most 50 at a time" });
    const results = [];
    for (const id of saleIds) {
        try {
            const { sale, emailed } = await issue(id, req.user);
            results.push({ saleId: id, reference: sale.reference, ok: true, emailed });
        } catch (err) {
            if (!err.status || err.status >= 500) console.error(`${type} for sale ${id} failed:`, err);
            results.push({ saleId: id, ok: false, message: err.message });
        }
    }
    const sent = results.filter((r) => r.ok).length;
    res.json({ success: true, data: { sent, failed: results.length - sent, results } });
};

export const previewDocument = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.saleId);
        if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
        const pdf =
            req.params.type === "receipt"
                ? await renderBuyerReceiptPdf(receiptSnapshot(sale))
                : req.params.type === "statement"
                    ? await renderSellerStatementPdf(statementSnapshot(sale))
                    : null;
        if (!pdf) return res.status(404).json({ success: false, message: "Unknown document" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${sale.reference}-${req.params.type}-draft.pdf"`);
        res.send(pdf);
    } catch (err) {
        fail(res, err);
    }
};

export const failSale = async (req, res) => {
    try {
        const sale = await markSaleFailed(req.params.saleId, req.body?.reason, req.user);
        res.json({ success: true, data: { _id: sale._id, status: sale.status } });
    } catch (err) {
        fail(res, err);
    }
};

export const reopen = async (req, res) => {
    try {
        const sale = await reopenSale(req.params.saleId, req.user);
        res.json({ success: true, data: { _id: sale._id, status: sale.status } });
    } catch (err) {
        fail(res, err);
    }
};

export const importHistory = async (req, res) => {
    try {
        res.json({ success: true, data: await importHistoricalSales() });
    } catch (err) {
        fail(res, err);
    }
};

/** Emails the seller a link to set up or finish their Stripe payout account. */
export const sendPayoutSetupEmail = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.saleId, "seller title reference notes");
        if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
        const seller = await User.findById(sale.seller.user);
        if (!seller?.email) return res.status(400).json({ success: false, message: "Seller has no email address" });
        const { refreshSellerConnect, payoutSetupUrl, ensureConnectAccount, ensureIndividualAccount } = await import("../services/connectService.js");
        const state = payoutState(await refreshSellerConnect(seller));
        if (state === "ready") return res.status(400).json({ success: false, message: "This seller is already set up for payouts" });
        // Unfinished business accounts become individual accounts.
        const changed = await ensureIndividualAccount(seller);
        if (changed !== "unchanged") {
            sale.notes.push({ text: `Stripe payout account ${changed === "switched" ? "switched" : "replaced"} as an individual account (${seller.stripeConnect?.accountId})`, by: req.user._id });
        }
        // Create the Stripe account now so it shows in Connected accounts straight away.
        if (state === "none") {
            await ensureConnectAccount(seller);
            // Keep "set up" wording in the email: the seller hasn't started yet.
            sale.notes.push({ text: `Stripe payout account ${seller.stripeConnect?.accountId} created for the seller`, by: req.user._id });
        }
        const { sellerPayoutSetupEmail } = await import("../utils/nodemailer.js");
        const ok = await sellerPayoutSetupEmail(seller, { state, url: payoutSetupUrl(seller), saleTitle: sale.title });
        if (!ok) return res.status(502).json({ success: false, message: "Email failed to send" });
        sale.notes.push({ text: `Payout setup link emailed to ${seller.email}`, by: req.user._id });
        await sale.save();
        res.json({ success: true, data: { state } });
    } catch (err) {
        fail(res, err);
    }
};

// ─── Collection and payouts ────────────────────────────────

import {
    confirmCollection,
    releasePayoutEarly,
    paySeller,
    matchPastTransfers,
    netPayout,
    getPayoutDetails,
    recordManualPayout,
} from "../services/payoutService.js";

export const releaseEarly = async (req, res) => {
    try {
        const sale = await releasePayoutEarly(req.params.saleId, req.body?.note, req.user);
        res.json({ success: true, data: { _id: sale._id, status: sale.status } });
    } catch (err) {
        fail(res, err);
    }
};

export const paySellers = async (req, res) => {
    const { saleIds } = req.body || {};
    if (!Array.isArray(saleIds) || saleIds.length === 0) {
        return res.status(400).json({ success: false, message: "Select at least one sale" });
    }
    if (saleIds.length > 25) return res.status(400).json({ success: false, message: "Pay at most 25 at a time" });
    const balanceCache = {};
    const results = [];
    for (const id of saleIds) {
        try {
            const r = await paySeller(id, req.user, { balanceCache });
            results.push({ saleId: id, reference: r.sale.reference, ok: true, amount: r.amount, transferId: r.transferId, emailed: r.emailed });
        } catch (err) {
            if (!err.status) console.error(`Payout for sale ${id} failed:`, err);
            results.push({ saleId: id, ok: false, message: err.raw?.message || err.message });
        }
    }
    const paid = results.filter((r) => r.ok).length;
    res.json({ success: true, data: { paid, failed: results.length - paid, results } });
};

export const matchTransfers = async (req, res) => {
    try {
        res.json({ success: true, data: await matchPastTransfers(req.user) });
    } catch (err) {
        fail(res, err);
    }
};

/** Buyer's and seller's sales that are waiting for collection to be confirmed. */
export const myCollections = async (req, res) => {
    try {
        const uid = req.user._id;
        const sales = await Sale.find(
            {
                historical: { $ne: true },
                status: { $in: ["paid", "collected", "payout_due"] },
                $or: [{ "buyer.user": uid }, { "seller.user": uid }],
            },
            "title reference status collection buyer seller itemLocation currency itemPrice vat sellerFee",
        ).lean();
        const items = sales.map((s) => {
            const role = String(s.buyer?.user) === String(uid) ? "buyer" : "seller";
            const other = role === "buyer" ? s.seller : s.buyer;
            return {
                saleId: s._id,
                title: s.title,
                reference: s.reference,
                role,
                status: s.status,
                collectBy: s.collection?.dueBy,
                itemLocation: s.itemLocation,
                youConfirmed: !!(role === "buyer" ? s.collection?.buyerConfirmedAt : s.collection?.sellerConfirmedAt),
                otherConfirmed: !!(role === "buyer" ? s.collection?.sellerConfirmedAt : s.collection?.buyerConfirmedAt),
                otherName: other?.companyName || other?.name,
                otherPhone: other?.phone,
                payoutAmount: role === "seller" ? netPayout(s) : undefined,
                currency: s.currency,
            };
        });
        res.json({ success: true, data: items });
    } catch (err) {
        fail(res, err);
    }
};

export const confirmMyCollection = async (req, res) => {
    try {
        const { sale, role } = await confirmCollection(req.params.saleId, req.user);
        res.json({ success: true, data: { status: sale.status, role } });
    } catch (err) {
        fail(res, err);
    }
};

export const payoutDetails = async (req, res) => {
    try {
        res.json({ success: true, data: await getPayoutDetails(req.params.saleId) });
    } catch (err) {
        fail(res, err);
    }
};

export const manualPayout = async (req, res) => {
    try {
        const { amount, paidAt, reference, note, sendEmail, method } = req.body || {};
        const r = await recordManualPayout(req.params.saleId, { amount, paidAt, reference, note, sendEmail: sendEmail !== false, method }, req.user);
        res.json({ success: true, data: { reference: r.sale.reference, amount: r.amount, emailed: r.emailed } });
    } catch (err) {
        fail(res, err);
    }
};

export const recordPaymentManually = async (req, res) => {
    try {
        const { recordOutsidePayment } = await import("../services/saleService.js");
        const { method, reference, paidAt, amount, note, sendDocuments } = req.body || {};
        const sale = await recordOutsidePayment(req.params.saleId, { method, reference, paidAt, amount, note, sendDocuments: sendDocuments !== false }, req.user);
        res.json({ success: true, data: { _id: sale._id, status: sale.status, documents: sale.documents.length } });
    } catch (err) {
        fail(res, err);
    }
};

export const matchStripePayments = async (req, res) => {
    try {
        const { matchOutsideStripePayments } = await import("../services/saleService.js");
        res.json({ success: true, data: await matchOutsideStripePayments({ limit: 100 }) });
    } catch (err) {
        fail(res, err);
    }
};

export const unlinkedStripeAccounts = async (req, res) => {
    try {
        const { listUnlinkedAccounts } = await import("../services/connectService.js");
        res.json({ success: true, data: await listUnlinkedAccounts() });
    } catch (err) {
        fail(res, err);
    }
};

export const linkSellerStripeAccount = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.saleId, "seller reference notes");
        if (!sale) return res.status(404).json({ success: false, message: "Sale not found" });
        const seller = await User.findById(sale.seller.user);
        if (!seller) return res.status(404).json({ success: false, message: "Seller account not found" });
        const { linkConnectAccount } = await import("../services/connectService.js");
        const sc = await linkConnectAccount(seller, String(req.body?.accountId || "").trim());
        sale.notes.push({ text: `Seller linked to Stripe account ${sc.accountId} by an admin`, by: req.user._id });
        await sale.save();
        res.json({ success: true, data: { state: payoutState(sc), bankLast4: sc.bankLast4 } });
    } catch (err) {
        fail(res, err);
    }
};

export const updateBuyerFee = async (req, res) => {
    try {
        const { setBuyerFee } = await import("../services/saleService.js");
        const { sale } = await setBuyerFee(req.params.saleId, req.body?.fee, req.body?.note, req.user);
        res.json({ success: true, data: { buyerFee: sale.buyerFee, total: sale.total } });
    } catch (err) {
        fail(res, err);
    }
};

export const importFees = async (req, res) => {
    try {
        const rows = req.body?.rows;
        if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, message: "No rows to import" });
        if (rows.length > 1000) return res.status(400).json({ success: false, message: "Import at most 1,000 rows at a time" });
        const { importBuyerFees } = await import("../services/saleService.js");
        res.json({ success: true, data: await importBuyerFees(rows, req.user) });
    } catch (err) {
        fail(res, err);
    }
};
