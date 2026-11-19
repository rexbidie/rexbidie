import crypto from "crypto";
import Stripe from "stripe";
import Sale from "../models/sale.model.js";
import CommissionTransfer from "../models/commissionTransfer.model.js";
import { netPayout } from "./payoutService.js";
import { BUFFER_EUR } from "./stripeMoneyService.js";

/**
 * Commission, payment by payment.
 *
 * Every Stripe payment since COMMISSION_TRACKING_START is split into the
 * seller's share (what the seller is paid for that sale) and RexBid's share
 * (everything else, after Stripe's fee and any refund). Featured / Meta fees
 * are all RexBid's. Once a payment has cleared, RexBid's share can be sent to
 * the bank; what's been sent is recorded per payment so it's never sent twice.
 *
 * Payments that can't be matched (e.g. an auction not on the Sales page) show
 * as "check" and are never sent automatically; an admin can set them aside.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const TRACKING_START = new Date(process.env.COMMISSION_TRACKING_START || "2026-11-10T00:00:00Z");
const REXBID_ONLY = new Set(["listing_extras", "listing_extras_prepaid", "listing_promotion", "seller_commission", "bid_commission", "final_commission"]);
const SETTLED_SALE = ["failed", "cancelled"];

// Stripe Connect fees for paying a seller through Stripe, billed to RexBid
// monthly plus VAT: 0.25% of the payout, about €0.10 per bank payout and €2
// per seller account paid that month (set aside per sale, so it's never short).
const num = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
export const CONNECT_FEES = {
    pct: num(process.env.CONNECT_FEE_PCT, 0.0025),
    perPayout: num(process.env.CONNECT_FEE_PER_PAYOUT, 0.1),
    activeAccount: num(process.env.CONNECT_FEE_ACTIVE_ACCOUNT, 2),
    vat: num(process.env.CONNECT_FEE_VAT, 0.23),
};
// Payments over this are paid to the seller from BOI instead (no Connect fees),
// so the seller's share goes to BOI along with RexBid's.
export const BANK_PAYOUT_OVER = num(process.env.BANK_PAYOUT_OVER, 15000);

export const connectFeeFor = (sellerAmount, f = CONNECT_FEES) =>
    sellerAmount > 0 ? round2((sellerAmount * f.pct + f.perPayout + f.activeAccount) * (1 + f.vat)) : 0;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const idOf = (v) => (v && typeof v === "object" ? v.id : v) || null;

export const listAll = async (resource, params) => {
    const out = [];
    let starting_after;
    for (let page = 0; page < 30; page++) {
        const res = await resource.list({ ...params, limit: 100, ...(starting_after ? { starting_after } : {}) });
        out.push(...res.data);
        if (!res.has_more || !res.data.length) break;
        starting_after = res.data.at(-1).id;
    }
    return out;
};

const KIND_LABEL = {
    listing_extras: "Featured / Meta fee",
    listing_extras_prepaid: "Featured / Meta fee",
    listing_promotion: "Feature this ad / Meta Boost",
    seller_commission: "Seller commission",
    bid_commission: "Buyer commission",
    final_commission: "Commission",
};

/** Splits each payment into seller's and RexBid's share. Plain data in, so it can be tested. */
export const buildLedger = ({ charges, balanceTxns, sales, transfers, now = new Date() }) => {
    const nowUnix = Math.floor(now.getTime() / 1000);
    const txnById = new Map(balanceTxns.map((t) => [t.id, t]));
    const saleByPi = new Map();
    const saleById = new Map();
    const saleByAuction = new Map();
    for (const s of sales) {
        saleById.set(String(s._id), s);
        if (s.auction) saleByAuction.set(String(s.auction), s);
        for (const pi of [s.payment?.transactionId, s.stripe?.paymentIntentId]) if (String(pi || "").startsWith("pi_")) saleByPi.set(pi, s);
    }
    const sent = new Map();
    for (const t of transfers) for (const i of t.items || []) {
        const prev = sent.get(i.chargeId) || { amount: 0, settled: false };
        sent.set(i.chargeId, { amount: prev.amount + i.amount, settled: prev.settled || t.kind === "marked" });
    }

    const rows = [];
    for (const c of charges) {
        if (c.status !== "succeeded" || !c.paid) continue;
        const txn = txnById.get(idOf(c.balance_transaction));
        if (!txn) continue;
        const m = c.metadata || {};
        const kind = m.type || m.source || "";
        const sale = saleByPi.get(idOf(c.payment_intent)) || (m.saleId && saleById.get(m.saleId)) || (m.auctionId && kind !== "listing_extras" && kind !== "listing_extras_prepaid" && kind !== "listing_promotion" ? saleByAuction.get(m.auctionId) : null);

        // What RexBid actually holds from this payment, in euro.
        const rate = c.amount > 0 ? txn.amount / c.amount : 1; // payment currency → euro
        const refunded = round2(((c.amount_refunded || 0) * rate) / 100);
        const net = round2(txn.net / 100 - refunded);
        const fee = round2(txn.fee / 100);

        let description;
        let sellerShare = 0;
        let connectFee = 0;
        let sellerViaBank = false;
        let shortfall = 0;
        let known = true;
        if (sale) {
            description = `${sale.reference} ${sale.title || ""}`.trim();
            if (!SETTLED_SALE.includes(sale.status)) {
                const saleRate = sale.currency === "EUR" ? 1 : sale.total > 0 ? txn.amount / Math.round(sale.total * 100) : rate;
                sellerShare = round2(netPayout(sale) * saleRate);
                // Big sales (or ones already paid from the bank) go to the seller from BOI.
                const method = sale.payout?.method;
                sellerViaBank = method === "bank_transfer" || (method !== "stripe_connect" && txn.amount / 100 > BANK_PAYOUT_OVER);
                connectFee = sellerViaBank ? 0 : connectFeeFor(sellerShare);
                // Buyer paid less than the sale total (e.g. VAT not charged at card checkout).
                const expected = round2((sale.total || 0) * saleRate);
                if (expected - txn.amount / 100 > 0.5) shortfall = round2(expected - txn.amount / 100);
            }
        } else if (REXBID_ONLY.has(kind)) {
            description = KIND_LABEL[kind] || "RexBid fee";
        } else {
            description = (c.description || "Payment").slice(0, 80);
            known = false;
        }

        const share = known ? Math.max(0, round2(net - sellerShare - connectFee)) : null;
        // Sent to BOI: RexBid's share, plus the seller's when they're paid from BOI.
        const sellerToBank = sellerViaBank ? sellerShare : 0;
        const s = sent.get(c.id) || { amount: 0, settled: false };
        const toSend = known && !s.settled ? Math.max(0, round2(share + sellerToBank - s.amount)) : 0;
        rows.push({
            chargeId: c.id,
            created: new Date(c.created * 1000).toISOString(),
            description,
            saleId: sale ? String(sale._id) : null,
            kind: sale ? "sale" : known ? "fee" : "check",
            paid: round2(txn.amount / 100),
            stripeFee: fee,
            refunded,
            sellerShare,
            connectFee,
            shortfall,
            sellerViaBank,
            sellerToBank,
            rexbidShare: share,
            alreadySent: round2(s.amount),
            settled: s.settled,
            toSend,
            availableOn: new Date(txn.available_on * 1000).toISOString(),
            cleared: txn.available_on <= nowUnix,
        });
    }
    rows.sort((a, b) => a.availableOn.localeCompare(b.availableOn) || a.created.localeCompare(b.created));

    const days = new Map();
    for (const r of rows) {
        const k = r.availableOn.slice(0, 10);
        const d = days.get(k) || { date: k, cleared: r.cleared, toSend: 0, forSellersViaBank: 0, payments: 0 };
        d.toSend = round2(d.toSend + r.toSend);
        if (r.toSend > 0) d.forSellersViaBank = round2(d.forSellersViaBank + Math.min(r.toSend, r.sellerToBank));
        d.payments += 1;
        days.set(k, d);
    }
    const readyNow = round2(rows.filter((r) => r.cleared).reduce((n, r) => n + r.toSend, 0));
    return {
        rows,
        days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
        readyNow,
        readyForSellersViaBank: round2(rows.filter((r) => r.cleared && r.toSend > 0).reduce((n, r) => n + Math.min(r.toSend, r.sellerToBank), 0)),
        connectFees: CONNECT_FEES,
        bankPayoutOver: BANK_PAYOUT_OVER,
        toCheck: rows.filter((r) => r.kind === "check" && !r.settled).length,
    };
};

export const getCommissionLedger = async ({ now = new Date() } = {}) => {
    const since = Math.floor(TRACKING_START.getTime() / 1000);
    const [balance, charges, balanceTxns, sales, transfers] = await Promise.all([
        stripe.balance.retrieve(),
        listAll(stripe.charges, { created: { gte: since } }),
        listAll(stripe.balanceTransactions, { created: { gte: since } }),
        Sale.find({}, "reference title status currency itemPrice vat sellerFee buyerFee total auction payment payout stripe saleDate seller.name seller.companyName").lean(),
        CommissionTransfer.find({}).lean(),
    ]);
    const ledger = buildLedger({ charges, balanceTxns, sales, transfers, now });
    const available = (balance.available || []).filter((b) => b.currency === "eur").reduce((n, b) => n + b.amount, 0) / 100;
    ledger.available = round2(available);
    ledger.buffer = BUFFER_EUR;
    ledger.trackingStart = TRACKING_START.toISOString();
    // Never more than Stripe actually has, less the buffer.
    ledger.sendableNow = Math.max(0, Math.min(ledger.readyNow, round2(available - BUFFER_EUR)));
    return ledger;
};

const pickRows = (ledger, chargeIds) => {
    const wanted = new Set(chargeIds || []);
    return ledger.rows.filter((r) => wanted.has(r.chargeId));
};

/** Sends RexBid's share of the chosen cleared payments to the bank, in one payout. */
export const sendCommission = async (chargeIds, admin) => {
    const ledger = await getCommissionLedger();
    const rows = pickRows(ledger, chargeIds).filter((r) => r.cleared && r.toSend > 0);
    if (!rows.length) throw Object.assign(new Error("Choose cleared payments with commission to send"), { status: 400 });
    const amount = round2(rows.reduce((n, r) => n + r.toSend, 0));
    if (amount > ledger.available - ledger.buffer) {
        throw Object.assign(new Error(`Stripe only has €${ledger.available.toFixed(2)} available (and €${ledger.buffer} is kept back)`), { status: 400 });
    }
    const cents = Math.round(amount * 100);
    const key = crypto.createHash("sha256").update(rows.map((r) => `${r.chargeId}:${r.toSend}`).sort().join(",")).digest("hex").slice(0, 32);
    const payout = await stripe.payouts.create(
        {
            amount: cents,
            currency: "eur",
            description: `RexBid commission (${rows.length} payment${rows.length === 1 ? "" : "s"})`,
            statement_descriptor: "REXBID COMMISSION",
            metadata: { source: "stripe_money_page", payments: String(rows.length) },
        },
        { idempotencyKey: `commission-${key}` },
    );
    await CommissionTransfer.create({
        kind: "payout",
        payoutId: payout.id,
        amount,
        items: rows.map((r) => ({ chargeId: r.chargeId, amount: r.toSend })),
        by: admin?._id,
    });
    return { id: payout.id, amount, payments: rows.length, arrivalDate: new Date(payout.arrival_date * 1000).toISOString() };
};

/**
 * Marks payments as already dealt with: commission sent by hand before this
 * page, or a payment to set aside (e.g. not a RexBid sale). Nothing moves.
 */
export const markCommissionSent = async (chargeIds, note, admin) => {
    if (!note?.trim()) throw Object.assign(new Error("Add a note, e.g. \"sent by hand before 19 Nov\""), { status: 400 });
    const ledger = await getCommissionLedger();
    const rows = pickRows(ledger, chargeIds).filter((r) => !r.settled);
    if (!rows.length) throw Object.assign(new Error("Nothing to mark"), { status: 400 });
    const items = rows.map((r) => ({ chargeId: r.chargeId, amount: r.toSend }));
    await CommissionTransfer.create({ kind: "marked", amount: round2(items.reduce((n, i) => n + i.amount, 0)), note: note.trim(), items, by: admin?._id });
    return { marked: rows.length };
};
