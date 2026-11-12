import Stripe from "stripe";
import Sale from "../models/sale.model.js";
import Auction from "../models/auction.model.js";
import User from "../models/user.model.js";
import { regionForItem, regionForUser } from "../utils/region.js";
import { calculateVat } from "../utils/vat.js";
import { renderPaymentRequestPdf } from "../utils/documents/pdf.js";
import { isManualPaymentRequired } from "../utils/manualPayment.js";
import { addWorkingDays, COLLECTION_WORKING_DAYS } from "../utils/workingDays.js";
import {
    paymentRequestEmail,
} from "../utils/nodemailer.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Sale records are created for lots sold on or after this date. Older sales
// live in the finance spreadsheet and are imported separately.
export const SALES_TRACKING_START = new Date(process.env.SALES_TRACKING_START || "2026-11-10T00:00:00Z");

export const PAYMENT_DUE_HOURS = 48;

const FRONTEND_URL = process.env.FRONTEND_URL || "https://rexbid.ie";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;



const USER_FIELDS =
    "firstName lastName username companyName companyVATNumber email phone address countryName countryCode currency stripeCustomerId region";

// ─── Building a sale from an auction ───────────────────────

const personName = (u) =>
    [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || u?.companyName || u?.username || "";

const addressLines = (a = {}) =>
    [
        a.line1,
        a.line2,
        [a.county, a.postCode].filter(Boolean).join(", "),
        [a.state, a.country].filter(Boolean).join(", "),
    ]
        .map((l) => (l || "").trim())
        .filter(Boolean);

export const partyFromUser = (u) => ({
    user: u?._id,
    name: personName(u),
    username: u?.username,
    companyName: u?.companyName || undefined,
    email: u?.email,
    phone: u?.phone,
    addressLines: addressLines(u?.address),
    vatNumber: u?.companyVATNumber || undefined,
    region: regionForUser(u),
});

/** Short payment reference, e.g. "JCB-1EDE06". */
export const makeReference = (title, auctionId) => {
    const prefix = (String(title || "").match(/[A-Za-z0-9]/g) || []).join("").slice(0, 3).toUpperCase() || "RB";
    return `${prefix}-${String(auctionId).slice(-6).toUpperCase()}`;
};

/** Applies the VAT rules to a sale and recalculates the total. */
export const applyVat = (sale) => {
    const v = calculateVat({
        vatApplicable: sale.vat.applicable,
        itemPrice: sale.itemPrice,
        itemRegion: sale.vat.itemRegion,
        buyerRegion: sale.buyer?.region,
        buyerVatNumber: sale.buyer?.vatNumber,
        override: sale.vat.override?.treatment ? sale.vat.override : null,
    });
    sale.vat.rate = v.rate;
    sale.vat.amount = v.amount;
    sale.vat.treatment = v.treatment;
    sale.vat.reviewRequired = v.reviewRequired;
    sale.vat.reviewReasons = v.reviewReasons;
    sale.total = round2(sale.itemPrice + sale.vat.amount + (sale.buyerFee || 0));
    return sale;
};

/**
 * Lots under the manual-payment threshold (€1,000) can also be paid by card
 * through the existing checkout page; larger ones are bank transfer only.
 */
export const isCardCheckoutAvailable = (itemPrice, currency) =>
    !isManualPaymentRequired({ finalPrice: itemPrice, baseCurrency: currency });

export const cardCheckoutUrl = (auctionId) => `${FRONTEND_URL}/checkout/${auctionId}`;

const methodLabel = (m) =>
    ({ credit_card: "card", bank_transfer: "bank transfer", paypal: "PayPal" })[m] || m || "other";

export const buildSale = (auction, buyer, seller) => {
    const itemPrice = Number(auction.finalPrice ?? auction.currentPrice ?? 0);
    const currency = auction.baseCurrency === "GBP" ? "GBP" : "EUR";
    const paid = auction.paymentStatus === "completed";
    const sale = {
        auction: auction._id,
        reference: makeReference(auction.title, auction._id),
        title: auction.title,
        saleDate: auction.endDate || auction.updatedAt || new Date(),
        itemLocation: auction.location || undefined,
        currency,
        buyer: partyFromUser(buyer),
        seller: partyFromUser(seller),
        itemPrice,
        buyerFee: round2(auction.bidderCommissionAmount || 0),
        buyerFeeDescription: "Buyer commission",
        sellerFee: round2(auction.sellerCommissionAmount || 0),
        vat: {
            applicable: !!auction.vatIncluded,
            itemRegion: regionForItem(auction, seller),
        },
        status: paid ? "paid" : "sold",
        payment: {
            cardCheckoutAvailable: isCardCheckoutAvailable(itemPrice, currency),
            ...(paid
                ? { paidAt: auction.paymentDate || new Date(), method: auction.paymentMethod || "other", transactionId: auction.transactionId }
                : {}),
        },
    };
    applyVat(sale);
    if (paid) sale.payment.amount = sale.total;
    return sale;
};

const createSaleFromAuction = async (auction) => {
    const data = buildSale(auction, auction.winner, auction.seller);
    // Two lots can share a title prefix and id tail; keep references unique.
    if (await Sale.exists({ reference: data.reference })) {
        data.reference = `${data.reference}-${String(auction._id).slice(-9, -6).toUpperCase()}`;
    }
    return Sale.create(data);
};

/** Creates the sale record for one auction straight after it sells. */
export const syncSaleForAuction = async (auctionId) => {
    if (await Sale.exists({ auction: auctionId })) return null;
    const auction = await Auction.findById(auctionId).populate("winner", USER_FIELDS).populate("seller", USER_FIELDS);
    if (!auction?.winner || !auction?.seller) return null;
    if (!["sold", "sold_buy_now"].includes(auction.status)) return null;
    if (auction.endDate && auction.endDate < SALES_TRACKING_START) return null;
    try {
        const sale = await createSaleFromAuction(auction);
        // Get the buyer's IBAN now so it is ready on the Sales page.
        if (sale.status === "sold") await ensureBuyerIban(sale);
        return sale;
    } catch (err) {
        if (err?.code !== 11000) console.error(`Could not create sale for auction ${auctionId}:`, err.message);
        return null;
    }
};

/**
 * Marks the sale paid when its auction is paid some other way: card checkout,
 * or an admin marking it paid. If a bank-transfer request was already sent and
 * nothing has arrived on it, that request is cancelled in Stripe so the buyer
 * cannot pay twice.
 */
export const markSalePaidFromAuction = async (auction) => {
    const sale = await Sale.findOne({ auction: auction._id });
    if (!sale || !["sold", "request_sent", "failed"].includes(sale.status)) return sale;
    if (sale.status === "failed") sale.notes.push({ text: "Payment arrived after the sale was marked failed" });

    const method = auction.paymentMethod || "other";
    sale.status = "paid";
    sale.set("payment.paidAt", auction.paymentDate || new Date());
    sale.set("payment.method", method);
    sale.set("payment.amount", sale.total);
    sale.set("collection.dueBy", addWorkingDays(auction.paymentDate || new Date(), COLLECTION_WORKING_DAYS));
    if (auction.transactionId) sale.set("payment.transactionId", auction.transactionId);
    sale.notes.push({ text: `Paid by ${methodLabel(method)}${auction.transactionId ? ` (${auction.transactionId})` : ""}` });

    const piId = sale.stripe?.paymentIntentId;
    if (piId && piId !== auction.transactionId) {
        try {
            const pi = await stripe.paymentIntents.retrieve(piId);
            if (["requires_action", "requires_payment_method"].includes(pi.status) && !(pi.amount_received > 0)) {
                await stripe.paymentIntents.cancel(piId);
                sale.notes.push({ text: `Bank-transfer request ${piId} cancelled in Stripe because the buyer paid by ${methodLabel(method)}` });
            } else if (pi.amount_received > 0 && pi.status !== "succeeded") {
                sale.notes.push({ text: `Check Stripe: ${pi.amount_received / 100} ${sale.currency} also arrived by bank transfer on ${piId}` });
            }
        } catch (err) {
            sale.notes.push({ text: `Could not cancel bank-transfer request ${piId}: ${err.message}` });
        }
    }
    await sale.save();
    await autoIssueReceipt(sale);
    return sale;
};

/**
 * Creates sale records for sold lots that do not have one yet, marks paid
 * any whose auction has been paid, and fills in missing IBANs.
 * Safe to run repeatedly; it is called on a schedule and from the admin page.
 */
export const syncSales = async ({ since = SALES_TRACKING_START, ibanLimit = 25 } = {}) => {
    const existing = await Sale.find({}, "auction status").lean();
    const have = new Set(existing.map((s) => String(s.auction)));

    const auctions = await Auction.find({
        status: { $in: ["sold", "sold_buy_now"] },
        winner: { $ne: null },
        endDate: { $gte: since },
    })
        .populate("winner", USER_FIELDS)
        .populate("seller", USER_FIELDS);

    let created = 0;
    for (const auction of auctions) {
        if (have.has(String(auction._id))) continue;
        if (!auction.winner || !auction.seller) continue;
        try {
            await createSaleFromAuction(auction);
            created += 1;
        } catch (err) {
            if (err?.code !== 11000) console.error(`Could not create sale for auction ${auction._id}:`, err.message);
        }
    }

    // Safety net for payments the auction hook missed.
    const unpaid = existing.filter((e) => ["sold", "request_sent", "failed"].includes(e.status)).map((e) => e.auction);
    const paidAuctions = await Auction.find(
        { _id: { $in: unpaid }, paymentStatus: "completed" },
        "_id paymentDate paymentMethod transactionId",
    ).lean();
    let markedPaid = 0;
    for (const a of paidAuctions) {
        const sale = await markSalePaidFromAuction(a);
        if (sale?.status === "paid") markedPaid += 1;
    }

    // Records made before card eligibility was tracked.
    const untagged = await Sale.find({ "payment.cardCheckoutAvailable": { $exists: false } }, "itemPrice currency");
    for (const s of untagged) {
        s.set("payment.cardCheckoutAvailable", isCardCheckoutAvailable(s.itemPrice, s.currency));
        await s.save();
    }

    const { matched: paymentsMatched } = await matchOutsideStripePayments();
    const { ibansAdded } = await fillMissingIbans({ limit: ibanLimit });
    const sellersChecked = await refreshOpenSellerAccounts({ limit: 10 });
    return { created, markedPaid, ibansAdded, sellersChecked };
};

// ─── VAT decisions ─────────────────────────────────────────

export const setVatDecision = async (sale, { treatment, rate, note, itemRegion, buyerRegion }, admin) => {
    if (["paid", "collected", "payout_due", "paid_out"].includes(sale.status)) {
        throw Object.assign(new Error("VAT cannot be changed after payment has been received"), { status: 400 });
    }
    if (itemRegion !== undefined) sale.vat.itemRegion = itemRegion || null;
    if (buyerRegion !== undefined) sale.buyer.region = buyerRegion || null;
    if (treatment === "clear") {
        sale.vat.override = { treatment: null };
    } else if (treatment) {
        if (!note?.trim()) {
            throw Object.assign(new Error("Add a note explaining the VAT decision"), { status: 400 });
        }
        sale.vat.override = {
            treatment,
            rate: treatment === "standard" && rate !== undefined && rate !== "" ? Number(rate) : undefined,
            note: note.trim(),
            by: admin._id,
            at: new Date(),
        };
    }
    applyVat(sale);
    sale.notes.push({
        text: `VAT: ${sale.vat.treatment}${sale.vat.treatment === "standard" ? ` ${sale.vat.rate}%` : ""}${note ? ` — ${note.trim()}` : ""}`,
        by: admin._id,
    });
    sale.markModified("vat");
    await sale.save();
    return sale;
};

// ─── Stripe bank transfer ──────────────────────────────────

const bankTransferOptions = (currency) =>
    currency === "GBP"
        ? { type: "gb_bank_transfer" }
        : { type: "eu_bank_transfer", eu_bank_transfer: { country: "IE" } };

const fromFinancialAddresses = (addresses = [], type, reference) => {
    const iban = addresses.find((f) => f.type === "iban")?.iban;
    const sort = addresses.find((f) => f.type === "sort_code")?.sort_code;
    if (!iban && !sort) return null;
    return {
        type,
        iban: iban?.iban,
        bic: iban?.bic,
        country: iban?.country,
        sortCode: sort?.sort_code,
        accountNumber: sort?.account_number,
        accountHolderName: iban?.account_holder_name || sort?.account_holder_name,
        reference,
    };
};

export const instructionsFromPaymentIntent = (pi) => {
    const ins = pi?.next_action?.display_bank_transfer_instructions;
    if (!ins) return null;
    return fromFinancialAddresses(ins.financial_addresses, ins.type, ins.reference);
};

export const instructionsFromFunding = (fi) =>
    fromFinancialAddresses(fi?.bank_transfer?.financial_addresses, fi?.bank_transfer?.type, undefined);

const hasBankDetails = (sale) => !!(sale.stripe?.bankTransfer?.iban || sale.stripe?.bankTransfer?.accountNumber);

/**
 * Switches on bank transfer for the buyer in Stripe (the same as "Enable bank
 * transfer" on the customer in the Stripe Dashboard) and stores their unique
 * IBAN on the sale, so it shows in admin before anything is sent.
 */
export const ensureBuyerIban = async (sale) => {
    if (hasBankDetails(sale)) return sale;
    try {
        const customerId = sale.stripe?.customerId || (await ensureStripeCustomer(sale));
        const fi = await stripe.customers.createFundingInstructions(customerId, {
            currency: sale.currency.toLowerCase(),
            funding_type: "bank_transfer",
            bank_transfer: bankTransferOptions(sale.currency),
        });
        const details = instructionsFromFunding(fi);
        if (!details) throw new Error("Stripe returned no bank details");
        sale.set("stripe.customerId", customerId);
        sale.set("stripe.bankTransfer", details);
        sale.set("stripe.ibanAddedAt", new Date());
        sale.set("stripe.ibanError", undefined);
        sale.notes.push({ text: `Bank transfer enabled in Stripe for ${customerId}` });
    } catch (err) {
        console.error(`Could not get IBAN for sale ${sale.reference}:`, err.message);
        sale.set("stripe.ibanError", err.message);
    }
    await sale.save();
    return sale;
};

/** Fetches IBANs for unsent sales that do not have one yet. */
export const fillMissingIbans = async ({ limit = 25 } = {}) => {
    const sales = await Sale.find({
        status: { $in: ["sold", "request_sent"] },
        historical: { $ne: true },
        "stripe.bankTransfer.iban": { $in: [null, ""] },
        "stripe.bankTransfer.accountNumber": { $in: [null, ""] },
    })
        .sort({ saleDate: -1 })
        .limit(limit);
    let added = 0;
    for (const sale of sales) {
        await ensureBuyerIban(sale);
        if (hasBankDetails(sale)) added += 1;
    }
    return { ibansAdded: added, ibansMissing: sales.length - added };
};

const ensureStripeCustomer = async (sale) => {
    const buyer = await User.findById(sale.buyer.user).select(USER_FIELDS);
    if (!buyer) throw new Error("Buyer account no longer exists");
    if (buyer.stripeCustomerId) return buyer.stripeCustomerId;
    const customer = await stripe.customers.create({
        email: buyer.email,
        name: personName(buyer),
        metadata: { userId: String(buyer._id) },
    });
    buyer.stripeCustomerId = customer.id;
    await buyer.save({ validateBeforeSave: false });
    return customer.id;
};

/**
 * Makes sure the sale has an open Stripe bank-transfer PaymentIntent for the
 * current total, and copies the buyer's unique IBAN and reference onto it.
 */
export const ensureBankTransferIntent = async (sale) => {
    const amount = Math.round(sale.total * 100);
    const customerId = sale.stripe?.customerId || (await ensureStripeCustomer(sale));

    if (sale.stripe?.paymentIntentId) {
        const existing = await stripe.paymentIntents.retrieve(sale.stripe.paymentIntentId);
        if (existing.status === "succeeded") return existing;
        if (existing.amount === amount && existing.status === "requires_action") {
            sale.set("stripe.customerId", customerId);
            sale.set("stripe.bankTransfer", instructionsFromPaymentIntent(existing));
            return existing;
        }
        // Total changed (e.g. VAT decision) – replace the old request.
        if (existing.status !== "canceled" && (existing.amount_received || 0) === 0) {
            await stripe.paymentIntents.cancel(existing.id);
        } else if ((existing.amount_received || 0) > 0) {
            throw Object.assign(
                new Error("The buyer has already paid part of this request in Stripe; resolve it in Stripe first"),
                { status: 409 },
            );
        }
    }

    const pi = await stripe.paymentIntents.create(
        {
            amount,
            currency: sale.currency.toLowerCase(),
            customer: customerId,
            payment_method_types: ["customer_balance"],
            payment_method_data: { type: "customer_balance" },
            payment_method_options: {
                customer_balance: {
                    funding_type: "bank_transfer",
                    bank_transfer: bankTransferOptions(sale.currency),
                },
            },
            confirm: true,
            description: `${sale.reference} ${sale.title}`.slice(0, 200),
            metadata: {
                source: "sale_payment_request",
                saleId: String(sale._id),
                auctionId: String(sale.auction),
                reference: sale.reference,
            },
        },
        { idempotencyKey: `sale-${sale._id}-${amount}-${sale.documents.length}` },
    );

    sale.set("stripe.customerId", customerId);
    sale.set("stripe.paymentIntentId", pi.id);
    sale.set("stripe.paymentIntentAmount", amount);
    sale.set("stripe.bankTransfer", instructionsFromPaymentIntent(pi));
    return pi;
};

// ─── Payment requests ──────────────────────────────────────

export const paymentRequestSnapshot = (sale, issueDate = new Date()) => ({
    reference: sale.reference,
    issueDate,
    dueDate: new Date(issueDate.getTime() + PAYMENT_DUE_HOURS * 3600 * 1000),
    saleDate: sale.saleDate,
    title: sale.title,
    currency: sale.currency,
    buyer: {
        name: sale.buyer.name,
        companyName: sale.buyer.companyName,
        addressLines: sale.buyer.addressLines,
        email: sale.buyer.email,
        phone: sale.buyer.phone,
        vatNumber: sale.buyer.vatNumber,
    },
    seller: {
        displayName: sale.seller.companyName || sale.seller.name || sale.seller.username,
        vatNumber: sale.seller.vatNumber,
    },
    itemPrice: sale.itemPrice,
    vat: {
        rate: sale.vat.rate,
        amount: sale.vat.amount,
        treatment: sale.vat.treatment,
        note: sale.vat.treatment === "zero_rated" ? "Zero-rated cross-border supply between VAT-registered businesses." : undefined,
    },
    buyerFee: sale.buyerFee,
    buyerFeeDescription: sale.buyerFeeDescription,
    total: sale.total,
    cardPayUrl: sale.payment?.cardCheckoutAvailable ? cardCheckoutUrl(sale.auction) : undefined,
    bank: sale.stripe?.bankTransfer
        ? {
            accountHolderName: sale.stripe.bankTransfer.accountHolderName,
            iban: sale.stripe.bankTransfer.iban,
            bic: sale.stripe.bankTransfer.bic,
            sortCode: sale.stripe.bankTransfer.sortCode,
            accountNumber: sale.stripe.bankTransfer.accountNumber,
            reference: sale.stripe.bankTransfer.reference,
        }
        : null,
});

/**
 * Issues (or re-issues) the payment request for one sale: Stripe IBAN,
 * PDF, email to the buyer, and a record in the buyer's and admin's documents.
 */
export const issuePaymentRequest = async (saleId, admin, { sendEmail = true } = {}) => {
    const sale = await Sale.findById(saleId);
    if (!sale) throw Object.assign(new Error("Sale not found"), { status: 404 });
    if (!["sold", "request_sent"].includes(sale.status)) {
        throw Object.assign(new Error(`Sale is already ${sale.status.replace("_", " ")}`), { status: 400 });
    }
    if (sale.vat.reviewRequired) {
        throw Object.assign(new Error("VAT needs reviewing before this request can be sent"), { status: 400 });
    }
    if (!sale.buyer?.email) {
        throw Object.assign(new Error("Buyer has no email address"), { status: 400 });
    }

    const pi = await ensureBankTransferIntent(sale);
    if (pi.status === "succeeded") {
        await sale.save();
        await recordPayment(pi);
        throw Object.assign(new Error("Stripe shows this sale as already paid"), { status: 409 });
    }
    if (!sale.stripe?.bankTransfer?.iban && !sale.stripe?.bankTransfer?.accountNumber) {
        throw new Error("Stripe did not return bank details for this buyer");
    }

    const issueDate = new Date();
    const snapshot = paymentRequestSnapshot(sale, issueDate);
    const pdf = await renderPaymentRequestPdf(snapshot);

    // Previous requests stay on file but are marked as replaced.
    for (const d of sale.documents) {
        if (d.type === "payment_request" && !d.supersededAt) d.supersededAt = issueDate;
    }
    const version = sale.documents.filter((d) => d.type === "payment_request").length + 1;
    const doc = {
        type: "payment_request",
        number: version > 1 ? `${sale.reference}-PR${version}` : `${sale.reference}-PR`,
        total: sale.total,
        currency: sale.currency,
        issuedAt: issueDate,
        issuedBy: admin?._id,
        snapshot,
    };

    if (sendEmail) {
        const ok = await paymentRequestEmail(sale, snapshot, pdf, `${doc.number}.pdf`);
        if (ok) {
            doc.emailedTo = sale.buyer.email;
            doc.emailedAt = new Date();
        } else {
            doc.emailError = "Email failed to send";
        }
    }

    sale.documents.push(doc);
    sale.status = "request_sent";
    sale.set("payment.dueAt", snapshot.dueDate);
    sale.notes.push({ text: `Payment request ${doc.number} issued${doc.emailedAt ? ` and emailed to ${doc.emailedTo}` : ""}`, by: admin?._id });
    await sale.save();

    return { sale, emailed: !!doc.emailedAt };
};

/**
 * Keeps sellers' Stripe payout-account status fresh (at most hourly) for sales
 * that still need paying out, linking existing connected accounts by email.
 */
export const refreshOpenSellerAccounts = async ({ limit = 10 } = {}) => {
    // Earlier sales too: their sellers may have been set up by hand in Stripe.
    const sellerIds = await Sale.distinct("seller.user", {
        status: { $in: ["sold", "request_sent", "paid", "collected", "payout_due"] },
    });
    const stale = await User.find({
        _id: { $in: sellerIds },
        "stripeConnect.payoutsEnabled": { $ne: true },
        $or: [{ "stripeConnect.checkedAt": null }, { "stripeConnect.checkedAt": { $lt: new Date(Date.now() - 3600 * 1000) } }],
    }).limit(limit);
    const { refreshSellerConnect } = await import("./connectService.js");
    for (const u of stale) await refreshSellerConnect(u);
    return stale.length;
};

/**
 * Sends the buyer their receipt as soon as a sale is paid. Earlier (imported)
 * sales are left alone. Never throws: a failed receipt must not undo a payment.
 */
export const autoIssueReceipt = async (sale) => {
    if (!sale || sale.historical || sale.status !== "paid") return;
    const { issueBuyerReceipt, issueSellerStatement } = await import("./saleLifecycleService.js");
    if (!sale.documents?.some((d) => d.type === "buyer_receipt")) {
        try {
            await issueBuyerReceipt(sale._id, null);
        } catch (err) {
            console.error(`Automatic receipt for ${sale.reference} failed:`, err.message);
        }
    }
    // The seller's "buyer has paid" email: statement plus buyer contact.
    if (!sale.documents?.some((d) => d.type === "seller_statement")) {
        try {
            await issueSellerStatement(sale._id, null, { context: "paid" });
        } catch (err) {
            console.error(`Automatic seller statement for ${sale.reference} failed:`, err.message);
        }
    }
};

// ─── Payments received (Stripe webhook) ────────────────────

export const recordPartialFunding = async (pi) => {
    const sale = await Sale.findOne({ "stripe.paymentIntentId": pi.id });
    if (!sale) return null;
    const remaining = pi.next_action?.display_bank_transfer_instructions?.amount_remaining;
    if (remaining !== undefined) sale.set("stripe.amountReceived", (pi.amount - remaining) / 100);
    sale.notes.push({ text: `Part payment received in Stripe: ${sale.stripe.amountReceived} ${sale.currency} of ${sale.total}` });
    await sale.save();
    return sale;
};

/** Marks a sale paid when its Stripe PaymentIntent succeeds. Idempotent. */
export const recordPayment = async (pi) => {
    const sale =
        (await Sale.findOne({ "stripe.paymentIntentId": pi.id })) ||
        (pi.metadata?.saleId ? await Sale.findById(pi.metadata.saleId) : null);
    if (!sale) return null;
    if (!["sold", "request_sent", "failed"].includes(sale.status)) return sale;
    if (sale.status === "failed") sale.notes.push({ text: "Payment arrived after the sale was marked failed" });

    sale.status = "paid";
    const received = (pi.amount_received || pi.amount) / 100;
    sale.set("stripe.amountReceived", received);
    sale.set("payment.paidAt", new Date());
    sale.set("payment.method", "bank_transfer");
    sale.set("payment.amount", received);
    sale.set("payment.transactionId", pi.id);
    sale.set("collection.dueBy", addWorkingDays(new Date(), COLLECTION_WORKING_DAYS));
    sale.notes.push({ text: `Payment of ${sale.payment.amount} ${sale.currency} received via Stripe (${pi.id})` });
    await sale.save();
    await autoIssueReceipt(sale);

    // Keep the auction's own payment fields in step (save() fires the GA4 hook).
    const auction = await Auction.findById(sale.auction).populate("seller").populate("winner");
    if (auction && auction.paymentStatus !== "completed") {
        const paid = { paymentStatus: "completed", paymentMethod: "bank_transfer", paymentDate: new Date(), transactionId: pi.id };
        try {
            Object.assign(auction, paid);
            await auction.save();
        } catch (e) {
            // Never lose a payment because an old listing fails validation.
            console.error(`Auction ${auction._id} save failed after payment, updating directly:`, e.message);
            await Auction.updateOne({ _id: auction._id }, { $set: paid });
        }
        // Buyer receipt and seller statement are sent by autoIssueReceipt above,
        // in place of the generic payment emails.
    }
    return sale;
};

// ─── Payments made outside the Sales page ──────────────────

const METHOD_FROM_PI = (pi) => (pi.payment_method_types || []).includes("customer_balance") && !(pi.payment_method_types || []).includes("card")
    ? "bank_transfer"
    : (pi.payment_method_types || []).includes("card") ? "credit_card" : "bank_transfer";

/**
 * Records a payment that didn't come through a Sales-page request: a
 * payment request made by hand in the Stripe Dashboard, a transfer to the
 * RexBid bank account, cash, etc. Marks the sale and the auction paid and,
 * unless told not to, sends the receipt and the seller's statement.
 */
export const recordOutsidePayment = async (saleId, { method, reference, paidAt, amount, note, sendDocuments = true }, admin = null) => {
    const sale = await Sale.findById(saleId);
    if (!sale) throw Object.assign(new Error("Sale not found"), { status: 404 });
    if (!["sold", "request_sent", "failed"].includes(sale.status)) {
        throw Object.assign(new Error(`This sale is already ${sale.status.replace("_", " ")}`), { status: 400 });
    }
    const allowed = ["bank_transfer", "credit_card", "other"];
    if (!allowed.includes(method)) throw Object.assign(new Error("Choose how it was paid"), { status: 400 });
    const paid = amount === undefined || amount === "" ? sale.total : round2(Number(amount));
    if (!(paid > 0)) throw Object.assign(new Error("Enter the amount received"), { status: 400 });
    if (paid !== sale.total && !note?.trim()) {
        throw Object.assign(new Error(`The amount differs from the ${sale.total.toFixed(2)} ${sale.currency} due; add a note`), { status: 400 });
    }
    const when = paidAt ? new Date(paidAt) : new Date();
    if (Number.isNaN(when.getTime()) || when > new Date(Date.now() + 86400e3)) {
        throw Object.assign(new Error("Enter a valid payment date"), { status: 400 });
    }

    // Withdraw any unpaid Sales-page request so the buyer can't pay twice.
    const openPi = sale.stripe?.paymentIntentId;
    if (openPi && openPi !== reference) {
        try {
            const pi = await stripe.paymentIntents.retrieve(openPi);
            if (["requires_action", "requires_payment_method"].includes(pi.status) && !(pi.amount_received > 0)) {
                await stripe.paymentIntents.cancel(openPi);
                sale.notes.push({ text: `Unused payment request ${openPi} cancelled in Stripe`, by: admin?._id });
            }
        } catch (err) {
            sale.notes.push({ text: `Could not cancel payment request ${openPi}: ${err.message}`, by: admin?._id });
        }
    }

    sale.status = "paid";
    sale.set("payment.paidAt", when);
    sale.set("payment.method", method);
    sale.set("payment.amount", paid);
    if (reference?.trim()) sale.set("payment.transactionId", reference.trim());
    // Collection is counted from when we confirm payment, not when it arrived.
    sale.set("collection.dueBy", addWorkingDays(new Date(), COLLECTION_WORKING_DAYS));
    sale.notes.push({
        text: `Payment of ${paid} ${sale.currency} recorded (${method.replace("_", " ")}${reference?.trim() ? `, ref ${reference.trim()}` : ""})${note?.trim() ? `: ${note.trim()}` : ""}`,
        by: admin?._id,
    });
    await sale.save();

    // Keep the auction in step. The sale is already paid, so the auction hook
    // won't send anything twice.
    const auction = await Auction.findById(sale.auction);
    if (auction && auction.paymentStatus !== "completed") {
        const fields = { paymentStatus: "completed", paymentMethod: method, paymentDate: when, ...(reference?.trim() ? { transactionId: reference.trim() } : {}) };
        try {
            Object.assign(auction, fields);
            await auction.save();
        } catch {
            await Auction.updateOne({ _id: auction._id }, { $set: fields });
        }
    }

    if (sendDocuments) await autoIssueReceipt(sale);
    return Sale.findById(sale._id);
};

/**
 * Finds Stripe payments for unpaid sales that were requested outside the
 * Sales page (e.g. a payment request made by hand in the Stripe Dashboard):
 * a succeeded payment by the same Stripe customer for exactly the sale total,
 * made on or after the sale date and not already linked to another sale.
 */
export const matchOutsideStripePayments = async ({ limit = 30 } = {}) => {
    // Includes unpaid earlier sales: many of those were requested by hand in Stripe.
    const sales = await Sale.find({ status: { $in: ["sold", "request_sent"] } }).sort({ saleDate: -1 }).limit(limit);
    if (!sales.length) return { matched: 0 };
    const used = new Set((await Sale.distinct("payment.transactionId", { "payment.transactionId": { $ne: null } })).filter(Boolean));
    let matched = 0;
    for (const sale of sales) {
        let customerId = sale.stripe?.customerId;
        if (!customerId) customerId = (await User.findById(sale.buyer.user).select("stripeCustomerId"))?.stripeCustomerId;
        if (!customerId) continue;
        try {
            const cents = Math.round(sale.total * 100);
            const after = Math.floor(new Date(sale.saleDate).getTime() / 1000) - 86400;
            const list = await stripe.paymentIntents.list({ customer: customerId, created: { gte: after }, limit: 20 });
            const hits = list.data.filter(
                (pi) =>
                    pi.status === "succeeded" &&
                    pi.amount_received === cents &&
                    pi.currency === sale.currency.toLowerCase() &&
                    !used.has(pi.id) &&
                    (!pi.metadata?.saleId || pi.metadata.saleId === String(sale._id)) &&
                    // Card checkout payments are linked through the auction already.
                    !(pi.metadata?.auctionId && pi.metadata.auctionId !== String(sale.auction)),
            );
            if (hits.length !== 1) {
                if (hits.length > 1) console.warn(`Sale ${sale.reference}: ${hits.length} possible Stripe payments, not matching automatically`);
                continue;
            }
            const pi = hits[0];
            used.add(pi.id);
            await recordOutsidePayment(sale._id, {
                method: METHOD_FROM_PI(pi),
                reference: pi.id,
                paidAt: new Date(pi.created * 1000),
                note: "Matched automatically to a Stripe payment made outside the Sales page",
                // Earlier sales: record quietly, no receipt or statement emails.
                sendDocuments: !sale.historical,
            });
            matched += 1;
        } catch (err) {
            console.error(`Matching Stripe payments for ${sale.reference} failed:`, err.message);
        }
    }
    return { matched };
};

// ─── Correcting the buyer fee ──────────────────────────────

/**
 * Sets the buyer fee on a sale (and its auction), e.g. for earlier sales that
 * sold before buyer fees were switched on in Admin → Commissions and were
 * charged by hand. Current sales can only be changed before a payment
 * request goes out.
 */
export const setBuyerFee = async (saleOrId, fee, note, admin = null) => {
    const sale = saleOrId?.save ? saleOrId : await Sale.findById(saleOrId);
    if (!sale) throw Object.assign(new Error("Sale not found"), { status: 404 });
    const value = round2(Number(fee));
    if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error("Enter a buyer fee of 0 or more"), { status: 400 });
    if (!sale.historical && !["sold", "failed"].includes(sale.status)) {
        throw Object.assign(new Error("The buyer fee can only be changed before the payment request is sent"), { status: 400 });
    }
    if (value === round2(sale.buyerFee || 0)) return { sale, changed: false };
    const before = sale.buyerFee || 0;
    sale.buyerFee = value;
    applyVat(sale); // recalculates the total
    sale.notes.push({ text: `Buyer fee changed from ${before} to ${value} ${sale.currency}${note?.trim() ? `: ${note.trim()}` : ""}`, by: admin?._id });
    await sale.save();
    await Auction.updateOne({ _id: sale.auction }, { $set: { bidderCommissionAmount: value } });
    return { sale, changed: true };
};

/**
 * Applies buyer fees from a list of { auctionId, fee } (e.g. exported from
 * the finance tracker). Only earlier sales are changed.
 */
export const importBuyerFees = async (rows, admin) => {
    const result = { updated: 0, unchanged: 0, notFound: [], skipped: [] };
    for (const row of rows) {
        const auctionId = String(row?.auctionId || "").trim();
        if (!/^[a-f0-9]{24}$/i.test(auctionId)) continue;
        const sale = await Sale.findOne({ auction: auctionId });
        if (!sale) {
            result.notFound.push(auctionId);
            continue;
        }
        if (!sale.historical) {
            result.skipped.push({ reference: sale.reference, reason: "not an earlier sale" });
            continue;
        }
        try {
            const { changed } = await setBuyerFee(sale, row.fee, "imported from the finance tracker", admin);
            if (changed) result.updated += 1;
            else result.unchanged += 1;
        } catch (err) {
            result.skipped.push({ reference: sale.reference, reason: err.message });
        }
    }
    return result;
};
