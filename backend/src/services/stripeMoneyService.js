import Stripe from "stripe";
import Sale from "../models/sale.model.js";
import { netPayout } from "./payoutService.js";
import { getCachedRates } from "../routes/currency.route.js";

/**
 * Stripe money: how much of the Stripe balance is RexBid's (commission,
 * Featured / Meta fees) and can be sent to the BOI account now, and how much
 * is sellers' money still to be paid out.
 *
 *   Safe to send = available balance
 *                − sellers' money for unpaid-out sales whose payment has cleared
 *                − a buffer for refunds and disputes
 *
 * Sellers' money for payments still pending isn't in the available balance
 * yet, so it isn't held back now; it's held back the day it clears. Sales
 * paid outside Stripe (BOI, cash) never were in Stripe, so they're listed
 * but not held back.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const BUFFER_EUR = 100;
const LOOKBACK_DAYS = 45;
const OPEN_FOR_PAYOUT = ["paid", "collected", "payout_due"];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const dayKey = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

const listAll = async (resource, params) => {
    const out = [];
    let starting_after;
    for (let page = 0; page < 20; page++) {
        const res = await resource.list({ ...params, limit: 100, ...(starting_after ? { starting_after } : {}) });
        out.push(...res.data);
        if (!res.has_more || !res.data.length) break;
        starting_after = res.data.at(-1).id;
    }
    return out;
};

const stripePiId = (sale) =>
    [sale.payment?.transactionId, sale.stripe?.paymentIntentId].find((id) => String(id || "").startsWith("pi_")) || null;

/**
 * Works out the summary from plain data, so it can be tested without Stripe.
 * Amounts in, and out, are euro; Stripe amounts are in cents.
 */
export const summarise = ({ balance, balanceTxns, charges, sales, now = new Date(), buffer = BUFFER_EUR, rates = getCachedRates() }) => {
    const nowUnix = Math.floor(now.getTime() / 1000);
    const eur = (list) => (list || []).filter((b) => b.currency === "eur").reduce((n, b) => n + b.amount, 0) / 100;
    const available = eur(balance?.available);
    const pending = eur(balance?.pending);

    const txnById = new Map(balanceTxns.map((t) => [t.id, t]));
    const chargeByPi = new Map();
    for (const c of charges) {
        if (c.status === "succeeded" && c.payment_intent) chargeByPi.set(typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent.id, c);
    }

    const rows = sales.map((sale) => {
        const net = netPayout(sale);
        const piId = stripePiId(sale);
        const charge = piId ? chargeByPi.get(piId) : null;
        const txn = charge ? txnById.get(typeof charge.balance_transaction === "string" ? charge.balance_transaction : charge.balance_transaction?.id) : null;
        let rate = 1;
        if (sale.currency !== "EUR") {
            rate = txn && sale.total > 0 ? txn.amount / Math.round(sale.total * 100) : Number(rates?.[sale.currency]?.rates?.EUR) || 0;
        }
        const viaStripe = !!piId;
        // A Stripe payment older than the lookback has long cleared.
        const availableOn = viaStripe ? (txn ? txn.available_on : 0) : null;
        return {
            id: String(sale._id),
            reference: sale.reference,
            title: sale.title,
            status: sale.status,
            currency: sale.currency,
            sellerNet: net,
            holdEur: viaStripe ? round2(net * rate) : 0,
            viaStripe,
            availableOn: availableOn ? new Date(availableOn * 1000).toISOString() : null,
            cleared: viaStripe ? availableOn <= nowUnix : null,
            stripeFeeEur: txn ? txn.fee / 100 : null,
            commission: round2((sale.buyerFee || 0) + (sale.sellerFee || 0)),
            _availableOnUnix: availableOn,
        };
    });

    const heldNow = round2(rows.filter((r) => r.viaStripe && r.cleared).reduce((n, r) => n + r.holdEur, 0));
    const safeToSend = Math.max(0, Math.floor((available - heldNow - buffer) * 100) / 100);

    // What clears on each coming day, and how much of it is RexBid's.
    const byDay = new Map();
    for (const t of balanceTxns) {
        if (t.status !== "pending" || t.currency !== "eur" || t.available_on <= nowUnix) continue;
        const k = dayKey(t.available_on);
        const d = byDay.get(k) || { date: k, clears: 0, forSellers: 0 };
        d.clears += t.net / 100;
        byDay.set(k, d);
    }
    for (const r of rows) {
        if (!r.viaStripe || r.cleared || !r._availableOnUnix) continue;
        const k = dayKey(r._availableOnUnix);
        const d = byDay.get(k) || { date: k, clears: 0, forSellers: 0 };
        d.forSellers += r.holdEur;
        byDay.set(k, d);
    }
    const upcoming = [...byDay.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ date: d.date, clears: round2(d.clears), forSellers: round2(d.forSellers), forRexBid: Math.max(0, round2(d.clears - d.forSellers)) }));

    return {
        available: round2(available),
        pending: round2(pending),
        heldForSellers: heldNow,
        heldLater: round2(rows.filter((r) => r.viaStripe && !r.cleared).reduce((n, r) => n + r.holdEur, 0)),
        buffer,
        safeToSend,
        upcoming,
        sales: rows.map(({ _availableOnUnix, ...r }) => r).sort((a, b) => (a.availableOn || "").localeCompare(b.availableOn || "")),
    };
};

export const getStripeMoney = async ({ now = new Date() } = {}) => {
    const since = Math.floor(now.getTime() / 1000) - LOOKBACK_DAYS * 86400;
    const [balance, balanceTxns, charges, sales, payouts] = await Promise.all([
        stripe.balance.retrieve(),
        listAll(stripe.balanceTransactions, { created: { gte: since } }),
        listAll(stripe.charges, { created: { gte: since } }),
        Sale.find({ status: { $in: OPEN_FOR_PAYOUT }, "payout.reference": { $in: [null, ""] } }).lean(),
        stripe.payouts.list({ limit: 10 }),
    ]);
    const summary = summarise({ balance, balanceTxns, charges, sales, now });
    summary.recentBankPayouts = payouts.data.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        currency: p.currency.toUpperCase(),
        status: p.status,
        created: new Date(p.created * 1000).toISOString(),
        arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
        description: p.description || "",
    }));
    return summary;
};

/** Pays out to RexBid's bank (BOI), never more than is safe to send right now. */
export const sendToBank = async (amountInput, admin) => {
    const amount = round2(Number(amountInput));
    if (!(amount > 0)) throw Object.assign(new Error("Enter an amount to send"), { status: 400 });
    const { safeToSend } = await getStripeMoney();
    if (amount > safeToSend) {
        throw Object.assign(new Error(`Only €${safeToSend.toFixed(2)} is safe to send right now`), { status: 400 });
    }
    const cents = Math.round(amount * 100);
    const payout = await stripe.payouts.create(
        {
            amount: cents,
            currency: "eur",
            description: "RexBid commission",
            statement_descriptor: "REXBID COMMISSION",
            metadata: { source: "stripe_money_page", by: String(admin?._id || "") },
        },
        { idempotencyKey: `commission-${cents}-${new Date().toISOString().slice(0, 16)}` },
    );
    console.log(`Commission payout ${payout.id}: €${amount} sent to bank`);
    return { id: payout.id, amount, arrivalDate: new Date(payout.arrival_date * 1000).toISOString(), status: payout.status };
};
