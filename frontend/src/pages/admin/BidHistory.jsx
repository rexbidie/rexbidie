import { useState, useEffect, useCallback, useRef } from "react";
import { Search, BarChart3, User, Gavel, TrendingUp, Users, Undo2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import axiosInstance from "../../utils/axiosInstance.js";
import { toast } from "react-hot-toast";
import { AdminContainer, AdminHeader, AdminSidebar } from "../../components/index.js";
import { useAuth } from "../../contexts/AuthContext.jsx";

const PAGE_SIZE = 25;

const DEFAULT_FILTERS = {
    status: "all",
    seller: "all",
    search: "",
    sortBy: "recent",
};

// Badge for a lot's status.
const LOT_STATUS = {
    active: { class: "bg-green-100 text-green-800", text: "Live" },
    sold: { class: "bg-purple-100 text-purple-800", text: "Sold" },
    sold_buy_now: { class: "bg-purple-100 text-purple-800", text: "Sold (Buy It Now)" },
    reserve_not_met: { class: "bg-orange-100 text-orange-800", text: "Reserve not met" },
    ended: { class: "bg-gray-100 text-gray-800", text: "Ended" },
    cancelled: { class: "bg-red-100 text-red-800", text: "Cancelled" },
    draft: { class: "bg-gray-100 text-gray-600", text: "Draft" },
    approved: { class: "bg-blue-100 text-blue-800", text: "Upcoming" },
};

// Badge for one bid in the table.
const BID_STATUS = {
    Winner: "bg-green-100 text-green-800",
    Winning: "bg-blue-100 text-blue-800",
    Outbid: "bg-gray-100 text-gray-800",
    "Reserve Not Met": "bg-orange-100 text-orange-800",
};

const Badge = ({ className, children }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${className}`}>{children}</span>
);

const LotStatusBadge = ({ status }) => {
    const cfg = LOT_STATUS[status] || { class: "bg-gray-100 text-gray-700", text: status || "Unknown" };
    return <Badge className={cfg.class}>{cfg.text}</Badge>;
};

export default function BidHistory() {
    const { user } = useAuth();
    const userCurrency = user?.currency || "EUR";

    const [auctions, setAuctions] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalAuctions: 0 });
    const [filterOptions, setFilterOptions] = useState({ statuses: [], sellers: [] });
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState("");
    const [page, setPage] = useState(1);
    const [retractingBidder, setRetractingBidder] = useState(null);
    const requestRef = useRef(0);

    const selectedAuction = auctions.find((a) => a.id === selectedId) || null;

    const fetchHistory = useCallback(async () => {
        const requestId = ++requestRef.current;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                currency: userCurrency,
                page: String(page),
                limit: String(PAGE_SIZE),
                status: filters.status,
                seller: filters.seller,
                sortBy: filters.sortBy,
            });
            if (filters.search) params.set("search", filters.search);

            const { data } = await axiosInstance.get(`/api/v1/bids/admin/history?${params}`);
            if (requestId !== requestRef.current || !data.success) return; // a newer request is on its way

            const list = data.data.auctions || [];
            setAuctions(list);
            setPagination(data.data.pagination || { currentPage: 1, totalPages: 1, totalAuctions: list.length });
            setFilterOptions(data.data.filterOptions || { statuses: [], sellers: [] });
            setSelectedId((prev) => (list.some((a) => a.id === prev) ? prev : list[0]?.id ?? null));
        } catch (error) {
            if (requestId !== requestRef.current) return;
            console.error("Fetch admin bid history error:", error);
            toast.error("Failed to load bids");
        } finally {
            if (requestId === requestRef.current) setLoading(false);
        }
    }, [userCurrency, page, filters]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        axiosInstance
            .get(`/api/v1/bids/admin/stats?currency=${userCurrency}`)
            .then(({ data }) => data.success && setStats(data.data))
            .catch((error) => console.error("Fetch admin bid stats error:", error));
    }, [userCurrency]);

    // Search runs 400ms after typing stops.
    useEffect(() => {
        const t = setTimeout(() => {
            setFilters((prev) => (prev.search === searchInput.trim() ? prev : { ...prev, search: searchInput.trim() }));
            setPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    const handleFilterChange = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const clearFilters = () => {
        setSearchInput("");
        setFilters(DEFAULT_FILTERS);
        setPage(1);
    };

    const filtersActive =
        filters.status !== "all" || filters.seller !== "all" || filters.search || filters.sortBy !== "recent";

    // Retract every bid a bidder has on a live lot (e.g. they withdrew before close).
    const handleRetract = async (auction, bidder) => {
        const name = bidder.name || bidder.username || "this bidder";
        const reason = window.prompt(
            `Retract ALL of ${name}'s bids on "${auction.title}"?\n\n` +
                `Their proxy (max) bid will also be switched off and the price will drop back. This can't be undone.\n\n` +
                `Reason (kept on record):`,
            "Bidder withdrew bid before close (s.58(2) Sale of Goods Act 1893)"
        );
        if (reason === null) return;

        setRetractingBidder(bidder.id);
        try {
            const { data } = await axiosInstance.post(`/api/v1/bids/admin/auctions/${auction.id}/retract`, {
                bidderId: bidder.id,
                reason,
            });
            toast.success(data.message || "Bids retracted");
            await fetchHistory();
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to retract bids");
        } finally {
            setRetractingBidder(null);
        }
    };

    const formatCurrency = (amount) =>
        new Intl.NumberFormat("en-IE", {
            style: "currency",
            currency: userCurrency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount || 0);

    const formatDate = (d) =>
        d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "–";

    const formatTime = (d) => (d ? new Date(d).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" }) : "");

    const statCards = [
        { title: "Total Bids", value: stats.totalBids, note: "All time", icon: <Gavel size={22} />, tone: "bg-blue-100 text-blue-600" },
        { title: "Recent Bids", value: stats.recentBids, note: "Last 7 days", icon: <TrendingUp size={22} />, tone: "bg-green-100 text-green-600" },
        { title: "Active Bidders", value: stats.activeBidders, note: "Last 30 days", icon: <Users size={22} />, tone: "bg-orange-100 text-orange-600" },
        { title: "Lots with Bids", value: pagination.totalAuctions, note: filtersActive ? "Matching filters" : "All time", icon: <BarChart3 size={22} />, tone: "bg-purple-100 text-purple-600" },
    ];

    const firstShown = pagination.totalAuctions ? (pagination.currentPage - 1) * PAGE_SIZE + 1 : 0;
    const lastShown = Math.min(pagination.currentPage * PAGE_SIZE, pagination.totalAuctions);
    const isLive = selectedAuction?.status === "active";

    return (
        <section className="flex min-h-screen bg-gray-50">
            <AdminSidebar />
            <div className="w-full relative min-w-0">
                <AdminHeader />
                <AdminContainer>
                    <div className="max-w-full pt-16 pb-4 md:pt-0">
                        <h2 className="text-3xl md:text-4xl font-bold my-5 text-gray-800">Bids</h2>
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {statCards.map((stat) => (
                            <div key={stat.title} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                                        <p className="text-2xl font-bold text-gray-900 mt-1">{(stat.value ?? 0).toLocaleString("en-IE")}</p>
                                        <p className="text-xs text-gray-500 mt-1">{stat.note}</p>
                                    </div>
                                    <div className={`hidden sm:block p-3 rounded-lg ${stat.tone}`}>{stat.icon}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-5 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                            <div className="relative lg:col-span-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="search"
                                    placeholder="Search lot, seller or bidder…"
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                />
                            </div>

                            <select
                                aria-label="Status"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                value={filters.status}
                                onChange={(e) => handleFilterChange("status", e.target.value)}
                            >
                                <option value="all">All statuses</option>
                                {filterOptions.statuses.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>

                            <select
                                aria-label="Seller"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                value={filters.seller}
                                onChange={(e) => handleFilterChange("seller", e.target.value)}
                            >
                                <option value="all">All sellers</option>
                                {filterOptions.sellers.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>

                            <select
                                aria-label="Sort by"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                value={filters.sortBy}
                                onChange={(e) => handleFilterChange("sortBy", e.target.value)}
                            >
                                <option value="recent">Newest listings</option>
                                <option value="ending_soon">Ending soon</option>
                                <option value="most_bids">Most bids</option>
                                <option value="highest_bid">Highest bid</option>
                                <option value="seller_name">Seller name (A–Z)</option>
                            </select>
                        </div>

                        <div className="flex flex-wrap justify-between items-center gap-2 mt-3">
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                                {loading && <Loader2 size={14} className="animate-spin" />}
                                {pagination.totalAuctions
                                    ? `Showing ${firstShown}–${lastShown} of ${pagination.totalAuctions} lots`
                                    : loading ? "Loading…" : "No lots match these filters"}
                            </div>
                            {filtersActive && (
                                <button onClick={clearFilters} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                                    Clear filters
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* Lot list */}
                        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 lg:sticky lg:top-4">
                            <div className="p-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold">Lots</h3>
                            </div>
                            <div className={`max-h-[60vh] lg:max-h-[calc(100vh-14rem)] overflow-y-auto ${loading ? "opacity-60" : ""}`}>
                                {auctions.map((auction) => (
                                    <button
                                        type="button"
                                        key={auction.id}
                                        onClick={() => setSelectedId(auction.id)}
                                        className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 ${selectedId === auction.id ? "bg-blue-50" : ""}`}
                                    >
                                        <div className="font-medium text-gray-900 text-sm line-clamp-2">{auction.title}</div>
                                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                                            {auction.auctionId} · {auction.seller?.name}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                            <LotStatusBadge status={auction.status} />
                                            {auction.hasReserve && (
                                                <Badge className={auction.reserveMet ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
                                                    {auction.reserveMet ? "Reserve met" : "Reserve not met"}
                                                </Badge>
                                            )}
                                            {auction.retractions?.length > 0 && <Badge className="bg-red-50 text-red-700">Retracted</Badge>}
                                        </div>
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-sm font-semibold text-gray-900">{formatCurrency(auction.convertedWinningBid)}</span>
                                            <span className="text-xs text-gray-500">
                                                {auction.totalBids} bid{auction.totalBids === 1 ? "" : "s"} · {auction.status === "active" ? "ends" : "ended"} {formatDate(auction.endTime)}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {!loading && auctions.length === 0 && (
                                    <div className="p-8 text-center text-sm text-gray-500">No lots match these filters.</div>
                                )}
                            </div>

                            {pagination.totalPages > 1 && (
                                <div className="flex items-center justify-between p-3 border-t border-gray-200 text-sm">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={!pagination.hasPrevPage || loading}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <ChevronLeft size={16} /> Previous
                                    </button>
                                    <span className="text-gray-600">Page {pagination.currentPage} of {pagination.totalPages}</span>
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => p + 1)}
                                        disabled={!pagination.hasNextPage || loading}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        Next <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Selected lot */}
                        <div className="lg:col-span-2 min-w-0">
                            {selectedAuction ? (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                                    <div className="p-5 border-b border-gray-200">
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{selectedAuction.auctionId}</span>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${selectedAuction.auctionType === "Reserve Auction" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                                                {selectedAuction.auctionType}
                                            </span>
                                            <LotStatusBadge status={selectedAuction.status} />
                                        </div>
                                        <h2 className="text-xl font-bold text-gray-900">{selectedAuction.title}</h2>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Seller: <span className="text-gray-800 font-medium">{selectedAuction.seller?.name}</span>
                                            {selectedAuction.seller?.email && <> · {selectedAuction.seller.email}</>}
                                        </p>

                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                                            <div>
                                                <div className="text-xs text-gray-500">Starting bid</div>
                                                <div className="font-medium">{formatCurrency(selectedAuction.convertedStartingBid)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">{isLive ? "Current bid" : "Top bid"}</div>
                                                <div className="font-medium text-green-600">{formatCurrency(selectedAuction.convertedWinningBid)}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">Reserve</div>
                                                <div className="font-medium">
                                                    {selectedAuction.hasReserve ? formatCurrency(selectedAuction.convertedReservePrice) : "None"}
                                                    {selectedAuction.hasReserve && (
                                                        <span className={`block text-xs ${selectedAuction.reserveMet ? "text-emerald-600" : "text-amber-600"}`}>
                                                            {selectedAuction.reserveMet ? "Met" : "Not met"}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">Bids / bidders</div>
                                                <div className="font-medium">{selectedAuction.totalBids} / {selectedAuction.uniqueBidders}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">{isLive ? "Ends" : "Ended"}</div>
                                                <div className="font-medium">
                                                    {formatDate(selectedAuction.endTime)}
                                                    <span className="block text-xs text-gray-500">{formatTime(selectedAuction.endTime)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5">
                                        <h3 className="text-lg font-semibold mb-3">Bid history ({selectedAuction.bids.length})</h3>
                                        {selectedAuction.bids.length === 0 ? (
                                            <p className="text-sm text-gray-500">No bids left on this lot.</p>
                                        ) : (
                                            <div className="overflow-x-auto -mx-5 px-5">
                                                <table className="w-full min-w-[560px]">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase">Bidder</th>
                                                            <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                                            <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase">When</th>
                                                            <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                                            {isLive && <th className="py-2.5 px-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                        {selectedAuction.bids.map((bid) => (
                                                            <tr key={bid.id} className="hover:bg-gray-50">
                                                                <td className="py-2.5 px-3">
                                                                    <div className="flex items-center">
                                                                        <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center mr-3 shrink-0">
                                                                            <User size={14} className="text-gray-500" />
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="font-medium text-sm text-gray-900 truncate">{bid.bidder.name}</div>
                                                                            {bid.bidder.username && <div className="text-xs text-gray-500 truncate">@{bid.bidder.username}</div>}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-3">
                                                                    <div className={`font-medium text-sm ${bid.isHighest ? "text-green-600" : "text-gray-900"}`}>
                                                                        {formatCurrency(bid.convertedAmount)}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500">{bid.isProxyBid ? "Proxy bid" : "Manual bid"}</div>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-sm text-gray-900 whitespace-nowrap">
                                                                    {formatDate(bid.time)}
                                                                    <span className="block text-xs text-gray-500">{formatTime(bid.time)}</span>
                                                                </td>
                                                                <td className="py-2.5 px-3">
                                                                    <Badge className={BID_STATUS[bid.status] || BID_STATUS.Outbid}>{bid.status}</Badge>
                                                                </td>
                                                                {isLive && (
                                                                    <td className="py-2.5 px-3">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRetract(selectedAuction, bid.bidder)}
                                                                            disabled={!!retractingBidder || !bid.bidder.id}
                                                                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                                                                            title="Retract all of this bidder's bids on this lot"
                                                                        >
                                                                            <Undo2 size={14} />
                                                                            {retractingBidder === bid.bidder.id ? "Retracting…" : "Retract"}
                                                                        </button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {selectedAuction.retractions?.length > 0 && (
                                            <div className="mt-6">
                                                <h4 className="text-sm font-semibold text-gray-700 mb-2">Retracted bids</h4>
                                                <ul className="space-y-2">
                                                    {selectedAuction.retractions.map((r, i) => (
                                                        <li key={i} className="text-sm bg-red-50 border border-red-100 rounded-lg p-3">
                                                            <div className="font-medium text-gray-900">
                                                                @{r.bidderUsername} · {r.bidCount} bid{r.bidCount === 1 ? "" : "s"} (highest {formatCurrency(r.convertedHighestBid)})
                                                            </div>
                                                            <div className="text-xs text-gray-600">
                                                                {formatDate(r.retractedAt)} {formatTime(r.retractedAt)} · price {formatCurrency(r.convertedPriceBefore)} → {formatCurrency(r.convertedPriceAfter)}
                                                            </div>
                                                            {r.reason && <div className="text-xs text-gray-600 mt-1">{r.reason}</div>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                                    <BarChart3 size={48} className="mx-auto text-gray-300 mb-4" />
                                    <h3 className="text-lg font-semibold text-gray-700 mb-2">No lot selected</h3>
                                    <p className="text-gray-500">Pick a lot from the list to see its bids.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </AdminContainer>
            </div>
        </section>
    );
}
