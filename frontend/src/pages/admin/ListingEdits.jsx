import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { AdminContainer, AdminHeader, AdminSidebar, LoadingSpinner } from "../../components";
import axiosInstance from "../../utils/axiosInstance";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

// Edits sellers made to live (or approved) listings. The listing stays up with
// its current details until an edit is approved here (backend:
// services/listingEditService.js).

const sellerName = (s) =>
    s ? s.companyName || [s.firstName, s.lastName].filter(Boolean).join(" ") || s.username : "Seller";

const when = (d) =>
    d ? new Date(d).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function PhotoStrip({ urls = [] }) {
    if (!urls.length) return <p className="text-sm text-gray-500">No photos</p>;
    return (
        <div className="flex gap-2 overflow-x-auto pb-1">
            {urls.map((u, i) => (
                <img key={`${u}-${i}`} src={u} alt={`Photo ${i + 1}`} loading="lazy" className="w-20 h-14 object-cover rounded-md bg-gray-100 shrink-0" />
            ))}
        </div>
    );
}

function Change({ change }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] gap-2 md:gap-4 py-3 border-t border-gray-100 first:border-t-0">
            <div className="font-semibold text-[#072342]">{change.label}</div>
            <div className="rounded-lg border border-gray-200 p-3 min-w-0">
                <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Before</p>
                {change.field === "photos"
                    ? <PhotoStrip urls={change.beforePhotos} />
                    : <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{change.before}</p>}
            </div>
            <div className="rounded-lg border border-[#D19F3E] bg-[#FFF7EA] p-3 min-w-0">
                <p className="text-xs uppercase tracking-wide text-[#7A5418] mb-1">After</p>
                {change.field === "photos"
                    ? <PhotoStrip urls={change.afterPhotos} />
                    : <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{change.after}</p>}
            </div>
        </div>
    );
}

function SendBackModal({ edit, onClose, onSent }) {
    useBodyScrollLock(true);
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);

    const send = async () => {
        if (!note.trim()) return toast.error("Please add a note for the seller.");
        setSending(true);
        try {
            const { data } = await axiosInstance.post(`/api/v1/admin/listing-edits/${edit._id}/reject`, { note: note.trim() });
            toast.success(data.message || "Sent back to the seller.");
            onSent();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not send it back");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="send-back-title">
            <div className="bg-white w-full sm:max-w-lg rounded-t-xl sm:rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="send-back-title" className="text-lg font-semibold">Send back with a note</h2>
                        <p className="text-sm text-gray-600 mt-1">{edit.title}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-gray-500 hover:text-black"><X size={20} /></button>
                </div>
                <label htmlFor="send-back-note" className="block text-sm font-medium mt-4 mb-1">Note for the seller (emailed to them)</label>
                <textarea
                    id="send-back-note"
                    rows={5}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#072342] focus:outline-none"
                    placeholder="What needs changing before these edits can go live?"
                />
                <p className="text-xs text-gray-500 mt-1">The listing stays live with its current details.</p>
                <div className="flex flex-col sm:flex-row gap-2 mt-4 sm:justify-end">
                    <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border border-gray-300">Cancel</button>
                    <button type="button" onClick={send} disabled={sending} className="min-h-[44px] px-4 rounded-lg bg-[#A3271F] text-white font-semibold disabled:opacity-50">
                        {sending ? "Sending…" : "Send back"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ListingEdits() {
    const [edits, setEdits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [sendingBack, setSendingBack] = useState(null);

    const load = async () => {
        try {
            const { data } = await axiosInstance.get("/api/v1/admin/listing-edits");
            setEdits(data.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not load edits");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const approve = async (edit) => {
        setBusy(edit._id);
        try {
            const { data } = await axiosInstance.post(`/api/v1/admin/listing-edits/${edit._id}/approve`);
            toast.success(data.message || "Changes approved.", { duration: 6000 });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not approve");
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="flex min-h-screen bg-gray-50">
            {sendingBack && (
                <SendBackModal
                    edit={sendingBack}
                    onClose={() => setSendingBack(null)}
                    onSent={() => { setSendingBack(null); load(); }}
                />
            )}
            <AdminSidebar />

            <div className="w-full relative">
                <AdminHeader />

                <AdminContainer>
                    <div className="max-w-full pt-16 pb-5 md:pt-0">
                        <h2 className="text-3xl md:text-4xl font-bold my-5">Edits to approve</h2>
                        <p className="text-gray-600 -mt-2">Sellers' changes to live listings. Each listing stays live with its current details until you approve.</p>
                    </div>

                    {loading ? (
                        <LoadingSpinner height="300px" />
                    ) : edits.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500 mb-16">
                            No edits waiting.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-5 mb-16">
                            {edits.map((edit) => (
                                <article key={edit._id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
                                        <div className="min-w-0">
                                            <Link to={`/auction/${edit._id}`} target="_blank" className="text-lg font-semibold text-[#072342] hover:underline break-words">
                                                {edit.title}
                                            </Link>
                                            <p className="text-sm text-gray-500 mt-0.5">
                                                {sellerName(edit.seller)} · {edit.status === "active" ? "Live" : "Approved, not started"} · {edit.bidCount || 0} bids · submitted {when(edit.submittedAt)}
                                            </p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => approve(edit)}
                                                disabled={busy === edit._id}
                                                className="min-h-[44px] px-4 rounded-lg bg-[#1C6B3A] text-white font-semibold disabled:opacity-50"
                                            >
                                                {busy === edit._id ? "Approving…" : "Approve changes"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSendingBack(edit)}
                                                className="min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-[#A3271F] font-semibold"
                                            >
                                                Send back with a note
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        {edit.changes.map((c) => <Change key={c.field} change={c} />)}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </AdminContainer>
            </div>
        </section>
    );
}

export default ListingEdits;
