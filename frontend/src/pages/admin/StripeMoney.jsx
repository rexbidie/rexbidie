// Admin → Stripe Money: how much of the Stripe balance is RexBid's and can be
// sent to the BOI account now, what clears on which day, and sellers' money
// still being held.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, Loader2, RefreshCw, Send } from "lucide-react";
import toast from "react-hot-toast";
import { AdminContainer, AdminHeader, AdminSidebar } from "../../components";
import axiosInstance from "../../utils/axiosInstance";

const eur = (n) => `€${Number(n || 0).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (n, cur) => `${cur === "GBP" ? "£" : "€"}${Number(n || 0).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "—");

const STATUS = { paid: "Awaiting collection", collected: "Partly confirmed", payout_due: "Payout due" };

const Tile = ({ label, value, hint, strong }) => (
    <div className={`rounded-xl border p-4 ${strong ? "bg-green-50 border-green-200" : "bg-white"}`}>
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <div className={`mt-1 font-bold ${strong ? "text-3xl text-green-800" : "text-2xl text-gray-900"}`}>{value}</div>
        {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
);

export default function StripeMoney() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [amount, setAmount] = useState("");
    const [sending, setSending] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data: res } = await axiosInstance.get("/api/v1/admin/sales/stripe-money");
            setData(res.data);
            setAmount(res.data.safeToSend > 0 ? res.data.safeToSend.toFixed(2) : "");
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't load the Stripe balance");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const send = async () => {
        const value = Number(amount);
        if (!(value > 0)) return toast.error("Enter an amount");
        if (!window.confirm(`Send ${eur(value)} from Stripe to the RexBid bank account (BOI)?`)) return;
        setSending(true);
        try {
            const { data: res } = await axiosInstance.post("/api/v1/admin/sales/stripe-money/send-to-bank", { amount: value });
            toast.success(`${eur(res.data.amount)} on its way, due ${day(res.data.arrivalDate)}`, { duration: 6000 });
            load();
        } catch (e) {
            toast.error(e?.response?.data?.message || "Couldn't send it");
        } finally {
            setSending(false);
        }
    };

    return (
        <section className="flex min-h-screen bg-gray-50">
            <AdminSidebar />
            <div className="w-full relative">
                <AdminHeader />
                <AdminContainer>
                    <div className="pt-16 md:pt-0 pb-10 max-w-6xl">
                        <div className="flex items-center justify-between gap-3 my-5">
                            <h1 className="text-3xl font-bold">Stripe Money</h1>
                            <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-md border bg-white disabled:opacity-50">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-5">
                            Commission, buyer fees and Featured / Meta fees that have cleared in Stripe can go to the BOI account. Sellers&rsquo; money
                            for sales not yet paid out stays in Stripe, and {data ? eur(data.buffer) : "€100"} is kept back for refunds and disputes.
                            Stripe fees have already come off.
                        </p>

                        {!data ? (
                            <div className="py-20 text-center text-gray-500">{loading ? "Loading…" : "Nothing to show"}</div>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                                    <Tile strong label="Safe to send to BOI now" value={eur(data.safeToSend)} hint="Yours, cleared and available" />
                                    <Tile label="Available in Stripe" value={eur(data.available)} hint="Cleared, all of it" />
                                    <Tile label="Held for sellers" value={eur(data.heldForSellers)} hint={`Plus ${eur(data.heldLater)} still clearing`} />
                                    <Tile label="Still clearing" value={eur(data.pending)} hint="Not available yet" />
                                </div>

                                <div className="bg-white border rounded-xl p-4 mb-3 text-sm">
                                    <div className="font-semibold mb-2">How much of the {eur(data.available)} available is yours to send</div>
                                    <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 max-w-md">
                                        <span>Available in Stripe</span><span className="text-right">{eur(data.available)}</span>
                                        <span>Less sellers&rsquo; money (cleared, not yet paid out)</span><span className="text-right">−{eur(data.heldForSellers)}</span>
                                        <span>Less buffer for refunds and disputes</span><span className="text-right">−{eur(data.buffer)}</span>
                                        <span className="font-semibold border-t pt-1">Safe to send to BOI</span><span className="text-right font-semibold border-t pt-1 text-green-800">{eur(data.safeToSend)}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Only sales on the Sales page are counted. If you still owe a seller for a sale that isn&rsquo;t listed there, send less.
                                    </p>
                                </div>

                                <div className="bg-white border rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-end gap-3">
                                    <label className="text-sm flex-1">
                                        <span className="text-gray-600">Amount to send to BOI (€)</span>
                                        <input
                                            type="number" step="0.01" min="0" max={data.safeToSend}
                                            value={amount} onChange={(e) => setAmount(e.target.value)}
                                            className="mt-1 w-full border rounded-lg p-2"
                                        />
                                    </label>
                                    <button
                                        onClick={send}
                                        disabled={sending || !(Number(amount) > 0) || Number(amount) > data.safeToSend}
                                        className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-secondary text-white disabled:opacity-40"
                                    >
                                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send to BOI
                                    </button>
                                </div>

                                <h2 className="text-lg font-semibold mb-2">Coming available</h2>
                                {data.upcoming.length ? (
                                    <div className="overflow-x-auto bg-white border rounded-xl mb-6">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 text-left text-gray-600">
                                                <tr><th className="p-3">Clears on</th><th className="p-3 text-right">Clears</th><th className="p-3 text-right">For sellers</th><th className="p-3 text-right">Yours to send</th></tr>
                                            </thead>
                                            <tbody>
                                                {data.upcoming.map((u) => (
                                                    <tr key={u.date} className="border-t">
                                                        <td className="p-3">{day(u.date)}</td>
                                                        <td className="p-3 text-right">{eur(u.clears)}</td>
                                                        <td className="p-3 text-right text-gray-600">{eur(u.forSellers)}</td>
                                                        <td className="p-3 text-right font-semibold text-green-800">{eur(u.forRexBid)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 mb-6">Nothing else clearing at the moment.</p>
                                )}

                                <h2 className="text-lg font-semibold mb-1">Sellers&rsquo; money being held</h2>
                                <p className="text-xs text-gray-500 mb-2">
                                    You don&rsquo;t need to wait for a payment to clear to pay a seller: <Link to="/admin/sales" className="underline">Pay sellers</Link> on
                                    the Sales page links the transfer to the buyer&rsquo;s payment, and Stripe releases it as soon as it clears.
                                </p>
                                <div className="overflow-x-auto bg-white border rounded-xl mb-6">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-left text-gray-600">
                                            <tr><th className="p-3">Sale</th><th className="p-3">Status</th><th className="p-3">Payment</th><th className="p-3 text-right">Seller gets</th><th className="p-3 text-right">Your commission</th><th className="p-3 text-right">Stripe fee</th></tr>
                                        </thead>
                                        <tbody>
                                            {data.sales.length ? data.sales.map((s) => (
                                                <tr key={s.id} className="border-t">
                                                    <td className="p-3"><div className="font-medium">{s.reference}</div><div className="text-xs text-gray-500">{s.title}</div></td>
                                                    <td className="p-3">{STATUS[s.status] || s.status}</td>
                                                    <td className="p-3">
                                                        {!s.viaStripe ? <span className="text-gray-500">Paid outside Stripe</span>
                                                            : s.cleared ? <span className="text-green-700">Cleared</span>
                                                            : <span className="text-amber-700">Clears {day(s.availableOn)}</span>}
                                                    </td>
                                                    <td className="p-3 text-right">{money(s.sellerNet, s.currency)}</td>
                                                    <td className="p-3 text-right">{money(s.commission, s.currency)}</td>
                                                    <td className="p-3 text-right text-gray-600">{s.stripeFeeEur == null ? "—" : eur(s.stripeFeeEur)}</td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={6} className="p-6 text-center text-gray-500">No sellers waiting to be paid</td></tr>
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
                                            {(data.recentBankPayouts || []).map((p) => (
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
                </AdminContainer>
            </div>
        </section>
    );
}
