// Admin → Last Chance.
// 1. Invite the sellers of unsold reserve lots (e.g. last night's sale) to put
//    them on Last Chance: preview the exact email, send yourself a test, then
//    send. Nothing goes to sellers until you press Send and confirm.
// 2. See what is live on Last Chance right now.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Loader2, Mail, RefreshCw, Send, Undo2, X } from "lucide-react";
import toast from "react-hot-toast";
import { AdminContainer, AdminHeader, AdminSidebar } from "../../components";
import axiosInstance from "../../utils/axiosInstance";
import { money, timeLeft } from "../../components/buyItNow/binShared";

const RANGES = [
    { hours: 36, label: "Last night's sale (36 hours)" },
    { hours: 72, label: "Last 3 days" },
    { hours: 168, label: "Last 7 days" },
];

const fmtDate = (d) =>
    new Date(d).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/Dublin" });

const PreviewModal = ({ previews, onClose }) => {
    const [i, setI] = useState(0);
    const p = previews[i];
    return (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="invite-preview-title">
            <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
                <div className="flex items-start justify-between gap-4 p-4 border-b">
                    <div className="min-w-0">
                        <h2 id="invite-preview-title" className="font-semibold">Email preview {previews.length > 1 ? `(${i + 1} of ${previews.length})` : ""}</h2>
                        <p className="text-sm text-gray-600 truncate">To: {p.to}</p>
                        <p className="text-sm text-gray-900 truncate">Subject: {p.subject}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-black"><X size={20} /></button>
                </div>
                <iframe title="Email preview" srcDoc={p.html} className="flex-1 w-full min-h-[60vh] border-0" sandbox="" />
                {previews.length > 1 && (
                    <div className="flex justify-between p-3 border-t">
                        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Previous</button>
                        <button type="button" disabled={i === previews.length - 1} onClick={() => setI(i + 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Next seller</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const UndoModal = ({ lot, onClose, onDone }) => {
    const [reason, setReason] = useState("Test purchase by RexBid");
    const [relist, setRelist] = useState(true);
    const [notifySeller, setNotifySeller] = useState(true);
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        try {
            const { data } = await axiosInstance.post(`/api/v1/buy-it-now/admin/lot/${lot._id}/undo`, { reason, relist, notifySeller, confirm: true });
            toast.success(data.message, { duration: 8000 });
            onDone();
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't undo the purchase", { duration: 8000 });
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="undo-title">
            <div className="bg-white rounded-xl w-full max-w-lg p-5">
                <div className="flex items-start justify-between gap-4">
                    <h2 id="undo-title" className="text-lg font-semibold">Undo Last Chance purchase</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-black"><X size={20} /></button>
                </div>
                <p className="text-sm text-gray-700 mt-1"><strong>{lot.title}</strong>, bought by {lot.buyer?.name} ({lot.buyer?.email}) for {money(lot.price, lot.currency)}.</p>
                <ul className="text-sm text-gray-600 mt-3 list-disc pl-5 space-y-1">
                    <li>Cancels the sale and any payment request (checks Stripe first that nothing has been paid).</li>
                    <li>The lot goes back to "reserve not met" with its top bid restored.</li>
                </ul>
                <label htmlFor="undo-reason" className="block text-sm font-medium mt-4">Reason (kept on the lot)</label>
                <input id="undo-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <label className="flex items-start gap-2 mt-4 text-sm">
                    <input type="checkbox" checked={relist} onChange={(e) => setRelist(e.target.checked)} className="mt-1" />
                    <span>Put it back on Last Chance for the time it had left (at least 24 hours)</span>
                </label>
                <label className="flex items-start gap-2 mt-2 text-sm">
                    <input type="checkbox" checked={notifySeller} onChange={(e) => setNotifySeller(e.target.checked)} className="mt-1" />
                    <span>Email the seller ({lot.seller?.email}) that the sale was cancelled in error and to ignore the "item sold" email{relist ? ", and that the lot is back on Last Chance" : ""}</span>
                </label>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">Cancel</button>
                    <button type="button" disabled={busy || !reason.trim()} onClick={submit} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md text-sm disabled:opacity-50">
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} Undo purchase
                    </button>
                </div>
            </div>
        </div>
    );
};

function AdminBuyItNow() {
    const [hours, setHours] = useState(36);
    const [lots, setLots] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [busy, setBusy] = useState(null); // "preview" | "test" | "send"
    const [previews, setPreviews] = useState(null);
    const [live, setLive] = useState([]);
    const [sold, setSold] = useState([]);
    const [undoLot, setUndoLot] = useState(null);

    const load = async () => {
        setLots(null);
        try {
            const [{ data }, liveRes, soldRes] = await Promise.all([
                axiosInstance.get(`/api/v1/buy-it-now/admin/unsold?hours=${hours}`),
                axiosInstance.get(`/api/v1/buy-it-now`),
                axiosInstance.get(`/api/v1/buy-it-now/admin/sold`).catch(() => null),
            ]);
            setSold(soldRes?.data?.data?.lots || []);
            const list = data.data.lots || [];
            setLots(list);
            setSelected(new Set(list.filter((l) => l.eligible && !l.invitedAt).map((l) => l._id)));
            setLive(liveRes.data?.data?.lots || []);
        } catch {
            toast.error("Couldn't load unsold lots");
            setLots([]);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hours]);

    const ids = useMemo(() => [...selected], [selected]);
    const sellerCount = useMemo(
        () => new Set((lots || []).filter((l) => selected.has(l._id)).map((l) => l.seller?._id)).size,
        [lots, selected]
    );

    const toggle = (id) =>
        setSelected((s) => {
            const n = new Set(s);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    const preview = async () => {
        setBusy("preview");
        try {
            const { data } = await axiosInstance.post("/api/v1/buy-it-now/admin/invite/preview", { auctionIds: ids });
            if (!data.data.previews.length) toast("None of the selected lots can be invited");
            else setPreviews(data.data.previews);
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't build the preview");
        } finally {
            setBusy(null);
        }
    };

    const sendTest = async () => {
        setBusy("test");
        try {
            const { data } = await axiosInstance.post("/api/v1/buy-it-now/admin/invite/test", { auctionIds: ids });
            toast.success(data.message);
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't send the test");
        } finally {
            setBusy(null);
        }
    };

    const send = async () => {
        if (!window.confirm(`Send the Last Chance invitation to ${sellerCount} seller${sellerCount === 1 ? "" : "s"} now? Each gets one email covering their lots, and 72 hours from now to start Last Chance.`)) return;
        setBusy("send");
        try {
            const { data } = await axiosInstance.post("/api/v1/buy-it-now/admin/invite/send", { auctionIds: ids, confirm: true });
            toast.success(data.message, { duration: 8000 });
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || "Couldn't send");
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="flex min-h-screen bg-gray-50">
            {previews && <PreviewModal previews={previews} onClose={() => setPreviews(null)} />}
            {undoLot && <UndoModal lot={undoLot} onClose={() => setUndoLot(null)} onDone={() => { setUndoLot(null); load(); }} />}
            <AdminSidebar />
            <div className="w-full relative">
                <AdminHeader />
                <AdminContainer>
                    <div className="pt-16 md:pt-0 pb-10 max-w-6xl">
                        <h1 className="text-3xl font-bold my-5">Last Chance</h1>

                        <div className="bg-white border border-gray-200 rounded-lg p-5">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold">Invite sellers of unsold lots</h2>
                                    <p className="text-sm text-gray-600 max-w-2xl">
                                        Reserve lots that ended without meeting the reserve. Each seller gets one email listing their lots, with a link to set a Last Chance price and a link to the Last Chance page.
                                        Sending gives them 72 hours from now to start it.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label htmlFor="bin-range" className="text-sm text-gray-600">Ended in</label>
                                    <select id="bin-range" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
                                        {RANGES.map((r) => <option key={r.hours} value={r.hours}>{r.label}</option>)}
                                    </select>
                                    <button type="button" onClick={load} aria-label="Refresh" className="p-2 border rounded-md hover:bg-gray-50"><RefreshCw size={16} /></button>
                                </div>
                            </div>

                            {lots === null ? (
                                <p className="mt-6 flex items-center gap-2 text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
                            ) : lots.length === 0 ? (
                                <p className="mt-6 text-gray-500">No unsold reserve lots in this period.</p>
                            ) : (
                                <>
                                    <div className="mt-5 overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-gray-500 border-b">
                                                    <th className="py-2 pr-2 w-8"><span className="sr-only">Select</span></th>
                                                    <th className="py-2 pr-4">Lot</th>
                                                    <th className="py-2 pr-4">Seller</th>
                                                    <th className="py-2 pr-4 text-right">Top bid</th>
                                                    <th className="py-2 pr-4 text-right">Max Last Chance</th>
                                                    <th className="py-2">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lots.map((l) => (
                                                    <tr key={l._id} className="border-b last:border-0 align-top">
                                                        <td className="py-3 pr-2">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`Select ${l.title}`}
                                                                disabled={!l.eligible}
                                                                checked={selected.has(l._id)}
                                                                onChange={() => toggle(l._id)}
                                                            />
                                                        </td>
                                                        <td className="py-3 pr-4">
                                                            <Link to={`/auction/${l._id}`} target="_blank" className="font-medium underline">{l.title}</Link>
                                                            <p className="text-xs text-gray-500">Ended {fmtDate(l.endDate)} · reserve {money(l.reservePrice, l.currency)}</p>
                                                        </td>
                                                        <td className="py-3 pr-4">
                                                            <p>{l.seller?.companyName || l.seller?.name}</p>
                                                            <p className="text-xs text-gray-500">{l.seller?.email}</p>
                                                        </td>
                                                        <td className="py-3 pr-4 text-right">{l.topBid ? money(l.topBid, l.currency) : "No bids"}</td>
                                                        <td className="py-3 pr-4 text-right">{money(l.maxPrice, l.currency)}</td>
                                                        <td className="py-3 text-xs">
                                                            {l.invitedAt ? <span className="text-green-700">Invited {fmtDate(l.invitedAt)}</span> : l.eligible ? <span className="text-gray-600">Not invited</span> : <span className="text-amber-700">{l.reason}</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-5 flex flex-wrap items-center gap-3">
                                        <p className="text-sm text-gray-700 mr-auto">{ids.length} lot{ids.length === 1 ? "" : "s"} selected · {sellerCount} seller{sellerCount === 1 ? "" : "s"}</p>
                                        <button type="button" disabled={!ids.length || !!busy} onClick={preview} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50">
                                            {busy === "preview" ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />} Preview email
                                        </button>
                                        <button type="button" disabled={!ids.length || !!busy} onClick={sendTest} className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50">
                                            {busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Send test to me
                                        </button>
                                        <button type="button" disabled={!ids.length || !!busy} onClick={send} className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-md text-sm disabled:opacity-50">
                                            {busy === "send" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send to {sellerCount} seller{sellerCount === 1 ? "" : "s"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
                            <h2 className="text-lg font-semibold">Bought on Last Chance (last 14 days)</h2>
                            {sold.length === 0 ? (
                                <p className="text-sm text-gray-500 mt-2">No Last Chance sales yet.</p>
                            ) : (
                                <ul className="mt-3 divide-y text-sm">
                                    {sold.map((l) => (
                                        <li key={l._id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <Link to={`/auction/${l._id}`} target="_blank" className="underline font-medium">{l.title}</Link>
                                                <p className="text-xs text-gray-500">
                                                    {money(l.price, l.currency)} · bought {fmtDate(l.soldAt)} by {l.buyer?.name} ({l.buyer?.email}) · seller {l.seller?.name}
                                                </p>
                                            </div>
                                            {l.paid ? (
                                                <span className="text-xs text-green-700">Paid</span>
                                            ) : (
                                                <button type="button" onClick={() => setUndoLot(l)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-300 text-red-700 rounded-md text-xs hover:bg-red-50">
                                                    <Undo2 size={14} /> Undo purchase
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="bg-white border border-gray-200 rounded-lg p-5 mt-6">
                            <h2 className="text-lg font-semibold">Live on Last Chance</h2>
                            {live.length === 0 ? (
                                <p className="text-sm text-gray-500 mt-2">Nothing is live right now.</p>
                            ) : (
                                <ul className="mt-3 divide-y text-sm">
                                    {live.map((l) => (
                                        <li key={l._id} className="py-2 flex flex-wrap justify-between gap-2">
                                            <Link to={`/auction/${l._id}`} target="_blank" className="underline">{l.title}</Link>
                                            <span className="text-gray-600">{money(l.price, l.displayCurrency)} · {timeLeft(l.endsAt)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </AdminContainer>
            </div>
        </section>
    );
}

export default AdminBuyItNow;
