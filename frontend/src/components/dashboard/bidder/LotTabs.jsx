import { useState } from "react";
import { Link } from "react-router-dom";
import { ImageOff } from "lucide-react";
import { money, endsLabel } from "./format";

const CHIP = {
    winning: ["Winning", "bg-[#E3F4EA] text-[#1C6B3A]"],
    outbid: ["Outbid", "bg-[#FBE3DE] text-[#8A2E1F]"],
    won: ["Won", "bg-[#E7EEF8] text-[#23446E]"],
    lost: ["Lost", "bg-gray-100 text-gray-700"],
    pending: ["Offer pending", "bg-[#FDF2DD] text-[#7A5418]"],
    countered: ["Seller countered", "bg-[#FDF2DD] text-[#7A5418]"],
    accepted: ["Offer accepted", "bg-[#E3F4EA] text-[#1C6B3A]"],
    rejected: ["Offer declined", "bg-gray-100 text-gray-700"],
    withdrawn: ["Withdrawn", "bg-gray-100 text-gray-700"],
    expired: ["Expired", "bg-gray-100 text-gray-700"],
};

const btn = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg font-semibold whitespace-nowrap";
const goldBtn = `${btn} bg-[#D19F3E] text-[#072342] hover:bg-[#c08f31]`;
const lineBtn = `${btn} border border-gray-300 bg-white text-[#072342] hover:bg-gray-50`;

function Thumb({ src, title }) {
    return src ? (
        <img src={src} alt={title} loading="lazy" className="w-full sm:w-28 h-40 sm:h-20 object-cover rounded-lg bg-gray-100 shrink-0" />
    ) : (
        <div className="w-full sm:w-28 h-40 sm:h-20 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 shrink-0" aria-hidden="true">
            <ImageOff size={22} />
        </div>
    );
}

function Row({ title, image, chips = [], detail, priceLabel, price, action }) {
    return (
        <article className="flex flex-col sm:flex-row sm:items-center gap-4 border border-gray-200 rounded-2xl p-3.5">
            <Thumb src={image} title={title} />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[17px] font-semibold text-[#0F1B2D] truncate max-w-full">{title}</h3>
                    {chips.map(([text, cls]) => (
                        <span key={text} className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${cls}`}>{text}</span>
                    ))}
                </div>
                {detail && <p className="text-sm text-gray-500">{detail}</p>}
            </div>
            <div className="flex sm:flex-col items-baseline sm:items-end justify-between gap-2 sm:text-right">
                <span className="text-[13px] text-gray-500">{priceLabel}</span>
                <span className="text-[22px] font-bold text-[#0F1B2D]">{price}</span>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </article>
    );
}

const Empty = ({ children }) => <p className="text-gray-500 py-8 text-center">{children}</p>;

function LotTabs({ bids, watchlist, offers }) {
    const now = Date.now();
    const live = bids.filter((b) => ["winning", "outbid"].includes(b.status) && new Date(b.endTime).getTime() > now);
    const won = bids.filter((b) => b.status === "won");
    const lost = bids.filter((b) => b.status === "lost" || (["winning", "outbid"].includes(b.status) && new Date(b.endTime).getTime() <= now));
    const openOffers = offers.filter((o) => ["pending", "countered", "accepted"].includes(o.status));
    const tabs = [
        { id: "live", label: "Live bids", count: live.length },
        { id: "watching", label: "Watching", count: watchlist.length },
        { id: "offers", label: "Offers", count: openOffers.length },
        { id: "won", label: "Won", count: won.length },
        { id: "lost", label: "Lost", count: lost.length },
    ];
    const [tab, setTab] = useState("live");

    let body;
    if (tab === "live") {
        body = live.length ? live.map((b) => (
            <Row
                key={b.id}
                title={b.title}
                image={b.image}
                chips={[CHIP[b.status], ...(b.reserveNotMet ? [["Reserve not met yet", "bg-gray-100 text-gray-700"]] : [])]}
                detail={`Your bid ${money(b.myBid, b.currency)} · ${b.bids || 0} bids · ${endsLabel(b.endTime)}`}
                priceLabel="Current bid"
                price={money(b.currentBid, b.currency)}
                action={b.status === "outbid"
                    ? <Link to={`/auction/${b.id}`} className={goldBtn}>{b.nextMinBid ? `Bid ${money(b.nextMinBid, b.currency)}` : "Bid again"}</Link>
                    : <Link to={`/auction/${b.id}`} className={lineBtn}>View lot</Link>}
            />
        )) : <Empty>You're not bidding on anything right now. <Link to="/auctions" className="underline">Browse auctions</Link></Empty>;
    } else if (tab === "watching") {
        body = watchlist.length ? watchlist.map((w) => (
            <Row
                key={w.id}
                title={w.title}
                image={w.image}
                detail={`${w.bids} bids · ${endsLabel(w.endTime)}`}
                priceLabel="Current bid"
                price={money(w.currentBid, w.currency)}
                action={<Link to={`/auction/${w.id}`} className={lineBtn}>View lot</Link>}
            />
        )) : <Empty>Nothing saved yet. Tap the bookmark on any listing to watch it.</Empty>;
    } else if (tab === "offers") {
        body = openOffers.length ? openOffers.map((o) => (
            <Row
                key={o.id}
                title={o.title}
                image={o.image}
                chips={[CHIP[o.status] || [o.status, "bg-gray-100 text-gray-700"]]}
                detail={o.status === "countered" && o.counterAmount != null ? `Seller's counter: ${money(o.counterAmount, o.currency)}` : o.expiresAt ? `Expires ${new Date(o.expiresAt).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                priceLabel="Your offer"
                price={money(o.amount, o.currency)}
                action={<Link to="/bidder/offers" className={o.status === "countered" ? goldBtn : lineBtn}>{o.status === "countered" ? "Review" : "Manage"}</Link>}
            />
        )) : <Empty>No open offers.</Empty>;
    } else if (tab === "won") {
        body = won.length ? won.map((b) => (
            <Row
                key={b.id}
                title={b.title}
                image={b.image}
                chips={[CHIP.won]}
                detail="Payment and collection details are in Documents."
                priceLabel="Winning bid"
                price={money(b.currentBid, b.currency)}
                action={<Link to="/bidder/documents" className={lineBtn}>Documents</Link>}
            />
        )) : <Empty>No wins yet.</Empty>;
    } else {
        body = lost.length ? lost.map((b) => (
            <Row
                key={b.id}
                title={b.title}
                image={b.image}
                chips={[CHIP.lost]}
                detail={`Your bid ${money(b.myBid, b.currency)}`}
                priceLabel="Final bid"
                price={money(b.currentBid, b.currency)}
                action={<Link to={`/auction/${b.id}`} className={lineBtn}>View lot</Link>}
            />
        )) : <Empty>Nothing here.</Empty>;
    }

    return (
        <section aria-labelledby="bidder-lots" className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
            <h2 id="bidder-lots" className="text-lg font-semibold text-[#072342]">Lots I'm bidding on</h2>
            <div role="tablist" aria-label="Filter" className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`shrink-0 min-h-[44px] px-4 rounded-full font-medium ${tab === t.id ? "bg-[#072342] text-white" : "border border-gray-300 bg-white text-[#072342] hover:bg-gray-50"}`}
                    >
                        {t.label} ({t.count})
                    </button>
                ))}
            </div>
            <div className="flex flex-col gap-3">{body}</div>
        </section>
    );
}

export default LotTabs;
