import Stripe from "stripe";
import Sale from "../models/sale.model.js";
import CommissionTransfer from "../models/commissionTransfer.model.js";
import { buildLedger, listAll, TRACKING_START } from "./commissionLedgerService.js";
import { dublinTime } from "../utils/closingSlots.js";
import { buildXlsx } from "../utils/xlsx.js";

/**
 * Monthly accounts spreadsheet for the accountant (Admin → Stripe Money →
 * Accounts). One .xlsx with:
 *   Summary         – totals for the month
 *   Income          – every payment into Stripe: commission and fees vs sellers' money
 *   BOI payouts     – every Stripe payout to the bank, split into RexBid's and sellers' money
 *   BOI payout lines– the payments each payout sent through RexBid came from
 *   Stripe fees     – Stripe's monthly charges (Connect, Radar, Invoicing) with VAT
 *   Refunds         – money paid back to buyers
 *   Seller payouts  – sellers paid through Stripe, or from BOI
 * All amounts in euro, as Stripe received them. Dates are Irish time.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const sum = (list, f) => round2(list.reduce((n, x) => n + (Number(f(x)) || 0), 0));
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Dublin" }) : "");
const unix = (d) => Math.floor(d.getTime() / 1000);

export const monthRange = (month) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) throw Object.assign(new Error("Choose a month"), { status: 400 });
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return { start: dublinTime(`${month}-01`, "00:00"), end: dublinTime(`${next}-01`, "00:00") };
};

const TYPE = { sale: "Sale", fee: "RexBid fee", check: "Unmatched: check" };

/** Builds the sheets from plain data (testable without Stripe). */
export const buildPackSheets = ({ month, start, end, ledger, sales, transfers, payouts, stripeFees, refunds, sellerTransfers }) => {
    const inMonth = (d) => d >= start && d < end;
    const saleById = new Map(sales.map((s) => [String(s._id), s]));
    const rowById = new Map(ledger.rows.map((r) => [r.chargeId, r]));
    const sentByCharge = new Map();
    for (const t of transfers) {
        if (t.kind !== "payout") continue;
        for (const i of t.items || []) {
            const prev = sentByCharge.get(i.chargeId) || { amount: 0, payouts: [] };
            prev.amount = round2(prev.amount + i.amount);
            prev.payouts.push(t.payoutId);
            sentByCharge.set(i.chargeId, prev);
        }
    }

    // ── Income ──
    const income = ledger.rows
        .filter((r) => inMonth(new Date(r.created)))
        .sort((a, b) => a.created.localeCompare(b.created))
        .map((r) => {
            const sale = r.saleId ? saleById.get(r.saleId) : null;
            const live = sale && !["failed", "cancelled"].includes(sale.status);
            const rate = sale && sale.currency !== "EUR" && sale.total > 0 ? r.paid / sale.total : 1;
            const buyerCommission = live ? round2((sale.buyerFee || 0) * rate) : 0;
            const sellerCommission = live ? round2((sale.sellerFee || 0) * rate) : 0;
            const sent = sentByCharge.get(r.chargeId);
            return {
                date: day(r.created),
                reference: sale?.reference || "",
                description: sale ? sale.title || "" : r.description,
                type: r.kind === "fee" ? r.description : TYPE[r.kind],
                paid: r.paid,
                stripeFee: r.stripeFee,
                refunded: r.refunded,
                sellerShare: r.sellerShare,
                connectFee: r.connectFee || 0,
                buyerCommission,
                sellerCommission,
                feeIncome: r.kind === "fee" ? r.paid : 0,
                other: r.kind === "check" ? r.paid : 0,
                net: r.rexbidShare,
                sent: sent?.amount || 0,
                payouts: sent ? [...new Set(sent.payouts)].join(", ") : r.settled ? "Marked as sent by hand" : "",
                sellerViaBank: r.sellerViaBank,
            };
        });

    // ── BOI payouts ──
    const transferByPayout = new Map(transfers.filter((t) => t.payoutId).map((t) => [t.payoutId, t]));
    const payoutLines = [];
    const boi = payouts
        .filter((p) => inMonth(new Date(p.arrival_date * 1000)))
        .sort((a, b) => a.arrival_date - b.arrival_date)
        .map((p) => {
            const t = transferByPayout.get(p.id);
            let sellers = 0;
            if (t) {
                for (const i of t.items || []) {
                    const r = rowById.get(i.chargeId);
                    const sale = r?.saleId ? saleById.get(r.saleId) : null;
                    const sellerPart = round2(Math.min(i.amount, r?.sellerToBank || 0));
                    sellers = round2(sellers + sellerPart);
                    payoutLines.push([
                        p.id, day(p.created * 1000), r ? day(r.created) : "", sale?.reference || "", r?.description || i.chargeId,
                        i.amount, sellerPart, round2(i.amount - sellerPart),
                    ]);
                }
            }
            const amount = round2(p.amount / 100);
            return {
                row: [
                    day(p.created * 1000), day(p.arrival_date * 1000), amount, p.status, p.description || "", p.id,
                    t ? "Yes" : "No (made outside RexBid)", t ? sellers : "", t ? round2(amount - sellers) : "",
                ],
                amount, sellers: t ? sellers : 0, itemised: !!t,
            };
        });

    // ── Stripe's monthly fees ──
    const fees = stripeFees
        .filter((f) => inMonth(new Date(f.created * 1000)))
        .sort((a, b) => a.created - b.created)
        .map((f) => [day(f.created * 1000), f.description || "", round2(-f.amount / 100), round2(f.fee / 100), round2(-f.net / 100)]);

    // ── Refunds ──
    const refundRows = refunds
        .filter((r) => inMonth(new Date(r.created * 1000)))
        .sort((a, b) => a.created - b.created)
        .map((r) => [day(r.created * 1000), r.metadata?.reference || "", round2(r.amount / 100), (r.currency || "").toUpperCase(), r.status, r.id]);

    // ── Seller payouts ──
    const viaStripe = sellerTransfers
        .filter((t) => inMonth(new Date(t.created * 1000)))
        .sort((a, b) => a.created - b.created)
        .map((t) => [day(t.created * 1000), t.transfer_group || "", t.description || "", "Stripe Connect", round2(t.amount / 100), round2((t.amount_reversed || 0) / 100), t.id]);
    const viaBank = sales
        .filter((s) => s.payout?.method === "bank_transfer" && s.payout?.paidAt && inMonth(new Date(s.payout.paidAt)))
        .map((s) => [day(s.payout.paidAt), s.reference, s.title || "", "Paid from BOI", round2(s.payout.amount || 0), 0, s.payout.reference || ""]);
    const sellerRows = [...viaStripe, ...viaBank];

    // ── Summary ──
    const t = {
        buyerCommission: sum(income, (r) => r.buyerCommission),
        sellerCommission: sum(income, (r) => r.sellerCommission),
        feeIncome: sum(income, (r) => r.feeIncome),
        other: sum(income, (r) => r.other),
        stripeFees: sum(income, (r) => r.stripeFee),
        connect: sum(income, (r) => r.connectFee),
        refunds: sum(refundRows, (r) => r[2]),
        paid: sum(income, (r) => r.paid),
        sellerShare: sum(income, (r) => r.sellerShare),
        net: sum(income, (r) => r.net),
        monthlyEx: sum(fees, (r) => r[2]),
        monthlyVat: sum(fees, (r) => r[3]),
        boi: sum(boi, (b) => b.amount),
        boiSellers: sum(boi, (b) => b.sellers),
        boiNotItemised: sum(boi.filter((b) => !b.itemised), (b) => b.amount),
        sellersStripe: round2(sum(viaStripe, (r) => r[4]) - sum(viaStripe, (r) => r[5])),
        sellersBank: sum(viaBank, (r) => r[4]),
    };
    const summary = [
        [`RexBid accounts: ${month}`, "€"],
        [{ v: "Income (RexBid's)", bold: true }, ""],
        ["Buyer commission", t.buyerCommission],
        ["Seller commission", t.sellerCommission],
        ["Featured / Meta Boost fees", t.feeIncome],
        ["Unmatched payments (check)", t.other],
        [{ v: "Costs", bold: true }, ""],
        ["Stripe processing fees on payments", t.stripeFees],
        ["Stripe Connect fees set aside (estimate; actual bill is under Stripe fees)", t.connect],
        ["Stripe monthly charges billed (ex VAT)", t.monthlyEx],
        ["VAT on Stripe monthly charges", t.monthlyVat],
        ["Refunds to buyers", t.refunds],
        [{ v: "Client money (sellers', not RexBid income)", bold: true }, ""],
        ["Received from buyers in total", t.paid],
        ["Sellers' share of those payments", t.sellerShare],
        ["Paid to sellers through Stripe", t.sellersStripe],
        ["Paid to sellers from BOI", t.sellersBank],
        [{ v: "Money moved from Stripe to BOI", bold: true }, ""],
        ["Total arriving in BOI this month", t.boi],
        ["  of which sellers' money (sales paid from BOI)", t.boiSellers],
        ["  of which made outside RexBid (not itemised)", t.boiNotItemised],
        ["RexBid's net on this month's payments (after Stripe fees, refunds and Connect fees)", t.net],
        ["", ""],
        [{ v: "Notes", bold: true }, ""],
        ["Amounts are in euro as Stripe received them; sterling sales are converted at Stripe's rate.", ""],
        ["Income is shown when the buyer paid. Commission figures include any VAT charged on them.", ""],
        ["Sellers' share is client money held for the seller, not RexBid turnover.", ""],
        ["Stripe's VAT invoices for its fees: Stripe Dashboard → Settings → Documents.", ""],
    ];

    return [
        { name: "Summary", rows: summary, widths: [78, 14], moneyCols: [1] },
        {
            name: "Income",
            rows: [
                ["Date paid", "Reference", "Description", "Type", "Buyer paid", "Stripe fee", "Refunded", "Seller's share (client money)", "Connect fees set aside",
                    "Buyer commission", "Seller commission", "Featured / Meta fee", "Unmatched", "RexBid net", "Sent to BOI", "BOI payout(s)", "Seller paid from BOI"],
                ...income.map((r) => [r.date, r.reference, r.description, r.type, r.paid, r.stripeFee, r.refunded, r.sellerShare, r.connectFee,
                    r.buyerCommission, r.sellerCommission, r.feeIncome, r.other, r.net, r.sent, r.payouts, r.sellerViaBank ? "Yes" : ""]),
            ],
            widths: [12, 14, 36, 26, 12, 11, 11, 16, 14, 14, 14, 14, 12, 12, 12, 34, 12],
            moneyCols: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        },
        {
            name: "BOI payouts",
            rows: [["Sent", "Arrives in BOI", "Amount", "Status", "Description", "Stripe payout ID", "Itemised on RexBid", "Of which sellers' money", "Of which RexBid's"], ...boi.map((b) => b.row)],
            widths: [12, 14, 12, 10, 40, 32, 22, 18, 16],
            moneyCols: [2, 7, 8],
        },
        {
            name: "BOI payout lines",
            rows: [["Stripe payout ID", "Sent", "Payment date", "Reference", "Payment", "Amount sent", "Of which sellers' money", "Of which RexBid's"], ...payoutLines],
            widths: [32, 12, 12, 14, 40, 12, 18, 16],
            moneyCols: [5, 6, 7],
        },
        { name: "Stripe fees", rows: [["Date", "Description", "Fee (ex VAT)", "VAT", "Total"], ...fees], widths: [12, 60, 14, 10, 12], moneyCols: [2, 3, 4] },
        { name: "Refunds", rows: [["Date", "Reference", "Amount", "Currency", "Status", "Stripe refund ID"], ...refundRows], widths: [12, 14, 12, 10, 16, 32], moneyCols: [2] },
        {
            name: "Seller payouts",
            rows: [["Date", "Reference", "Description", "How", "Amount", "Reversed", "Stripe transfer / bank ref"], ...sellerRows],
            widths: [12, 14, 40, 16, 12, 12, 32],
            moneyCols: [4, 5],
        },
    ];
};

export const buildMonthlyPack = async (month) => {
    const { start, end } = monthRange(month);
    const since = unix(new Date(Math.min(start.getTime(), TRACKING_START.getTime())));
    const range = { gte: unix(start), lt: unix(end) };
    const [charges, balanceTxns, sales, transfers, payouts, stripeFees, refunds, sellerTransfers] = await Promise.all([
        listAll(stripe.charges, { created: { gte: since } }),
        listAll(stripe.balanceTransactions, { created: { gte: since } }),
        Sale.find({}, "reference title status currency itemPrice vat sellerFee buyerFee total auction payment payout stripe").lean(),
        CommissionTransfer.find({}).lean(),
        listAll(stripe.payouts, { arrival_date: range }),
        listAll(stripe.balanceTransactions, { type: "stripe_fee", created: range }),
        listAll(stripe.refunds, { created: range }),
        listAll(stripe.transfers, { created: range }),
    ]);
    const ledger = buildLedger({ charges, balanceTxns, sales, transfers });
    const sheets = buildPackSheets({ month, start, end, ledger, sales, transfers, payouts, stripeFees, refunds, sellerTransfers });
    return buildXlsx(sheets);
};
