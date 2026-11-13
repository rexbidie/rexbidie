import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import axiosInstance from "../../../utils/axiosInstance";
import { formatMoney, openPdf } from "../../../utils/openPdf";
import { money, endsLabel } from "./format";

const shortDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" }) : "";

const TONES = {
    green: "bg-[#E3F4EA] border-[#A9D8BA] text-[#24503A]",
    red: "bg-[#FFF1EE] border-[#F1C2B8] text-[#6B2D22]",
    amber: "bg-[#FFF7EA] border-[#F0D8AE] text-[#5B4A2A]",
    plain: "bg-white border-gray-200 text-gray-600",
};

const primaryBtn = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-[#072342] text-white font-semibold hover:bg-[#0b3360] disabled:opacity-50";
const secondaryBtn = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-[#072342] font-semibold hover:bg-gray-50 disabled:opacity-50";

function AttentionCard({ item, onChanged }) {
    const [busy, setBusy] = useState(false);

    const confirmCollected = async () => {
        const c = item.collection;
        if (!window.confirm(`Confirm you have collected ${c.title}?`)) return;
        setBusy(true);
        try {
            await axiosInstance.post(`/api/v1/sales/${c.saleId}/confirm-collection`);
            toast.success("Thanks, collection confirmed.");
            onChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not confirm collection");
        } finally {
            setBusy(false);
        }
    };

    let title, body, action;
    if (item.kind === "pay") {
        const d = item.doc;
        title = `You won ${d.title}`;
        body = `Pay ${formatMoney(d.total, d.currency)}. The bank details and your IBAN are in the payment request.`;
        action = (
            <button
                type="button"
                className={primaryBtn}
                onClick={() => openPdf(`/api/v1/sales/${d.saleId}/documents/${d.documentId}`, `${d.number}.pdf`)}
            >
                View payment request
            </button>
        );
    } else if (item.kind === "collect") {
        const c = item.collection;
        title = `Collect ${c.title}`;
        body = `Paid. ${c.collectBy ? `Collect by ${shortDate(c.collectBy)}, then` : "Once collected,"} tick it off so the seller is paid.`;
        action = (
            <button type="button" className={secondaryBtn} onClick={confirmCollected} disabled={busy}>
                I've collected it
            </button>
        );
    } else if (item.kind === "outbid") {
        const b = item.bid;
        title = `Outbid on ${b.title}`;
        body = `Now ${money(b.currentBid, b.currency)}. ${endsLabel(b.endTime)}.`;
        action = <Link to={`/auction/${b.id}`} className={primaryBtn}>Bid again</Link>;
    } else {
        const o = item.offer;
        title = `The seller countered your offer`;
        body = `${o.title}: ${o.counterAmount != null ? money(o.counterAmount, o.currency) : "see the counter offer"}.`;
        action = <Link to="/bidder/offers" className={primaryBtn}>Review offer</Link>;
    }

    return (
        <div className={`rounded-2xl border p-4 flex flex-col gap-2.5 ${TONES[item.tone]}`}>
            <p className="font-semibold text-[#0F1B2D]">{title}</p>
            <p className="text-sm flex-1">{body}</p>
            <div>{action}</div>
        </div>
    );
}

function AttentionCards({ items, onChanged }) {
    if (!items.length) return null;
    return (
        <section aria-labelledby="bidder-attention" className="flex flex-col gap-3">
            <h2 id="bidder-attention" className="text-lg font-semibold text-[#072342]">Needs your attention</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {items.map((item) => (
                    <AttentionCard key={item.key} item={item} onChanged={onChanged} />
                ))}
            </div>
        </section>
    );
}

export default AttentionCards;
