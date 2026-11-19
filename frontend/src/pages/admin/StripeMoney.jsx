// Admin → Stripe Money: RexBid's commission payment by payment. Each Stripe
// payment is split into the seller's share and RexBid's share (after Stripe's
// fee); once it clears, RexBid's share can be sent to the BOI account. What's
// been sent is recorded per payment, so nothing is sent twice.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckSquare, Landmark, Loader2, RefreshCw, Send, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { AdminContainer, AdminHeader, AdminSidebar } from "../../components";
import axiosInstance from "../../utils/axiosInstance";

const eur = (n) => `€${Number(n || 0).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (n, cur) => `${cur === "GBP" ? "£" : "€"}${Number(n || 0).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "—");
const STATUS = { paid: "Awaiting collection", collected: "Partly confirmed", payout_due: "Payout due" };
const KIND = { sale: "Sale", fee: "RexBid fee", check: "Check" };

const Tile = ({ label, value, hint, strong }) => (
    <div className={`rounded-xl border p-4 ${strong ? "bg-green-50 border-green-200" : "bg-white"}`}>
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <div className={`mt-1 font-bold ${strong ? "text-3xl text-green-800" : "text-2xl text-gray-900"}`}>{value}</div>
        {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
);

export default function StripeMoney() {
    const [summary, setSummary] = useState(null);
    const [ledger, setLedger] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [busy, setBusy] = useState(false);
    const [showSettled, setShowSettled] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [s, l] = await Promise.all([
                axiosInstance.get("/api/v1/admin/sales/stripe-money"),
                axiosInstance.get("/api/v1/admin/sales/stripe-money/payments"),
            ]);
            setSummary(s.data.data);
            setLedger(l.data.data);
            setSelected(new Set());
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't load Stripe");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const rows = ledger?.rows || [];
    const visible = useMemo(() => rows.filter((r) => showSettled || !(r.settled || (r.kind !== "check" && r.toSend === 0 && r.alreadySent > 0))), [rows, showSettled]);
    const byDay = useMemo(() => {
        const m = new Map();
        for (const r of visible) {
            const k = r.availableOn.slice(0, 10);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
        }
        return [...m.entries()];
    }, [visible]);
    const dayTotals = useMemo(() => new Map((ledger?.days || []).map((d) => [d.date, d])), [ledger]);

    const picked = rows.filter((r) => selected.has(r.chargeId));
    const sendable = picked.filter((r) => r.cleared && r.toSend > 0);
    const sendTotal = sendable.reduce((n, r) => n + r.toSend, 0);
    const selectable = (r) => !r.settled && (r.kind === "check" || r.toSend > 0);

    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleDay = (list) => setSelected((prev) => {
        const ids = list.filter(selectable).map((r) => r.chargeId);
        const all = ids.every((id) => prev.has(id));
        const next = new Set(prev);
        ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
        return next;
    });
    const selectAllReady = () => setSelected(new Set(rows.filter((r) => r.cleared && r.toSend > 0 && !r.settled).map((r) => r.chargeId)));

    const send = async () => {
        if (!sendable.length) return;
        if (!window.confirm(`Send ${eur(sendTotal)} commission from ${sendable.length} payment${sendable.length === 1 ? "" : "s"} to the RexBid bank account (BOI)?`)) return;
        setBusy(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sales/stripe-money/send-commission", { chargeIds: sendable.map((r) => r.chargeId) });
            toast.success(`${eur(data.data.amount)} on its way, due ${day(data.data.arrivalDate)}`, { duration: 6000 });
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't send it");
        } finally {
            setBusy(false);
        }
    };

    const markSent = async () => {
        if (!picked.length) return;
        const note = window.prompt(`Mark ${picked.length} payment${picked.length === 1 ? "" : "s"} as already dealt with (nothing is moved). Note:`, "Commission sent by hand before this page");
        if (!note) return;
        setBusy(true);
        try {
            await axiosInstance.post("/api/v1/admin/sales/stripe-money/mark-sent", { chargeIds: picked.map((r) => r.chargeId), note });
            toast.success("Marked");
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't mark them");
        } finally {
            setBusy(false);
        }
    };

    const today = new Date().toISOString().slice(0, 10);
    const mismatch = summary && summary.heldForSellers > summary.available;

    return (
        <section className="flex min-h-screen bg-gray-50">
            <AdminSidebar />
            <div className="w-full relative">
                <AdminHeader />
                <AdminContainer>
                    <div className="pt-16 md:pt-0 pb-28 max-w-6xl">
                        <div className="flex items-center justify-between gap-3 my-5">
                            <h1 className="text-3xl font-bold">Stripe Money</h1>
                            <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-md border bg-white disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-5">
                            Each payment into Stripe is split into the seller&rsquo;s share and RexBid&rsquo;s share (commission, buyer fee, Featured / Meta fees,
                            after Stripe&rsquo;s fee). Once a payment clears, RexBid&rsquo;s share can go to BOI. Tick the payments and press <strong>Send to BOI</strong>;
                            each payment&rsquo;s commission is only ever sent once.
                        </p>

                        {!ledger || !summary ? (
                            <div className="py-20 text-center text-gray-500">{loading ? "Loading…" : "Nothing to show"}</div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                                    <Tile strong label="Ready to send today" value={eur(ledger.sendableNow)} hint={ledger.sendableNow < ledger.readyNow ? `${eur(ledger.readyNow)} ready, limited by the balance` : "RexBid's share of cleared payments"} />
                                    <Tile label="Available in Stripe" value={eur(summary.available)} hint={`€${ledger.buffer} always kept back`} />
                                    <Tile label="Still clearing" value={eur(summary.pending)} hint="Not available yet" />
                                    <Tile label="Held for sellers" value={eur(summary.heldForSellers)} hint="Sales not yet paid out" />
                                </div>

                                {mismatch && (
                                    <div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                                        <div>
                                            The Sales page says {eur(summary.heldForSellers)} is owed to sellers, but Stripe only has {eur(summary.available)} available.
                                            Some sales are probably still marked as waiting for payout although the seller was paid another way.
                                            Check <strong>Sellers&rsquo; money being held</strong> below and record those payouts on the <Link to="/admin/sales" className="underline">Sales</Link> page.
                                        </div>
                                    </div>
                                )}
                                {ledger.toCheck > 0 && (
                                    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
                                        {ledger.toCheck} payment{ledger.toCheck === 1 ? "" : "s"} couldn&rsquo;t be matched to a sale or fee (marked <strong>Check</strong>). Their commission isn&rsquo;t worked out:
                                        look them up in Stripe, then send by hand or mark them as dealt with.
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <h2 className="text-lg font-semibold">Payments by the day they clear</h2>
                                    <div className="flex items-center gap-3 text-sm">
                                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSettled} onChange={(e) => setShowSettled(e.target.checked)} /> Show already sent</label>
                                        <button onClick={selectAllReady} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-white"><CheckSquare size={14} /> Tick all ready</button>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mb-3">
                                    Payments since {day(ledger.trackingStart)}. First time here? Tick the payments whose commission you&rsquo;ve already moved to BOI by hand and press <strong>Mark as already sent</strong>.
                                </p>

                                <div className="flex flex-col gap-4 mb-6">
                                    {byDay.map(([date, list]) => {
                                        const t = dayTotals.get(date);
                                        const cleared = list[0]?.cleared;
                                        const ids = list.filter(selectable).map((r) => r.chargeId);
                                        const allTicked = ids.length > 0 && ids.every((id) => selected.has(id));
                                        return (
                                            <div key={date} className="bg-white border rounded-xl overflow-hidden">
                                                <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${cleared ? "bg-green-50" : "bg-gray-50"}`}>
                                                    <label className="flex items-center gap-2 font-semibold">
                                                        <input type="checkbox" disabled={!ids.length} checked={allTicked} onChange={() => toggleDay(list)} />
                                                        {cleared ? (date === today ? "Cleared today" : `Cleared ${day(date)}`) : `Clears ${day(date)}`}
                                                        <span className="font-normal text-gray-500 text-sm">· {list.length} payment{list.length === 1 ? "" : "s"}</span>
                                                    </label>
                                                    <span className="text-sm">
                                                        RexBid&rsquo;s to send: <strong className={cleared ? "text-green-800" : "text-gray-700"}>{eur(t?.toSend)}</strong>
                                                        {!cleared && <span className="text-gray-500"> (from {day(date)})</span>}
                                                    </span>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead className="text-left text-gray-500 text-xs">
                                                            <tr>
                                                                <th className="p-2 w-8"></th>
                                                                <th className="p-2">Payment</th>
                                                                <th className="p-2 text-right">Paid</th>
                                                                <th className="p-2 text-right">Stripe fee</th>
                                                                <th className="p-2 text-right">Seller&rsquo;s share</th>
                                                                <th className="p-2 text-right">RexBid&rsquo;s share</th>
                                                                <th className="p-2 text-right">Already sent</th>
                                                                <th className="p-2 text-right">To send</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {list.map((r) => (
                                                                <tr key={r.chargeId} className={`border-t ${r.settled ? "text-gray-400" : ""}`}>
                                                                    <td className="p-2"><input type="checkbox" disabled={!selectable(r)} checked={selected.has(r.chargeId)} onChange={() => toggle(r.chargeId)} /></td>
                                                                    <td className="p-2">
                                                                        <div className="font-medium">{r.description}</div>
                                                                        <div className="text-xs text-gray-500">
                                                                            <span className={`mr-1 rounded px-1.5 py-0.5 ${r.kind === "check" ? "bg-amber-100 text-amber-800" : "bg-gray-100"}`}>{KIND[r.kind]}</span>
                                                                            Paid {day(r.created)}{r.refunded > 0 ? ` · ${eur(r.refunded)} refunded` : ""}{r.settled ? " · marked as dealt with" : ""}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-2 text-right">{eur(r.paid)}</td>
                                                                    <td className="p-2 text-right text-gray-500">−{eur(r.stripeFee)}</td>
                                                                    <td className="p-2 text-right text-gray-500">{r.kind === "check" ? "?" : r.sellerShare ? `−${eur(r.sellerShare)}` : "—"}</td>
                                                                    <td className="p-2 text-right">{r.rexbidShare == null ? "?" : eur(r.rexbidShare)}</td>
                                                                    <td className="p-2 text-right text-gray-500">{r.alreadySent ? eur(r.alreadySent) : "—"}</td>
                                                                    <td className={`p-2 text-right font-semibold ${r.toSend > 0 ? (r.cleared ? "text-green-800" : "text-gray-700") : "text-gray-400"}`}>{eur(r.toSend)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {!byDay.length && <div className="bg-white border rounded-xl p-6 text-center text-gray-500">No payments to show</div>}
                                </div>

                                <h2 className="text-lg font-semibold mb-1">Sellers&rsquo; money being held</h2>
                                <p className="text-xs text-gray-500 mb-2">
                                    Sales not yet paid out. You don&rsquo;t need to wait for a payment to clear to pay a seller: <Link to="/admin/sales" className="underline">Pay sellers</Link> links
                                    the transfer to the buyer&rsquo;s payment and Stripe releases it when it clears.
                                </p>
                                <div className="overflow-x-auto bg-white border rounded-xl mb-6">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-left text-gray-600">
                                            <tr><th className="p-3">Sale</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3 text-right">Seller gets</th></tr>
                                        </thead>
                                        <tbody>
                                            {summary.sales.length ? summary.sales.map((s) => (
                                                <tr key={s.id} className="border-t">
                                                    <td className="p-3"><div className="font-medium">{s.reference}</div><div className="text-xs text-gray-500">{s.title}</div></td>
                                                    <td className="p-3">{STATUS[s.status] || s.status}</td>
                                                    <td className="p-3">
                                                        {!s.viaStripe ? <span className="text-gray-500">Paid outside Stripe</span>
                                                            : s.cleared ? <span className="text-green-700">Cleared</span>
                                                            : <span className="text-amber-700">Clears {day(s.availableOn)}</span>}
                                                    </td>
                                                    <td className="p-3 text-right">{money(s.sellerNet, s.currency)}</td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={4} className="p-6 text-center text-gray-500">No sellers waiting to be paid</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><Landmark size={18} /> Recent payouts to the bank</h2>
                                <div className="overflow-x-auto bg-white border rounded-xl">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-left text-gray-600">
                                            <tr><th className="p-3">Sent</th><th className="p-3">Arrives</th><th className="p-3">Description</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th></tr>
                                        </thead>
                                        <tbody>
                                            {(summary.recentBankPayouts || []).map((p) => (
                                                <tr key={p.id} className="border-t">
                                                    <td className="p-3">{day(p.created)}</td>
                                                    <td className="p-3">{day(p.arrivalDate)}</td>
                                                    <td className="p-3 text-gray-600">{p.description || "—"}</td>
                                                    <td className="p-3">{p.status.replace("_", " ")}</td>
                                                    <td className="p-3 text-right">{money(p.amount, p.currency)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>

                    {picked.length > 0 && (
                        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur px-4 py-3">
                            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
                                <div className="text-sm">
                                    <strong>{picked.length}</strong> ticked · <strong className="text-green-800">{eur(sendTotal)}</strong> ready to send
                                    {picked.length > sendable.length && <span className="text-gray-500"> ({picked.length - sendable.length} not cleared yet or nothing to send)</span>}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={markSent} disabled={busy} className="px-4 py-2 rounded-lg border bg-white disabled:opacity-40">Mark as already sent</button>
                                    <button onClick={send} disabled={busy || !sendable.length} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-secondary text-white disabled:opacity-40">
                                        {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send {eur(sendTotal)} to BOI
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </AdminContainer>
            </div>
        </section>
    );
}
