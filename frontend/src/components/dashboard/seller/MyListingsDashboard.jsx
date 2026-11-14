import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Loader, MoreHorizontal, Plus, Search } from "lucide-react";
import axiosInstance from "../../../utils/axiosInstance";
import { useAuth } from "../../../contexts/AuthContext";
import { LowerReserveModal } from "../..";
import BinDashboardModal from "../../buyItNow/BinDashboardModal";
import ListingExtrasPaymentModal from "../../listing/ListingExtrasPaymentModal";
import IncrementModal from "./IncrementModal";
import PromoteModal from "./PromoteModal";
import { BuyItNowPriceModal, StartPriceModal } from "./PriceModals";

// Seller / company / broker dashboard home: their listings first, with what
// needs doing at the top. basePath is "/seller", "/company" or "/broker".

const SOLD = ["sold", "sold_buy_now"];
const ENDED = ["ended", "reserve_not_met", "cancelled"];
const WAITING = ["draft", "approved", "awaiting_payment"];
const CAN_PROMOTE = ["draft", "approved", "active"];
const CAN_CHANGE_INCREMENT = ["draft", "approved", "active", "awaiting_payment"];
const BIN_AFTER_STATUSES = ["draft", "approved", "active", "reserve_not_met"];

const isTimed = (a) => a.auctionType === "standard" || a.auctionType === "reserve";
const isLive = (a, now) => a.status === "active" && new Date(a.endDate) > now;
const curSym = (c) => (c === "GBP" ? "£" : "€");
const money = (n, c) => (n || n === 0 ? `${curSym(c)}${Number(n).toLocaleString("en-IE", { maximumFractionDigits: 0 })}` : "–");
const dateTime = (d) => new Date(d).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const featuredPrice = (c) => (c === "GBP" ? "£24" : "€30");
const metaFrom = (c) => (c === "GBP" ? "from £8" : "from €10");

const timeLeft = (end, now) => {
    const ms = new Date(end) - now;
    if (ms <= 0) return "Ended";
    const h = Math.floor(ms / 36e5);
    if (h >= 48) return `${Math.floor(h / 24)} days left`;
    if (h >= 1) return `${h}h ${Math.floor((ms % 36e5) / 6e4)}m left`;
    return `${Math.max(1, Math.floor(ms / 6e4))}m left`;
};

const pendingOffers = (a) => (a.offers || []).filter((o) => o.status === "pending");

const statusChip = (a, now) => {
    if (a.status === "awaiting_payment") return ["Not submitted: payment needed", "bg-orange-100 text-orange-800"];
    if (a.status === "draft") return ["Waiting for approval", "bg-blue-100 text-blue-800"];
    if (a.status === "approved") return [`Approved · starts ${dateTime(a.startDate)}`, "bg-blue-100 text-blue-800"];
    if (isLive(a, now)) return ["Live", "bg-green-100 text-green-800"];
    if (a.status === "active") return ["Ending", "bg-amber-100 text-amber-800"];
    if (a.status === "reserve_not_met") return ["Reserve not met", "bg-amber-100 text-amber-800"];
    if (SOLD.includes(a.status)) return [a.status === "sold_buy_now" ? "Sold (Buy It Now)" : "Sold", "bg-[#072342] text-white"];
    if (a.status === "cancelled") return ["Withdrawn", "bg-gray-200 text-gray-700"];
    return ["Ended", "bg-gray-200 text-gray-700"];
};

/** Things the seller should do, newest problems first. */
const attentionItems = (auctions, now) => {
    const items = [];
    for (const a of auctions) {
        if (a.status === "awaiting_payment" && a.extrasPayment?.status !== "completed") items.push({ kind: "pay", a });
        if (a.pendingEdit?.status === "rejected") items.push({ kind: "editRejected", a });
        if (pendingOffers(a).length && !SOLD.includes(a.status)) items.push({ kind: "offers", a });
        if (a.status === "reserve_not_met" && !a.postAuctionBin?.status && now - new Date(a.endDate) < 72 * 36e5) items.push({ kind: "reserveNotMet", a });
    }
    return items;
};

const TABS = [
    { id: "live", label: "Live", test: (a, now) => isLive(a, now) },
    { id: "action", label: "Needs action", test: null },
    // Unpaid extras aren't with RexBid yet: those show under Needs action only.
    { id: "waiting", label: "Waiting for approval", test: (a) => (WAITING.includes(a.status) && a.status !== "awaiting_payment") || a.pendingEdit?.status === "pending" },
    { id: "ended", label: "Ended / unsold", test: (a, now) => ENDED.includes(a.status) || (a.status === "active" && !isLive(a, now)) },
    { id: "sold", label: "Sold", test: (a) => SOLD.includes(a.status) },
    { id: "all", label: "All", test: () => true },
];

const btn = "inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg font-semibold text-sm transition";
const btnPrimary = `${btn} bg-[#072342] text-white hover:bg-[#0b3360]`;
const btnSecondary = `${btn} border border-gray-300 bg-white text-[#072342] hover:bg-gray-50`;

function MyListingsDashboard({ basePath }) {
    const { user } = useAuth();
    const userCurrency = user?.currency || "EUR";
    const [auctions, setAuctions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [tab, setTab] = useState(null);
    const [search, setSearch] = useState("");
    const [menuId, setMenuId] = useState(null);
    const [reserveLot, setReserveLot] = useState(null);
    const [incrementLot, setIncrementLot] = useState(null);
    const [promote, setPromote] = useState(null);
    const [binLot, setBinLot] = useState(null);
    const [binPriceLot, setBinPriceLot] = useState(null);
    const [startLot, setStartLot] = useState(null);
    const [extras, setExtras] = useState(null);
    const now = useMemo(() => new Date(), [auctions]);

    const load = useCallback(async () => {
        try {
            const params = new URLSearchParams({ page: "1", limit: "200", status: "", currency: userCurrency });
            const { data } = await axiosInstance.get(`/api/v1/auctions/user/my-auctions?${params}`);
            if (data.success) setAuctions(data.data.auctions || []);
        } catch (err) {
            console.error("Load listings failed:", err);
            toast.error("Could not load your listings");
        } finally {
            setLoading(false);
        }
    }, [userCurrency]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        axiosInstance.get(`/api/v1/users/stats/seller?currency=${userCurrency}`)
            .then(({ data }) => data.success && setStats(data.data.statistics))
            .catch(() => {});
    }, [userCurrency]);

    const todo = useMemo(() => attentionItems(auctions, now), [auctions, now]);
    const todoIds = useMemo(() => new Set(todo.map((t) => String(t.a._id))), [todo]);
    const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, t.id === "action" ? todoIds.size : auctions.filter((a) => t.test(a, now)).length])), [auctions, now, todoIds]);
    const activeTab = tab || (counts.live ? "live" : todoIds.size ? "action" : "all");

    const shown = useMemo(() => {
        const t = TABS.find((x) => x.id === activeTab);
        const q = search.trim().toLowerCase();
        return auctions
            .filter((a) => (t.id === "action" ? todoIds.has(String(a._id)) : t.test(a, now)))
            .filter((a) => !q || a.title?.toLowerCase().includes(q) || String(a.lotNumber || "").includes(q))
            .sort((a, b) => (isLive(a, now) && isLive(b, now) ? new Date(a.endDate) - new Date(b.endDate) : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)));
    }, [auctions, activeTab, search, now, todoIds]);

    const payExtras = async (a) => {
        try {
            const { data } = await axiosInstance.post(`/api/v1/auctions/${a._id}/retry-extras-payment`);
            if (data.success) setExtras({ payment: data.data, id: a._id });
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not start the payment");
        }
    };
    const submitWithout = async (a) => {
        if (!window.confirm("Submit this listing without Featured / Meta Boost? You won't be charged for them.")) return;
        try {
            const { data } = await axiosInstance.post(`/api/v1/auctions/${a._id}/submit-without-extras`);
            toast.success(data.message);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not submit the listing");
        }
    };
    const discardEdit = async (a) => {
        const pending = a.pendingEdit?.status === "pending";
        if (pending && !window.confirm("Discard the changes waiting for approval? The listing stays as it is.")) return;
        try {
            await axiosInstance.delete(`/api/v1/auctions/${a._id}/pending-edit`);
            toast.success(pending ? "Changes discarded" : "Dismissed");
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not discard the changes");
        }
    };

    const firstName = user?.firstName || user?.companyName || "";

    return (
        <div className="flex flex-col gap-6 pb-10">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    {firstName && <p className="text-gray-600">Hello, {firstName}</p>}
                    <h1 className="text-3xl font-bold text-[#072342]">My Listings</h1>
                </div>
                <div className="flex flex-wrap gap-3">
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-2"><div className="text-xs text-gray-500">Live now</div><div className="text-xl font-bold">{counts.live ?? 0}</div></div>
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-2"><div className="text-xs text-gray-500">Sold</div><div className="text-xl font-bold">{stats?.soldAuctions ?? counts.sold ?? 0}</div></div>
                    <div className="rounded-xl border border-gray-200 bg-white px-4 py-2"><div className="text-xs text-gray-500">Total sales</div><div className="text-xl font-bold">{money(stats?.totalRevenue || 0, userCurrency)}</div></div>
                    <Link to={`${basePath}/auctions/create`} className={`${btn} bg-[#D19F3E] text-[#072342] hover:shadow-md self-center`}><Plus size={18} className="mr-1" /> Create Listing</Link>
                </div>
            </header>

            {todo.length > 0 && (
                <section aria-labelledby="todo-h" className="flex flex-col gap-3">
                    <h2 id="todo-h" className="text-lg font-semibold text-[#072342]">Needs your attention</h2>
                    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3">
                        {todo.slice(0, 6).map(({ kind, a }) => (
                            <div key={`${kind}-${a._id}`} className={`w-[85%] shrink-0 snap-start rounded-2xl border p-4 flex flex-col gap-2 md:w-auto ${kind === "pay" ? "bg-[#FFF7EA] border-[#F0D8AE]" : kind === "editRejected" ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
                                {kind === "pay" && <>
                                    <p className="font-semibold">{a.title}: not submitted</p>
                                    <p className="text-sm text-gray-700">{a.extrasPayment?.lineItems?.map((l) => l.label).join(" + ") || "Extras"} not paid yet ({money(a.extrasPayment?.amount, a.extrasPayment?.currency)}). It goes for approval once paid.</p>
                                    <div className="flex flex-wrap gap-2 mt-auto"><button type="button" className={btnPrimary} onClick={() => payExtras(a)}>Pay {money(a.extrasPayment?.amount, a.extrasPayment?.currency)}</button><button type="button" className={btnSecondary} onClick={() => submitWithout(a)}>Submit without</button></div>
                                </>}
                                {kind === "editRejected" && <>
                                    <p className="font-semibold">{a.title}: changes sent back</p>
                                    <p className="text-sm text-gray-700 whitespace-pre-line">{a.pendingEdit?.note}</p>
                                    <div className="flex flex-wrap gap-2 mt-auto"><Link className={btnPrimary} to={`${basePath}/auctions/edit/${a._id}`}>Edit again</Link><button type="button" className={btnSecondary} onClick={() => discardEdit(a)}>Dismiss</button></div>
                                </>}
                                {kind === "offers" && <>
                                    <p className="font-semibold">{pendingOffers(a).length} offer{pendingOffers(a).length === 1 ? "" : "s"} waiting for you</p>
                                    <p className="text-sm text-gray-600">{a.title}: {pendingOffers(a).map((o) => money(o.amount, a.baseCurrency)).join(", ")}</p>
                                    <div className="mt-auto"><Link className={btnPrimary} to={`${basePath}/offers/all`}>Review offers</Link></div>
                                </>}
                                {kind === "reserveNotMet" && <>
                                    <p className="font-semibold">{a.title}: reserve not met</p>
                                    <p className="text-sm text-gray-600">Top bid {money(a.currentPrice, a.baseCurrency)}. Offer it on Last Chance at a fixed price for 48 hours, or relist it.</p>
                                    <div className="flex flex-wrap gap-2 mt-auto"><button type="button" className={btnPrimary} onClick={() => setBinLot(a)}>Start Last Chance</button><Link className={btnSecondary} to={`${basePath}/auctions/edit/${a._id}`}>Relist</Link></div>
                                </>}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section aria-labelledby="list-h" className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="list-h" className="text-lg font-semibold text-[#072342]">All my listings</h2>
                    <label className="relative w-full sm:w-64">
                        <span className="sr-only">Search my listings</span>
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title" className="w-full min-h-[44px] rounded-lg border border-gray-300 pl-9 pr-3" />
                    </label>
                </div>
                <div role="tablist" aria-label="Filter listings" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === t.id}
                            onClick={() => setTab(t.id)}
                            className={`shrink-0 min-h-[40px] rounded-full px-4 text-sm ${activeTab === t.id ? "bg-[#072342] text-white font-semibold" : "border border-gray-300 text-[#072342]"}`}
                        >
                            {t.label} ({counts[t.id] ?? 0})
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="py-16 flex justify-center"><Loader className="animate-spin" /></div>
                ) : shown.length === 0 ? (
                    <div className="py-12 text-center text-gray-600">
                        {auctions.length === 0 ? <>You haven't listed anything yet. <Link to={`${basePath}/auctions/create`} className="underline font-semibold">Create your first listing</Link>.</> : "Nothing here right now."}
                    </div>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {shown.map((a) => {
                            const [chip, chipCls] = statusChip(a, now);
                            const live = isLive(a, now);
                            const hasReserve = a.auctionType === "reserve" && Number(a.reservePrice) > 0;
                            const pct = hasReserve ? Math.min(100, Math.round(((Number(a.currentPrice) || 0) / Number(a.reservePrice)) * 100)) : null;
                            const canEdit = !SOLD.includes(a.status);
                            const canLowerReserve = a.auctionType === "reserve" && a.status === "active";
                            const canIncrement = isTimed(a) && CAN_CHANGE_INCREMENT.includes(a.status) && !a.winner;
                            const canLowerStart = isTimed(a) && CAN_CHANGE_INCREMENT.includes(a.status) && !a.winner && !(Number(a.bidCount) > 0);
                            // Buy It Now during the auction: reserve lots, until 12h before close
                            // or bidding reaches 90% of the reserve (backend utils/liveBuyNow.js).
                            const binOpen = new Date(a.endDate) - now > 12 * 36e5 && (!(Number(a.bidCount) > 0) || Number(a.currentPrice) < 0.9 * Number(a.reservePrice));
                            const canSetBin = a.auctionType === "reserve" && CAN_CHANGE_INCREMENT.includes(a.status) && !a.winner && (a.status !== "active" || binOpen);
                            const featured = a.isFeatured || (a.featuredRequested && a.extrasPayment?.status === "completed");
                            const photo = a.photos?.[0]?.thumbUrl || a.photos?.[0]?.url;
                            const menuOpen = menuId === a._id;
                            return (
                                <li key={a._id} className="relative rounded-xl border border-gray-200 p-3 md:p-4">
                                    <div className="flex flex-wrap items-center gap-4">
                                        <Link to={`/auction/${a._id}`} target="_blank" className="block h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                                            {photo && <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />}
                                        </Link>
                                        <div className="min-w-0 flex-[1_1_240px] flex flex-col gap-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-gray-900 truncate max-w-full">{a.title}</h3>
                                                <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${chipCls}`}>{chip}</span>
                                                {featured && <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-[#FDF2DD] text-[#7A5418]">Featured</span>}
                                                {a.pendingEdit?.status === "pending" && <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-[#E7EEF8] text-[#23446E]">Changes waiting for approval</span>}
                                                {a.liveBuyNow?.price > 0 && !SOLD.includes(a.status) && <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-[#FFF3C4] text-[#5C4A00]">Buy It Now {money(a.liveBuyNow.price, a.baseCurrency)}</span>}
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                {!isTimed(a) ? "Buy It Now listing"
                                                    : live ? `${timeLeft(a.endDate, now)} · ends ${dateTime(a.endDate)}`
                                                    : WAITING.includes(a.status) ? `Starts ${dateTime(a.startDate)} · ends ${dateTime(a.endDate)}`
                                                    : `Ended ${dateTime(a.endDate)}`}
                                                {typeof a.views === "number" ? ` · ${a.views} views` : ""}
                                                {isTimed(a) && a.bidIncrement ? ` · increment ${money(a.bidIncrement, a.baseCurrency)}` : ""}
                                            </p>
                                            {pct !== null && !SOLD.includes(a.status) && !WAITING.includes(a.status) && (
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <div className="h-2 w-40 rounded-full bg-gray-200"><div className="h-2 rounded-full bg-[#D19F3E]" style={{ width: `${pct}%` }} /></div>
                                                    {pct >= 100 ? "Reserve met" : `Reserve ${Math.floor(pct / 10) * 10}% reached`} (reserve {money(a.convertedReservePrice ?? a.reservePrice, a.convertedReservePrice != null ? userCurrency : a.baseCurrency)})
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs text-gray-500">{SOLD.includes(a.status) ? "Sold for" : isTimed(a) ? `Current bid · ${a.bidCount || 0} bid${a.bidCount === 1 ? "" : "s"}` : "Price"}</div>
                                            <div className="text-xl font-bold">{money(SOLD.includes(a.status) ? (a.convertedFinalPrice ?? a.finalPrice) : isTimed(a) ? a.convertedCurrentPrice ?? a.currentPrice : a.convertedBuyNowPrice ?? a.buyNowPrice, userCurrency)}</div>
                                        </div>
                                        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
                                            {a.status === "awaiting_payment" && <button type="button" className={btnPrimary} onClick={() => payExtras(a)}>Pay {money(a.extrasPayment?.amount, a.extrasPayment?.currency)}</button>}
                                            {canEdit && <Link to={`${basePath}/auctions/edit/${a._id}`} className={btnSecondary}>Edit</Link>}
                                            {canLowerReserve && <button type="button" className={btnSecondary} onClick={() => setReserveLot(a)}>Lower reserve</button>}
                                            {canIncrement && <button type="button" className={btnSecondary} onClick={() => setIncrementLot(a)}>Increment</button>}
                                            <button type="button" aria-label={`More actions for ${a.title}`} aria-expanded={menuOpen} className={`${btnSecondary} px-3`} onClick={() => setMenuId(menuOpen ? null : a._id)}>
                                                <MoreHorizontal size={20} />
                                            </button>
                                        </div>
                                    </div>

                                    {menuOpen && (
                                        <>
                                            <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuId(null)} />
                                            <div role="menu" className="absolute right-3 top-full z-50 -mt-2 w-72 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl flex flex-col">
                                                <Link role="menuitem" to={`/auction/${a._id}`} target="_blank" className="min-h-[44px] flex items-center rounded-lg px-3 hover:bg-gray-50" onClick={() => setMenuId(null)}>View listing</Link>
                                                {canEdit && <Link role="menuitem" to={`${basePath}/auctions/edit/${a._id}`} className="min-h-[44px] flex items-center rounded-lg px-3 hover:bg-gray-50">Edit listing</Link>}
                                                {CAN_PROMOTE.includes(a.status) && !featured && (
                                                    <button role="menuitem" type="button" className="min-h-[44px] flex items-center justify-between rounded-lg px-3 bg-[#FFF7EA] font-semibold text-left hover:bg-[#FDF2DD]" onClick={() => { setMenuId(null); setPromote({ auction: a, start: "featured" }); }}>
                                                        Feature this ad <span className="font-normal text-[#7A5418]">{featuredPrice(a.baseCurrency)}</span>
                                                    </button>
                                                )}
                                                {CAN_PROMOTE.includes(a.status) && !a.metaBoostPackage && (
                                                    <button role="menuitem" type="button" className="min-h-[44px] flex items-center justify-between rounded-lg px-3 text-left hover:bg-gray-50" onClick={() => { setMenuId(null); setPromote({ auction: a, start: "meta" }); }}>
                                                        Meta Boost <span className="text-gray-500">{metaFrom(a.baseCurrency)}</span>
                                                    </button>
                                                )}
                                                {canSetBin && <button role="menuitem" type="button" className="min-h-[44px] flex items-center justify-between rounded-lg px-3 text-left hover:bg-gray-50" onClick={() => { setMenuId(null); setBinPriceLot(a); }}>{a.liveBuyNow?.price ? "Change Buy It Now price" : "Set Buy It Now price"}{a.liveBuyNow?.price ? <span className="text-gray-500">{money(a.liveBuyNow.price, a.baseCurrency)}</span> : null}</button>}
                                                {canLowerStart && <button role="menuitem" type="button" className="min-h-[44px] flex items-center rounded-lg px-3 text-left hover:bg-gray-50" onClick={() => { setMenuId(null); setStartLot(a); }}>Lower starting bid</button>}
                                                {canIncrement && <button role="menuitem" type="button" className="min-h-[44px] flex items-center rounded-lg px-3 text-left hover:bg-gray-50" onClick={() => { setMenuId(null); setIncrementLot(a); }}>Change bid increment</button>}
                                                {canLowerReserve && <button role="menuitem" type="button" className="min-h-[44px] flex items-center rounded-lg px-3 text-left hover:bg-gray-50" onClick={() => { setMenuId(null); setReserveLot(a); }}>Lower reserve</button>}
                                                {a.auctionType === "reserve" && BIN_AFTER_STATUSES.includes(a.status) && (
                                                    <button role="menuitem" type="button" className="min-h-[44px] flex items-center rounded-lg px-3 text-left hover:bg-gray-50" onClick={() => { setMenuId(null); setBinLot(a); }}>Last Chance (48 hours)</button>
                                                )}
                                                {a.status === "awaiting_payment" && <button role="menuitem" type="button" className="min-h-[44px] flex items-center rounded-lg px-3 text-left hover:bg-gray-50" onClick={() => { setMenuId(null); submitWithout(a); }}>Submit without extras</button>}
                                                {a.pendingEdit?.status === "pending" && <button role="menuitem" type="button" className="min-h-[44px] flex items-center rounded-lg px-3 text-left text-red-700 hover:bg-red-50" onClick={() => { setMenuId(null); discardEdit(a); }}>Discard changes waiting for approval</button>}
                                            </div>
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {reserveLot && (
                <LowerReserveModal isOpen onClose={() => setReserveLot(null)} auction={reserveLot} onReserveLowered={() => { setReserveLot(null); load(); }} />
            )}
            {binPriceLot && <BuyItNowPriceModal auction={binPriceLot} onClose={() => setBinPriceLot(null)} onChanged={load} />}
            {startLot && <StartPriceModal auction={startLot} onClose={() => setStartLot(null)} onChanged={load} />}
            {incrementLot && <IncrementModal auction={incrementLot} onClose={() => setIncrementLot(null)} onChanged={load} />}
            {promote && <PromoteModal auction={promote.auction} start={promote.start} onClose={() => setPromote(null)} onDone={load} />}
            {binLot && <BinDashboardModal auction={binLot} onClose={() => { setBinLot(null); load(); }} />}
            {extras && (
                <ListingExtrasPaymentModal
                    isOpen
                    payment={extras.payment}
                    auctionId={extras.id}
                    onClose={() => setExtras(null)}
                    onSuccess={() => { setExtras(null); load(); }}
                />
            )}
        </div>
    );
}

export default MyListingsDashboard;
