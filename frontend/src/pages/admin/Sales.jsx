import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Eye, Send, RefreshCw, Search, X, Receipt, History, XCircle, RotateCcw, Banknote, Link2, Unlock, Landmark, CheckCircle, Pencil, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../../utils/axiosInstance";
import { AdminContainer, AdminHeader, AdminSidebar, LoadingSpinner } from "../../components";
import { openPdf, DOCUMENT_LABELS, formatMoney } from "../../utils/openPdf";

const TABS = [
    { key: "sold", label: "Ready to send" },
    { key: "request_sent", label: "Awaiting payment" },
    { key: "paid", label: "Awaiting collection" },
    { key: "payout_due", label: "Payout due" },
    { key: "paid_out", label: "Paid out" },
    { key: "failed", label: "Failed" },
    { key: "all", label: "All" },
    { key: "historical", label: "Earlier sales" },
];

const STATUS_LABELS = {
    sold: "Ready to send",
    request_sent: "Request sent",
    paid: "Paid",
    collected: "Partly confirmed",
    payout_due: "Payout due",
    paid_out: "Paid out",
    failed: "Failed",
    cancelled: "Cancelled",
};

const STATUS_STYLES = {
    sold: "bg-amber-100 text-amber-800",
    request_sent: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    paid_out: "bg-emerald-100 text-emerald-800",
    collected: "bg-green-100 text-green-800",
    payout_due: "bg-purple-100 text-purple-800",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
};

const REGIONS = ["ROI", "NI", "GB", "EU", "OTHER"];

const PAYMENT_METHODS = { credit_card: "Card", bank_transfer: "Bank transfer", paypal: "PayPal", other: "Other" };

const shortDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "—";

const canSend = (s) => ["sold", "request_sent"].includes(s.status) && !s.vat?.reviewRequired;

const vatSummary = (s) => {
    if (s.vat?.treatment === "zero_rated") return "Zero-rated";
    if (s.vat?.treatment === "standard") return `${formatMoney(s.vat.amount, s.currency)} (${s.vat.rate}%)`;
    return "None";
};

function VatModal({ sale, onClose, onSaved }) {
    const [treatment, setTreatment] = useState(sale.vat?.override?.treatment || "standard");
    const [rate, setRate] = useState(sale.vat?.override?.rate ?? "");
    const [note, setNote] = useState(sale.vat?.override?.note || "");
    const [itemRegion, setItemRegion] = useState(sale.vat?.itemRegion || "");
    const [buyerRegion, setBuyerRegion] = useState(sale.buyer?.region || "");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (!note.trim()) return toast.error("Add a note explaining the decision");
        setSaving(true);
        try {
            const { data } = await axiosInstance.patch(`/api/v1/admin/sales/${sale._id}/vat`, {
                treatment,
                rate: treatment === "standard" ? rate : undefined,
                note,
                itemRegion: itemRegion || null,
                buyerRegion: buyerRegion || null,
            });
            toast.success("VAT updated");
            onSaved(data.data);
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not update VAT");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h3 className="text-lg font-semibold">VAT review · {sale.reference}</h3>
                    <button onClick={onClose} aria-label="Close"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4 text-sm">
                    <p className="font-medium">{sale.title}</p>
                    {sale.vat?.reviewReasons?.length > 0 && (
                        <ul className="bg-amber-50 border border-amber-200 rounded-lg p-3 list-disc pl-6 text-amber-900">
                            {sale.vat.reviewReasons.map((r) => <li key={r}>{r}</li>)}
                        </ul>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-gray-600">Item location</span>
                            <select className="mt-1 w-full border rounded-lg p-2" value={itemRegion} onChange={(e) => setItemRegion(e.target.value)}>
                                <option value="">Unknown</option>
                                {REGIONS.map((r) => <option key={r}>{r}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-gray-600">Buyer location</span>
                            <select className="mt-1 w-full border rounded-lg p-2" value={buyerRegion} onChange={(e) => setBuyerRegion(e.target.value)}>
                                <option value="">Unknown</option>
                                {REGIONS.map((r) => <option key={r}>{r}</option>)}
                            </select>
                        </label>
                    </div>
                    <p className="text-gray-600">
                        Buyer VAT no.: <strong>{sale.buyer?.vatNumber || "none on file"}</strong> · Seller VAT no.:{" "}
                        <strong>{sale.seller?.vatNumber || "none on file"}</strong>
                    </p>
                    <fieldset className="space-y-2">
                        <label className="flex items-center gap-2">
                            <input type="radio" checked={treatment === "standard"} onChange={() => setTreatment("standard")} />
                            Charge VAT at the standard rate (ROI 23%, NI 20%)
                        </label>
                        {treatment === "standard" && (
                            <label className="flex items-center gap-2 pl-6">
                                Rate override %
                                <input type="number" min="0" max="30" step="0.5" className="border rounded-lg p-1 w-24" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="auto" />
                            </label>
                        )}
                        <label className="flex items-center gap-2">
                            <input type="radio" checked={treatment === "zero_rated"} onChange={() => setTreatment("zero_rated")} />
                            Zero-rate (cross-border sale between VAT-registered businesses)
                        </label>
                    </fieldset>
                    <label className="block">
                        <span className="text-gray-600">Note (required, kept on the sale record)</span>
                        <textarea className="mt-1 w-full border rounded-lg p-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Buyer XI VAT number checked on VIES 11/11/2026" />
                    </label>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border">Cancel</button>
                    <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                        {saving ? "Saving…" : "Save decision"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function RecordPaymentModal({ sale, onClose, onDone }) {
    const [method, setMethod] = useState("bank_transfer");
    const [amount, setAmount] = useState(String(sale.total));
    const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [sendDocuments, setSendDocuments] = useState(!sale.historical);
    const [saving, setSaving] = useState(false);
    const differs = Number(amount) !== Number(sale.total);

    const save = async () => {
        if (differs && !note.trim()) return toast.error("The amount differs from the total due; add a note");
        setSaving(true);
        try {
            await axiosInstance.post(`/api/v1/admin/sales/${sale._id}/record-payment`, { method, amount, paidAt, reference, note, sendDocuments });
            toast.success(`${sale.reference} marked paid${sendDocuments ? "; receipt and seller statement sent" : ""}`);
            onDone();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not record the payment");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h3 className="text-lg font-semibold">Record payment · {sale.reference}</h3>
                    <button onClick={onClose} aria-label="Close"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4 text-sm">
                    <p>
                        For a payment that didn&rsquo;t come through a payment request sent from this page, e.g. a request made by hand in Stripe,
                        a transfer to RexBid&rsquo;s bank, or cash. Total due: <strong>{formatMoney(sale.total, sale.currency)}</strong>.
                    </p>
                    <label className="block">
                        <span className="text-gray-600">How was it paid?</span>
                        <select className="mt-1 w-full border rounded-lg p-2" value={method} onChange={(e) => setMethod(e.target.value)}>
                            <option value="bank_transfer">Bank transfer (Stripe IBAN or RexBid bank)</option>
                            <option value="credit_card">Card</option>
                            <option value="other">Other (cash, cheque…)</option>
                        </select>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-gray-600">Amount received ({sale.currency})</span>
                            <input type="number" step="0.01" min="0" className="mt-1 w-full border rounded-lg p-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
                        </label>
                        <label className="block">
                            <span className="text-gray-600">Date received</span>
                            <input type="date" className="mt-1 w-full border rounded-lg p-2" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                        </label>
                    </div>
                    <label className="block">
                        <span className="text-gray-600">Reference (optional)</span>
                        <input className="mt-1 w-full border rounded-lg p-2" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. Stripe pi_… or bank reference" />
                    </label>
                    <label className="block">
                        <span className="text-gray-600">Note {differs ? "(required: amount differs)" : "(optional)"}</span>
                        <textarea className="mt-1 w-full border rounded-lg p-2" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={sendDocuments} onChange={(e) => setSendDocuments(e.target.checked)} />
                        Send the buyer their receipt and the seller their &ldquo;Buyer has paid&rdquo; statement
                    </label>
                    {sale.historical && <p className="text-xs text-gray-500">Earlier sale: unticked by default so old buyers and sellers aren&rsquo;t emailed.</p>}
                </div>
                <div className="flex justify-end gap-2 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border">Cancel</button>
                    <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-secondary text-white disabled:opacity-50">
                        {saving ? "Saving…" : "Mark as paid"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ManualPayoutModal({ sale, onClose, onDone }) {
    const [details, setDetails] = useState(null);
    // "bank": paid from RexBid's bank (BOI). "stripe": already sent as a transfer in the Stripe Dashboard.
    const [method, setMethod] = useState("bank");
    const [amount, setAmount] = useState("");
    const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
    const [reference, setReference] = useState("");
    const [transferId, setTransferId] = useState("");
    const [note, setNote] = useState("");
    const [sendEmail, setSendEmail] = useState(!sale.historical);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        axiosInstance
            .get(`/api/v1/admin/sales/${sale._id}/payout-details`)
            .then(({ data }) => {
                setDetails(data.data);
                setAmount(String(data.data.amount));
            })
            .catch((err) => toast.error(err.response?.data?.message || "Could not load payout details"));
    }, [sale._id]);

    const copy = (text) => {
        navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => {});
    };

    const save = async () => {
        let body;
        if (method === "stripe") {
            if (!/^tr_/.test(transferId.trim())) return toast.error("Enter the Stripe transfer ID (starts tr_)");
            if (!window.confirm(`Record Stripe transfer ${transferId.trim()} as the payout to ${details?.seller?.name}?` + (sendEmail ? "\n\nThe seller will be emailed their updated statement." : ""))) return;
            body = { method: "stripe_transfer", reference: transferId.trim(), note, sendEmail };
        } else {
            if (!reference.trim()) return toast.error("Add the bank payment reference");
            const differs = details && Number(amount) !== details.amount;
            if (differs && !note.trim()) return toast.error("The amount differs from what's due; add a note");
            if (!window.confirm(`Record ${formatMoney(amount, details?.currency)} paid to ${details?.seller?.name} by bank transfer on ${paidAt}?` + (sendEmail ? "\n\nThe seller will be emailed their updated statement." : ""))) return;
            body = { method: "bank_transfer", amount, paidAt, reference, note, sendEmail };
        }
        setSaving(true);
        try {
            await axiosInstance.post(`/api/v1/admin/sales/${sale._id}/manual-payout`, body);
            toast.success(`Payout recorded for ${sale.reference}`);
            onDone();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not record the payout");
        } finally {
            setSaving(false);
        }
    };

    const Row = ({ label, value, mono }) =>
        value ? (
            <div className="flex items-center justify-between gap-3 py-1">
                <span className="text-gray-600">{label}</span>
                <span className={`flex items-center gap-2 ${mono ? "font-mono" : ""}`}>
                    {value}
                    <button type="button" onClick={() => copy(String(value))} className="text-xs underline text-primary">Copy</button>
                </span>
            </div>
        ) : null;

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h3 className="text-lg font-semibold">Record payout · {sale.reference}</h3>
                    <button onClick={onClose} aria-label="Close"><X size={20} /></button>
                </div>
                {!details ? (
                    <LoadingSpinner height="200px" />
                ) : (
                    <div className="p-5 space-y-4 text-sm">
                        <fieldset className="space-y-2">
                            <label className="flex items-start gap-2">
                                <input type="radio" className="mt-1" checked={method === "bank"} onChange={() => setMethod("bank")} />
                                <span>Paid from RexBid&rsquo;s bank (e.g. BOI)</span>
                            </label>
                            <label className="flex items-start gap-2">
                                <input type="radio" className="mt-1" checked={method === "stripe"} onChange={() => setMethod("stripe")} />
                                <span>Already paid by Stripe transfer in the Stripe Dashboard</span>
                            </label>
                        </fieldset>
                        <p className="text-gray-600">
                            Amount due to <strong>{details.seller.name}</strong>: <strong>{formatMoney(details.amount, details.currency)}</strong>. No new payment is made from here.
                        </p>

                        {method === "stripe" ? (
                            <label className="block">
                                <span className="text-gray-600">Stripe transfer ID (required)</span>
                                <input className="mt-1 w-full border rounded-lg p-2 font-mono" value={transferId} onChange={(e) => setTransferId(e.target.value)} placeholder="tr_..." />
                                <span className="text-xs text-gray-500">
                                    In Stripe: Connected accounts → the seller → the transfer → copy its ID. The amount and date are read from Stripe, and the
                                    seller is linked to that account if they aren&rsquo;t already.
                                </span>
                            </label>
                        ) : (
                            <>
                                <div className="bg-gray-50 border rounded-lg p-3">
                                    <p className="font-semibold mb-1">Seller&rsquo;s bank details (from their Payout Methods)</p>
                                    {details.bank ? (
                                        <>
                                            <Row label="Account holder" value={details.bank.accountHolderName} />
                                            <Row label="IBAN" value={details.bank.iban} mono />
                                            <Row label="BIC" value={details.bank.bic} mono />
                                            <Row label="Account no." value={details.bank.accountNumber} mono />
                                            <Row label="Sort code" value={details.bank.sortCode} mono />
                                            <Row label="Bank" value={details.bank.bankName} />
                                        </>
                                    ) : (
                                        <p className="text-amber-700">
                                            No bank details saved on RexBid. Ask the seller for their IBAN
                                            {details.seller.phone ? ` (${details.seller.phone})` : ""}.
                                            {details.stripe.bankLast4 ? ` Their Stripe payout bank is ${details.stripe.bankName || ""} ending ${details.stripe.bankLast4}.` : ""}
                                        </p>
                                    )}
                                    <Row label="Amount due" value={Number(details.amount).toFixed(2)} />
                                    <Row label="Suggested reference" value={details.paymentReference} mono />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-gray-600">Amount paid ({details.currency})</span>
                                        <input type="number" step="0.01" min="0" className="mt-1 w-full border rounded-lg p-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
                                    </label>
                                    <label className="block">
                                        <span className="text-gray-600">Date paid</span>
                                        <input type="date" className="mt-1 w-full border rounded-lg p-2" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                                    </label>
                                </div>
                                <label className="block">
                                    <span className="text-gray-600">Bank payment reference (required)</span>
                                    <input className="mt-1 w-full border rounded-lg p-2" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. BOI 365 transaction reference" />
                                </label>
                            </>
                        )}
                        <label className="block">
                            <span className="text-gray-600">Note (required if the amount differs from what&rsquo;s due)</span>
                            <textarea className="mt-1 w-full border rounded-lg p-2" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                            Email the seller their &ldquo;You&rsquo;ve been paid&rdquo; statement
                        </label>
                    </div>
                )}
                <div className="flex justify-end gap-2 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border">Cancel</button>
                    <button onClick={save} disabled={saving || !details} className="px-4 py-2 rounded-lg bg-secondary text-white disabled:opacity-50">
                        {saving ? "Saving…" : "Record payout"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function LinkStripeAccountModal({ sale, onClose, onDone }) {
    const [accounts, setAccounts] = useState(null);
    const [accountId, setAccountId] = useState("");
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        axiosInstance
            .get("/api/v1/admin/sales/stripe-accounts/unlinked")
            .then(({ data }) => setAccounts(data.data))
            .catch(() => setAccounts([]));
    }, []);
    const save = async () => {
        if (!accountId.trim()) return toast.error("Pick an account or paste its ID");
        setSaving(true);
        try {
            const { data } = await axiosInstance.post(`/api/v1/admin/sales/${sale._id}/link-payout-account`, { accountId: accountId.trim() });
            toast.success(data.data.state === "ready" ? "Linked: payouts ready" : "Linked: the seller still needs to finish setup in Stripe");
            onDone();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not link the account");
        } finally {
            setSaving(false);
        }
    };
    const sellerName = sale.seller?.companyName || sale.seller?.name;
    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h3 className="text-lg font-semibold">Link Stripe account · {sellerName}</h3>
                    <button onClick={onClose} aria-label="Close"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-3 text-sm">
                    <p>
                        For a seller whose Stripe connected account was set up with a different email from their RexBid account. Pick their
                        account below (only accounts not linked to anyone are shown).
                    </p>
                    {!accounts ? (
                        <LoadingSpinner height="120px" />
                    ) : accounts.length === 0 ? (
                        <p className="text-gray-500">Every connected account is already linked.</p>
                    ) : (
                        <ul className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                            {accounts.map((a) => (
                                <li key={a.accountId}>
                                    <label className="flex items-start gap-2 p-2 cursor-pointer hover:bg-gray-50">
                                        <input type="radio" className="mt-1" checked={accountId === a.accountId} onChange={() => setAccountId(a.accountId)} />
                                        <span className="flex-1">
                                            <span className="font-medium">{a.name || "(no name)"}</span>
                                            <span className="block text-xs text-gray-500">{a.email} · {a.accountId}</span>
                                        </span>
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${a.payoutsEnabled ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                                            {a.payoutsEnabled ? "Ready" : "Incomplete"}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    <label className="block">
                        <span className="text-gray-600">Or paste the account ID</span>
                        <input className="mt-1 w-full border rounded-lg p-2 font-mono" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="acct_..." />
                    </label>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg border">Cancel</button>
                    <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-secondary text-white disabled:opacity-50">
                        {saving ? "Linking…" : "Link account"}
                    </button>
                </div>
            </div>
        </div>
    );
}

const PAID_STATES = ["paid", "collected", "payout_due", "paid_out"];
const canDocs = (s) => PAID_STATES.includes(s.status);
const canFail = (s) => ["sold", "request_sent"].includes(s.status);
const hasDoc = (s, type) => (s.documents || []).some((d) => d.type === type && !d.supersededAt);

const canPay = (s) => s.status === "payout_due" && !s.payout?.reference;
const netPayout = (s) => Math.round(((s.itemPrice || 0) + (s.vat?.amount || 0) - (s.sellerFee || 0)) * 100) / 100;

const DOC_ACTIONS = {
    payment_request: { label: "payment request", plural: "payment requests", who: "buyer", eligible: canSend },
    buyer_receipt: { label: "receipt", plural: "receipts", who: "buyer", eligible: canDocs },
    seller_statement: { label: "seller statement", plural: "seller statements", who: "seller", eligible: canDocs },
};

function Sales() {
    const [tab, setTab] = useState("sold");
    const [reviewOnly, setReviewOnly] = useState(false);
    const [search, setSearch] = useState("");
    const [sales, setSales] = useState([]);
    const [counts, setCounts] = useState({});
    const [historicalCount, setHistoricalCount] = useState(null);
    const [needsReview, setNeedsReview] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(new Set());
    const [sending, setSending] = useState(false);
    const [vatSale, setVatSale] = useState(null);
    const [docsSale, setDocsSale] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams(tab === "historical" ? { status: "all", historical: "true" } : { status: tab });
            if (reviewOnly) params.set("review", "true");
            if (search.trim()) params.set("search", search.trim());
            const { data } = await axiosInstance.get(`/api/v1/admin/sales?${params}`);
            setSales(data.data.sales);
            setCounts(data.data.counts || {});
            setHistoricalCount(data.data.historicalCount ?? 0);
            setNeedsReview(data.data.needsReview || 0);
            setSelected(new Set());
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not load sales");
        } finally {
            setLoading(false);
        }
    }, [tab, reviewOnly, search]);

    useEffect(() => {
        const t = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [load, search]);

    const selectable = useMemo(() => sales.filter((s) => canSend(s) || canDocs(s) || canPay(s)), [sales]);
    const [matchResult, setMatchResult] = useState(null);
    const [manualSale, setManualSale] = useState(null);
    const [paySale, setPaySale] = useState(null);
    const [linkSale, setLinkSale] = useState(null);
    const allSelected = selectable.length > 0 && selectable.every((s) => selected.has(s._id));
    const chosen = useMemo(() => sales.filter((s) => selected.has(s._id)), [sales, selected]);
    const eligible = (type) => chosen.filter(DOC_ACTIONS[type].eligible);

    const toggle = (id) =>
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((s) => s._id)));

    const issue = async (type) => {
        const a = DOC_ACTIONS[type];
        const list = eligible(type);
        if (!list.length) return;
        const again = list.filter((s) => hasDoc(s, type)).length;
        const msg =
            `Send ${list.length} ${list.length === 1 ? a.label : a.plural}?` +
            (again ? `\n\n${again} already had one; they will get a replacement.` : "") +
            `\n\nEach ${a.who} is emailed a PDF and it is saved in their Documents. You get a copy.`;
        if (!window.confirm(msg)) return;
        setSending(true);
        try {
            const { data } =
                type === "payment_request"
                    ? await axiosInstance.post("/api/v1/admin/sales/issue-payment-requests", { saleIds: list.map((s) => s._id) })
                    : await axiosInstance.post("/api/v1/admin/sales/issue-documents", { type, saleIds: list.map((s) => s._id) });
            const { sent, failed, results } = data.data;
            if (sent) toast.success(`${sent} ${sent === 1 ? a.label : a.plural} sent`);
            const notEmailed = results.filter((r) => r.ok && !r.emailed).length;
            if (notEmailed) toast.error(`${notEmailed} created but the email failed; open Documents to check`);
            results
                .filter((r) => !r.ok)
                .forEach((r) => {
                    const s = list.find((c) => c._id === r.saleId);
                    toast.error(`${s?.reference || r.saleId}: ${r.message}`, { duration: 8000 });
                });
            if (failed && !sent) toast.error(`No ${a.plural} were sent`);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Sending failed");
        } finally {
            setSending(false);
        }
    };

    const markFailed = async (s) => {
        const reason = window.prompt(
            `Mark ${s.reference} (${s.title}) as failed?\n\nAny open Stripe bank-transfer request is cancelled. You can reopen it later.\n\nReason:`,
            "Buyer did not pay",
        );
        if (!reason?.trim()) return;
        try {
            await axiosInstance.post(`/api/v1/admin/sales/${s._id}/fail`, { reason });
            toast.success(`${s.reference} marked failed`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not mark failed");
        }
    };

    const reopen = async (s) => {
        if (!window.confirm(`Reopen ${s.reference}? It goes back to Ready to send.`)) return;
        try {
            await axiosInstance.post(`/api/v1/admin/sales/${s._id}/reopen`);
            toast.success(`${s.reference} reopened`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not reopen");
        }
    };

    const sendPayoutSetup = async (s) => {
        const who = s.seller?.companyName || s.seller?.name || "the seller";
        if (!window.confirm(`Email ${who} a link to set up their Stripe payout account?`)) return;
        try {
            await axiosInstance.post(`/api/v1/admin/sales/${s._id}/payout-setup-email`);
            toast.success(`Payout setup link sent to ${who}`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not send the link");
        }
    };

    const payable = chosen.filter(canPay);

    const paySellers = async () => {
        if (!payable.length) return;
        const total = payable.reduce((n, s) => n + netPayout(s), 0);
        const notReady = payable.filter((s) => s.sellerPayout?.state !== "ready").length;
        if (
            !window.confirm(
                `Pay ${payable.length} seller${payable.length === 1 ? "" : "s"} a total of ${formatMoney(total, payable[0].currency)} by Stripe transfer?` +
                    (notReady ? `\n\n${notReady} ${notReady === 1 ? "has" : "have"} no ready payout account and will be skipped.` : "") +
                    "\n\nEach seller is emailed their updated statement. This cannot be undone from here.",
            )
        )
            return;
        setSending(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sales/pay-sellers", { saleIds: payable.map((s) => s._id) });
            const { paid, results } = data.data;
            if (paid) toast.success(`${paid} seller${paid === 1 ? "" : "s"} paid`);
            results
                .filter((r) => !r.ok)
                .forEach((r) => {
                    const s = payable.find((c) => c._id === r.saleId);
                    toast.error(`${s?.reference || r.saleId}: ${r.message}`, { duration: 10000 });
                });
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Payout failed");
        } finally {
            setSending(false);
        }
    };

    const releaseEarly = async (s) => {
        const note = window.prompt(
            `Release the payout for ${s.reference} before both sides confirm collection?\n\nNote who agreed and when (kept on the sale):`,
        );
        if (!note?.trim()) return;
        try {
            await axiosInstance.post(`/api/v1/admin/sales/${s._id}/release-payout`, { note });
            toast.success(`${s.reference} moved to Payout due`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not release the payout");
        }
    };

    const matchTransfers = async () => {
        if (!window.confirm("Look through payouts already made in the Stripe Dashboard and mark matching sales as paid out?\n\nA sale matches when a transfer of exactly the seller's amount went to that seller's Stripe account on or after the sale date. No emails are sent.")) return;
        setSending(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sales/match-transfers");
            setMatchResult(data.data);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Matching failed");
        } finally {
            setSending(false);
        }
    };

    const editBuyerFee = async (s) => {
        const value = window.prompt(`Buyer fee for ${s.reference} (${s.title}), in ${s.currency}:`, String(s.buyerFee ?? 0));
        if (value === null) return;
        const note = window.prompt("Note (kept on the sale), e.g. \"3% charged by hand on the payment request\":", "") ?? "";
        try {
            const { data } = await axiosInstance.patch(`/api/v1/admin/sales/${s._id}/buyer-fee`, { fee: value, note });
            toast.success(`${s.reference}: buyer fee ${formatMoney(data.data.buyerFee, s.currency)}, total ${formatMoney(data.data.total, s.currency)}`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not change the buyer fee");
        }
    };

    // CSV with an auction/lot ID column and a buyer fee column (header row optional).
    const importBuyerFees = async (file) => {
        if (!file) return;
        const text = await file.text();
        const rows = [];
        for (const line of text.split(/\r?\n/)) {
            const cells = line.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, "").trim());
            const id = cells.find((c) => /^[a-f0-9]{24}$/i.test(c));
            const fee = cells.filter((c) => c !== id).map((c) => c.replace(/[€£,\s]/g, "")).find((c) => /^\d+(\.\d+)?$/.test(c));
            if (id && fee !== undefined) rows.push({ auctionId: id, fee: Number(fee) });
        }
        if (!rows.length) return toast.error("No rows found. The file needs a lot ID column and a buyer fee column.");
        if (!window.confirm(`Apply buyer fees to ${rows.length} earlier sale${rows.length === 1 ? "" : "s"}?\n\nOnly earlier sales are changed. No emails are sent.`)) return;
        setSending(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sales/import-buyer-fees", { rows });
            const r = data.data;
            toast.success(`Buyer fees: ${r.updated} updated, ${r.unchanged} already right${r.notFound.length ? `, ${r.notFound.length} not found` : ""}${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`, { duration: 10000 });
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Import failed");
        } finally {
            setSending(false);
        }
    };

    const findStripePayments = async () => {
        setSending(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sales/match-payments");
            const n = data.data.matched;
            if (n) toast.success(`${n} sale${n === 1 ? "" : "s"} matched to a Stripe payment and marked paid`);
            else toast("No new Stripe payments matched. Use Record payment for anything paid another way.");
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not check Stripe");
        } finally {
            setSending(false);
        }
    };

    const importHistory = async () => {
        if (!window.confirm("Import every lot sold before sale records began?\n\nNo emails are sent and nothing is created in Stripe. Paid, paid-out and failed statuses are taken from the auction records.")) return;
        setSending(true);
        try {
            const { data } = await axiosInstance.post("/api/v1/admin/sales/import-history");
            const r = data.data;
            toast.success(`Imported ${r.imported} earlier sales: ${r.paid} paid, ${r.paidOut} paid out, ${r.unpaid} unpaid, ${r.failed} failed`, { duration: 8000 });
            setTab("historical");
        } catch (err) {
            toast.error(err.response?.data?.message || "Import failed");
        } finally {
            setSending(false);
        }
    };

    const button = (type, icon) => {
        const n = eligible(type).length;
        const alwaysShow =
            (type === "payment_request" && ["sold", "request_sent"].includes(tab)) ||
            (type !== "payment_request" && ["paid", "payout_due", "paid_out", "historical"].includes(tab));
        if (!n && !alwaysShow) return null;
        return (
            <button
                key={type}
                onClick={() => issue(type)}
                disabled={!n || sending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40"
            >
                {icon}
                {sending ? "Sending…" : `Send ${DOC_ACTIONS[type].plural} (${n})`}
            </button>
        );
    };

    const paidHere = sales.filter(canDocs);
    const selectAllPaid = () => setSelected(new Set(paidHere.map((s) => s._id)));

    return (
        <section className="flex min-h-screen bg-gray-50">
            <AdminSidebar />
            <div className="w-full relative">
                <AdminHeader />
                <AdminContainer>
                    <div className="max-w-full pt-16 pb-5 md:pt-0">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <h2 className="text-3xl md:text-4xl font-bold my-5">Sales</h2>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm">
                                    <RefreshCw size={16} /> Refresh
                                </button>
                                {tab === "historical" && (
                                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm cursor-pointer ${sending ? "opacity-50 pointer-events-none" : ""}`}>
                                        <Upload size={16} /> Import buyer fees
                                        <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { importBuyerFees(e.target.files?.[0]); e.target.value = ""; }} />
                                    </label>
                                )}
                                {historicalCount === 0 && (
                                    <button onClick={importHistory} disabled={sending} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm">
                                        <History size={16} /> Import earlier sales
                                    </button>
                                )}
                                {button("payment_request", <Send size={16} />)}
                                {button("buyer_receipt", <Receipt size={16} />)}
                                {button("seller_statement", <FileText size={16} />)}
                                {(payable.length > 0 || tab === "payout_due") && (
                                    <button
                                        onClick={paySellers}
                                        disabled={!payable.length || sending}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-white text-sm font-medium disabled:opacity-40"
                                    >
                                        <Banknote size={16} />
                                        {sending ? "Working…" : `Pay sellers (${payable.length})`}
                                    </button>
                                )}
                                {["sold", "request_sent", "historical", "all"].includes(tab) && (
                                    <button onClick={findStripePayments} disabled={sending} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm">
                                        <Search size={16} /> Find Stripe payments
                                    </button>
                                )}
                                {["paid", "payout_due", "paid_out", "historical"].includes(tab) && (
                                    <button onClick={matchTransfers} disabled={sending} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm">
                                        <Link2 size={16} /> Match past Stripe payouts
                                    </button>
                                )}
                            </div>
                        </div>
                        <p className="text-gray-600 text-sm">
                            Every sold lot appears here as soon as it sells, including sales paid by card. Tick sales and press a Send button:
                            payment requests go to buyers in Ready to send; receipts (buyer) and seller statements go out for paid sales. Each
                            document is emailed as a PDF, saved in the recipient&rsquo;s Documents, and copied to you. Use the red cross to mark a
                            sale as failed.
                        </p>
                    </div>

                    {needsReview > 0 && (
                        <button
                            onClick={() => { setReviewOnly(true); setTab("all"); }}
                            className="w-full text-left mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm"
                        >
                            <AlertTriangle size={18} />
                            {needsReview} sale{needsReview === 1 ? " needs" : "s need"} a VAT review before the payment request can be sent.
                            <span className="underline ml-auto">Show</span>
                        </button>
                    )}

                    <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                        <div className="flex flex-wrap gap-1 bg-white border rounded-lg p-1">
                            {TABS.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => { setTab(t.key); setReviewOnly(false); }}
                                    className={`px-3 py-1.5 rounded-md text-sm ${tab === t.key && !reviewOnly ? "bg-secondary text-white" : "text-gray-700"}`}
                                >
                                    {t.label}
                                    {t.key === "historical" ? (historicalCount ? ` (${historicalCount})` : "") : t.key !== "all" && counts[t.key] ? ` (${counts[t.key]})` : ""}
                                </button>
                            ))}
                            {reviewOnly && <span className="px-3 py-1.5 rounded-md text-sm bg-amber-500 text-white">VAT review</span>}
                        </div>
                        <label className="relative flex-1 md:max-w-xs">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Reference, item, buyer or seller"
                                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                            />
                        </label>
                    </div>

                    {tab === "historical" && sales.length > 0 && (
                        <div className="mb-4 flex flex-col md:flex-row md:items-center gap-2 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-sm">
                            <span className="flex-1">
                                Seller statements and receipts can be sent for earlier sales the buyer has paid ({paidHere.length} here). Unpaid and
                                failed earlier sales are skipped. Run <strong>Match past Stripe payouts</strong> first so statements show who has already been paid.
                            </span>
                            <button onClick={selectAllPaid} disabled={!paidHere.length} className="px-3 py-1.5 rounded-lg bg-white border border-blue-300 font-medium disabled:opacity-40">
                                Select all paid ({paidHere.length})
                            </button>
                        </div>
                    )}

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-16">
                        {loading ? (
                            <LoadingSpinner height="300px" />
                        ) : sales.length === 0 ? (
                            <p className="p-10 text-center text-gray-500">No sales here.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                        <tr>
                                            <th className="p-3 text-left">
                                                <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} disabled={!selectable.length} />
                                            </th>
                                            <th className="p-3 text-left">Sale</th>
                                            <th className="p-3 text-left">Buyer</th>
                                            <th className="p-3 text-left">Seller</th>
                                            <th className="p-3 text-right">Item</th>
                                            <th className="p-3 text-right">VAT</th>
                                            <th className="p-3 text-right">Buyer fee</th>
                                            <th className="p-3 text-right">Total</th>
                                            <th className="p-3 text-left">Status</th>
                                            <th className="p-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {sales.map((s) => (
                                            <tr key={s._id} className={selected.has(s._id) ? "bg-amber-50/50" : ""}>
                                                <td className="p-3 align-top">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Select ${s.reference}`}
                                                        checked={selected.has(s._id)}
                                                        disabled={!canSend(s) && !canDocs(s) && !canPay(s)}
                                                        onChange={() => toggle(s._id)}
                                                    />
                                                </td>
                                                <td className="p-3 align-top min-w-[180px]">
                                                    <div className="font-semibold">{s.reference}</div>
                                                    <div className="text-gray-700">{s.title}</div>
                                                    <div className="text-xs text-gray-500">Sold {shortDate(s.saleDate)}</div>
                                                    {s.payment?.cardCheckoutAvailable && ["sold", "request_sent"].includes(s.status) && (
                                                        <span
                                                            className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
                                                            title="Under €1,000: the buyer can pay by card at checkout, or by bank transfer"
                                                        >
                                                            Card OK
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 align-top min-w-[160px]">
                                                    <div>{s.buyer?.name || s.buyer?.username}</div>
                                                    <div className="text-xs text-gray-500">{s.buyer?.email}</div>
                                                    {s.buyer?.phone && (
                                                        <a href={`tel:${s.buyer.phone.replace(/\s+/g, "")}`} className="text-xs text-gray-700 block">
                                                            {s.buyer.phone}
                                                        </a>
                                                    )}
                                                    <div className="text-xs text-gray-500">{s.buyer?.region || "Location unknown"}</div>
                                                    {s.stripe?.bankTransfer?.iban || s.stripe?.bankTransfer?.accountNumber ? (
                                                        <div className="text-xs font-mono text-gray-700 mt-1" title="Buyer's own Stripe bank-transfer account">
                                                            {s.stripe.bankTransfer.iban ||
                                                                `${s.stripe.bankTransfer.sortCode} ${s.stripe.bankTransfer.accountNumber}`}
                                                        </div>
                                                    ) : ["sold", "request_sent"].includes(s.status) ? (
                                                        <div
                                                            className={`text-xs mt-1 ${s.stripe?.ibanError ? "text-red-600" : "text-gray-400"}`}
                                                            title={s.stripe?.ibanError || ""}
                                                        >
                                                            {s.stripe?.ibanError ? "IBAN failed – press Refresh" : "Getting IBAN from Stripe…"}
                                                        </div>
                                                    ) : null}
                                                </td>
                                                <td className="p-3 align-top min-w-[140px]">
                                                    <div>{s.seller?.companyName || s.seller?.name || s.seller?.username}</div>
                                                    {s.seller?.phone && (
                                                        <a href={`tel:${s.seller.phone.replace(/\s+/g, "")}`} className="text-xs text-gray-700 block">
                                                            {s.seller.phone}
                                                        </a>
                                                    )}
                                                    <div className="text-xs text-gray-500">Item in {s.vat?.itemRegion || "unknown"}</div>
                                                    {s.sellerPayout && (
                                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                                            <span
                                                                className={`text-[11px] px-1.5 py-0.5 rounded ${
                                                                    s.sellerPayout.state === "ready"
                                                                        ? "bg-green-50 text-green-700"
                                                                        : s.sellerPayout.state === "incomplete"
                                                                          ? "bg-amber-50 text-amber-700"
                                                                          : "bg-gray-100 text-gray-600"
                                                                }`}
                                                                title="Seller's Stripe payout account"
                                                            >
                                                                {s.sellerPayout.state === "ready"
                                                                    ? `Payouts ready${s.sellerPayout.bankLast4 ? ` ·${s.sellerPayout.bankLast4}` : ""}`
                                                                    : s.sellerPayout.state === "incomplete"
                                                                      ? "Payout setup incomplete"
                                                                      : "No payout account"}
                                                            </span>
                                                            {s.sellerPayout.state !== "ready" && !s.historical && (
                                                                <button onClick={() => sendPayoutSetup(s)} className="text-[11px] underline text-primary">
                                                                    Send setup link
                                                                </button>
                                                            )}
                                                            {s.sellerPayout.state !== "ready" && (
                                                                <button onClick={() => setLinkSale(s)} className="text-[11px] underline text-gray-600">
                                                                    Link Stripe account
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 align-top text-right whitespace-nowrap">{formatMoney(s.itemPrice, s.currency)}</td>
                                                <td className="p-3 align-top text-right whitespace-nowrap">
                                                    {vatSummary(s)}
                                                    {s.vat?.reviewRequired && (
                                                        <button onClick={() => setVatSale(s)} className="mt-1 flex items-center gap-1 ml-auto text-xs font-medium text-amber-700">
                                                            <AlertTriangle size={14} /> Review
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="p-3 align-top text-right whitespace-nowrap">
                                                    {formatMoney(s.buyerFee, s.currency)}
                                                    {(s.historical || ["sold", "failed"].includes(s.status)) && (
                                                        <button title="Change buyer fee" onClick={() => editBuyerFee(s)} className="ml-1 text-gray-400 hover:text-primary align-middle">
                                                            <Pencil size={13} />
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="p-3 align-top text-right whitespace-nowrap font-semibold">{formatMoney(s.total, s.currency)}</td>
                                                <td className="p-3 align-top">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[s.status] || "bg-gray-100"}`}>
                                                        {STATUS_LABELS[s.status] || s.status}
                                                    </span>
                                                    {s.payment?.paidAt && !["sold", "request_sent"].includes(s.status) && (
                                                        <div className="text-xs mt-1 text-gray-500">
                                                            {PAYMENT_METHODS[s.payment.method] || "Paid"} · {shortDate(s.payment.paidAt)}
                                                        </div>
                                                    )}
                                                    {s.status === "failed" && s.failure?.reason && (
                                                        <div className="text-xs mt-1 text-red-700 max-w-[180px]">{s.failure.reason}</div>
                                                    )}
                                                    {canDocs(s) && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            <span className={`text-[11px] px-1.5 py-0.5 rounded ${hasDoc(s, "buyer_receipt") ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                                {hasDoc(s, "buyer_receipt") ? "✓" : "○"} Receipt
                                                            </span>
                                                            <span className={`text-[11px] px-1.5 py-0.5 rounded ${hasDoc(s, "seller_statement") ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                                {hasDoc(s, "seller_statement") ? "✓" : "○"} Statement
                                                            </span>
                                                        </div>
                                                    )}
                                                    {["paid", "collected"].includes(s.status) && (
                                                        <div className="text-[11px] mt-1 text-gray-600">
                                                            Collected: buyer {s.collection?.buyerConfirmedAt ? "✓" : "○"} · seller {s.collection?.sellerConfirmedAt ? "✓" : "○"}
                                                            {s.collection?.dueBy && (
                                                                <div className={new Date(s.collection.dueBy) < new Date() ? "text-red-600 font-medium" : "text-gray-500"}>
                                                                    Collect by {shortDate(s.collection.dueBy)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {s.status === "payout_due" && (
                                                        <div className="text-[11px] mt-1 text-purple-800 font-medium">
                                                            Pay {formatMoney(netPayout(s), s.currency)}
                                                            {s.collection?.releasedEarly?.note && <div className="font-normal text-gray-500">Released early: {s.collection.releasedEarly.note}</div>}
                                                        </div>
                                                    )}
                                                    {s.status === "paid_out" && s.payout?.paidAt && (
                                                        <div className="text-[11px] mt-1 text-gray-500">
                                                            {formatMoney(s.payout.amount, s.currency)} · {shortDate(s.payout.paidAt)}
                                                            {s.payout.reference && (
                                                                <div className="font-mono">
                                                                    {s.payout.method === "bank_transfer" ? "Bank: " : ""}
                                                                    {s.payout.reference}
                                                                    {s.payout.matched ? " (matched)" : ""}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {s.historical && <div className="text-[11px] mt-1 text-gray-400">Earlier sale</div>}
                                                    {s.status === "request_sent" && s.payment?.dueAt && (
                                                        <div className={`text-xs mt-1 ${new Date(s.payment.dueAt) < new Date() ? "text-red-600 font-medium" : "text-gray-500"}`}>
                                                            Due {shortDate(s.payment.dueAt)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 align-top text-right whitespace-nowrap">
                                                    <div className="flex justify-end gap-1">
                                                        {["sold", "request_sent"].includes(s.status) && (
                                                            <button
                                                                title="Preview payment request"
                                                                onClick={() => openPdf(`/api/v1/admin/sales/${s._id}/payment-request/preview`, `${s.reference}-draft.pdf`)}
                                                                className="p-2 rounded-lg hover:bg-gray-100"
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                        )}
                                                        {["sold", "request_sent"].includes(s.status) && !s.vat?.reviewRequired && s.vat?.applicable && (
                                                            <button title="Change VAT" onClick={() => setVatSale(s)} className="p-2 rounded-lg hover:bg-gray-100 text-xs">
                                                                VAT
                                                            </button>
                                                        )}
                                                        {canDocs(s) && (
                                                            <>
                                                                <button
                                                                    title="Preview receipt"
                                                                    onClick={() => openPdf(`/api/v1/admin/sales/${s._id}/receipt/preview`, `${s.reference}-receipt-draft.pdf`)}
                                                                    className="p-2 rounded-lg hover:bg-gray-100"
                                                                >
                                                                    <Receipt size={16} />
                                                                </button>
                                                                <button
                                                                    title="Preview seller statement"
                                                                    onClick={() => openPdf(`/api/v1/admin/sales/${s._id}/statement/preview`, `${s.reference}-statement-draft.pdf`)}
                                                                    className="p-2 rounded-lg hover:bg-gray-100"
                                                                >
                                                                    <Eye size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {["paid", "collected", "payout_due"].includes(s.status) && !s.payout?.reference && (
                                                            <button title="Record payout (paid from BOI, or already paid in the Stripe Dashboard)" onClick={() => setManualSale(s)} className="p-2 rounded-lg hover:bg-gray-100">
                                                                <Landmark size={16} />
                                                            </button>
                                                        )}
                                                        {["paid", "collected"].includes(s.status) && (
                                                            <button title="Release payout early (both parties agreed)" onClick={() => releaseEarly(s)} className="p-2 rounded-lg hover:bg-gray-100">
                                                                <Unlock size={16} />
                                                            </button>
                                                        )}
                                                        {["sold", "request_sent", "failed"].includes(s.status) && (
                                                            <button title="Record payment (paid outside this page)" onClick={() => setPaySale(s)} className="p-2 rounded-lg hover:bg-green-50 text-green-700">
                                                                <CheckCircle size={16} />
                                                            </button>
                                                        )}
                                                        {canFail(s) && (
                                                            <button title="Mark as failed" onClick={() => markFailed(s)} className="p-2 rounded-lg hover:bg-red-50 text-red-600">
                                                                <XCircle size={16} />
                                                            </button>
                                                        )}
                                                        {s.status === "failed" && (
                                                            <button title="Reopen" onClick={() => reopen(s)} className="p-2 rounded-lg hover:bg-gray-100">
                                                                <RotateCcw size={16} />
                                                            </button>
                                                        )}
                                                        <button
                                                            title="Documents"
                                                            onClick={() => setDocsSale(s)}
                                                            disabled={!s.documents?.length}
                                                            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 inline-flex items-center gap-1"
                                                        >
                                                            <FileText size={16} />
                                                            {s.documents?.length ? <span className="text-xs">{s.documents.length}</span> : null}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </AdminContainer>
            </div>

            {vatSale && (
                <VatModal
                    sale={vatSale}
                    onClose={() => setVatSale(null)}
                    onSaved={() => { setVatSale(null); load(); }}
                />
            )}

            {linkSale && <LinkStripeAccountModal sale={linkSale} onClose={() => setLinkSale(null)} onDone={() => { setLinkSale(null); load(); }} />}

            {paySale && <RecordPaymentModal sale={paySale} onClose={() => setPaySale(null)} onDone={() => { setPaySale(null); load(); }} />}

            {manualSale && (
                <ManualPayoutModal sale={manualSale} onClose={() => setManualSale(null)} onDone={() => { setManualSale(null); load(); }} />
            )}

            {matchResult && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setMatchResult(null)}>
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b">
                            <h3 className="text-lg font-semibold">Past Stripe payouts</h3>
                            <button onClick={() => setMatchResult(null)} aria-label="Close"><X size={20} /></button>
                        </div>
                        <div className="p-5 space-y-5 text-sm">
                            <section>
                                <h4 className="font-semibold mb-2">Matched and marked paid out ({matchResult.matched.length})</h4>
                                {matchResult.matched.length ? (
                                    <ul className="space-y-1">{matchResult.matched.map((m) => <li key={m.transferId}>{m.reference} · {m.title} · {formatMoney(m.amount)} · <span className="font-mono">{m.transferId}</span></li>)}</ul>
                                ) : <p className="text-gray-500">None.</p>}
                            </section>
                            <section>
                                <h4 className="font-semibold mb-2">Paid sales not yet paid out ({matchResult.unmatchedSales.length})</h4>
                                {matchResult.unmatchedSales.length ? (
                                    <ul className="space-y-1">{matchResult.unmatchedSales.map((m) => <li key={m.reference}>{m.reference} · {m.title} · {m.seller} · {formatMoney(m.amount)} <span className="text-gray-500">({m.reason})</span></li>)}</ul>
                                ) : <p className="text-gray-500">None.</p>}
                                <p className="text-gray-500 mt-2">Recent sales here are simply still awaiting collection or payout. Older ones may have been paid a different amount.</p>
                            </section>
                            <section>
                                <h4 className="font-semibold mb-2">Stripe transfers not matched to a sale ({matchResult.unmatchedTransfers.length})</h4>
                                {matchResult.unmatchedTransfers.length ? (
                                    <ul className="space-y-1">{matchResult.unmatchedTransfers.map((t) => <li key={t.transferId}><span className="font-mono">{t.transferId}</span> · {formatMoney(t.amount, t.currency)} · {shortDate(t.date)} · {t.seller || t.destination}</li>)}</ul>
                                ) : <p className="text-gray-500">None.</p>}
                                <p className="text-gray-500 mt-2">These usually differ in amount (e.g. a fee was taken off by hand). Check them in Stripe.</p>
                            </section>
                        </div>
                    </div>
                </div>
            )}

            {docsSale && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDocsSale(null)}>
                    <div className="bg-white rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b">
                            <h3 className="text-lg font-semibold">Documents · {docsSale.reference}</h3>
                            <button onClick={() => setDocsSale(null)} aria-label="Close"><X size={20} /></button>
                        </div>
                        <ul className="divide-y">
                            {[...(docsSale.documents || [])].reverse().map((d) => (
                                <li key={d._id} className="p-4 flex items-center gap-3 text-sm">
                                    <div className="flex-1">
                                        <div className="font-medium">
                                            {DOCUMENT_LABELS[d.type]} · {d.number}
                                            {d.supersededAt && <span className="ml-2 text-xs text-gray-500">(replaced)</span>}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Issued {shortDate(d.issuedAt)} · {formatMoney(d.total, d.currency)}
                                            {d.emailedAt ? ` · emailed to ${d.emailedTo}` : d.emailError ? ` · ${d.emailError}` : ""}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openPdf(`/api/v1/admin/sales/${docsSale._id}/documents/${d._id}`, `${d.number}.pdf`)}
                                        className="px-3 py-1.5 rounded-lg border text-sm"
                                    >
                                        View
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}

export default Sales;
