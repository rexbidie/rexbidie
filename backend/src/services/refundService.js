import Stripe from "stripe";
import Sale from "../models/sale.model.js";
import Auction from "../models/auction.model.js";

/**
 * Paying a buyer back when a sale falls through.
 *
 * Card payments go back to the card. Bank-transfer payments go back to the
 * buyer's bank: Stripe emails the buyer for their bank details first (the
 * refund waits as "requires_action" until they reply). Payments made outside
 * Stripe (BOI, cash) are refunded by hand and just recorded here.
 *
 * A full refund marks the sale failed. A seller who has already been paid
 * must be dealt with first, so paid-out sales can't be refunded here.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const REFUNDABLE = ["paid", "collected", "payout_due", "failed"];

const stripePiId = (sale) =>
    [sale.payment?.transactionId, sale.stripe?.paymentIntentId].find((id) => String(id || "").startsWith("pi_")) || null;

/** What can still be refunded: through Stripe, or (paid outside Stripe) recorded by hand. */
export const refundableFor = async (sale) => {
    const piId = stripePiId(sale);
    const refundedByHand = round2((sale.refunds || []).filter((r) => r.method === "manual").reduce((n, r) => n + r.amount, 0));
    if (!piId) {
        const paid = sale.payment?.amount ?? sale.total;
        return { viaStripe: false, currency: sale.currency, max: Math.max(0, round2(paid - refundedByHand)) };
    }
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const received = (pi.amount_received || 0) / 100;
    const refunded = (charge?.amount_refunded || 0) / 100;
    return {
        viaStripe: true,
        paymentIntentId: pi.id,
        bankTransfer: (pi.payment_method_types || []).includes("customer_balance"),
        currency: pi.currency.toUpperCase(),
        max: Math.max(0, round2(received - refunded)),
    };
};

export const refundSale = async (saleId, { amount, reason, reference } = {}, admin) => {
    if (!reason?.trim()) throw fail("Add a reason for the refund");
    const sale = await Sale.findById(saleId);
    if (!sale) throw fail("Sale not found", 404);
    if (sale.status === "paid_out") {
        throw fail("The seller has already been paid. Get the money back from the seller (reverse the transfer in Stripe) before refunding the buyer.");
    }
    if (!REFUNDABLE.includes(sale.status)) throw fail("Only paid sales can be refunded");

    const info = await refundableFor(sale);
    if (!(info.max > 0)) throw fail("Nothing left to refund on this sale");
    const value = amount === undefined || amount === "" ? info.max : round2(Number(amount));
    if (!(value > 0)) throw fail("Enter the amount to refund");
    if (value > info.max) throw fail(`At most ${info.max.toFixed(2)} ${info.currency} can be refunded`);

    const entry = { amount: value, currency: info.currency, reason: reason.trim(), by: admin?._id, at: new Date() };
    if (info.viaStripe) {
        const cents = Math.round(value * 100);
        const refund = await stripe.refunds.create(
            {
                payment_intent: info.paymentIntentId,
                amount: cents,
                reason: "requested_by_customer",
                // Bank transfers: Stripe emails the buyer here for their bank details.
                ...(info.bankTransfer && sale.buyer?.email ? { instructions_email: sale.buyer.email } : {}),
                metadata: { saleId: String(sale._id), reference: sale.reference, source: "sale_refund" },
            },
            { idempotencyKey: `refund-${sale._id}-${cents}-${(sale.refunds || []).length}` },
        );
        Object.assign(entry, { refundId: refund.id, method: info.bankTransfer ? "bank_transfer" : "card", status: refund.status });
    } else {
        if (!reference?.trim()) throw fail("This sale was paid outside Stripe: refund it from the bank, then enter the bank reference here");
        Object.assign(entry, { method: "manual", status: "succeeded", reference: reference.trim() });
    }

    sale.refunds.push(entry);
    const full = value >= info.max;
    sale.notes.push({
        text: `${full ? "Refunded" : "Part refund of"} ${value} ${info.currency} to the buyer (${entry.method === "manual" ? `by hand, ref ${entry.reference}` : `${entry.method.replace("_", " ")}, ${entry.refundId}`}): ${entry.reason}`,
        by: admin?._id,
    });
    if (full && sale.status !== "failed") {
        sale.set("failure", { reason: `Refunded: ${entry.reason}`, previousStatus: sale.status, by: admin?._id, at: new Date() });
        sale.status = "failed";
    }
    await sale.save();
    if (full) await Auction.updateOne({ _id: sale.auction }, { $set: { paymentStatus: "refunded" } });
    return { sale, refund: entry, full };
};

/** Keeps a sale's refund status in step with Stripe (webhook: refund.updated etc.). */
export const recordRefundUpdate = async (refund) => {
    if (!refund?.id) return null;
    const sale = await Sale.findOne({ "refunds.refundId": refund.id });
    if (!sale) return null;
    const entry = sale.refunds.find((r) => r.refundId === refund.id);
    if (entry.status === refund.status) return sale;
    entry.status = refund.status;
    const words = { pending: "on its way to the buyer", succeeded: "paid to the buyer", failed: "failed: refund the buyer outside Stripe", canceled: "cancelled", requires_action: "waiting for the buyer's bank details" };
    sale.notes.push({ text: `Refund ${refund.id} ${words[refund.status] || refund.status}` });
    await sale.save();
    return sale;
};
