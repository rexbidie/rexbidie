import { useEffect, useRef, useState } from "react";
import { useLiveAuctionTicks } from "../hooks/useLiveAuctionTicks";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calendar, BookMarked } from "lucide-react";
import { Container, LoadingSpinner, AuctionCard } from "../components";
import { useSeo, buildCatalogueSeo } from "../utils/seo";
import Pagination from "../components/Pagination";
import axiosInstance from "../utils/axiosInstance";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import {
    getDayKey,
    getViewerDayBounds,
    formatDayKey,
    isCataloguePast,
} from "../utils/catalogueDate";

const PAGE_SIZE = 15;

const AuctionCardSkeleton = () => (
    <div className="border border-gray-200 p-4 bg-white rounded-xl shadow-sm animate-pulse">
        <div className="w-full h-56 bg-gray-200 rounded-tr-3xl rounded-bl-3xl mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="flex gap-2 mb-4">
            <div className="h-16 bg-gray-200 rounded-lg flex-1"></div>
            <div className="h-16 bg-gray-200 rounded-lg flex-1"></div>
        </div>
        <div className="flex gap-2">
            <div className="h-11 bg-gray-200 rounded-lg flex-1"></div>
            <div className="h-11 w-11 bg-gray-200 rounded-lg"></div>
        </div>
    </div>
);

function SingleCatalogue() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const userCurrency = user?.currency || "EUR";

    const [searchParams, setSearchParams] = useSearchParams();
    const page = parseInt(searchParams.get("page"), 10) || 1;

    const [catalogue, setCatalogue] = useState(null);
    const [auctions, setAuctions] = useState([]);
    // Live prices, bid counts and reserve progress while the page is open.
    useLiveAuctionTicks(setAuctions);
    const [pagination, setPagination] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    useSeo(buildCatalogueSeo(catalogue, pagination?.totalAuctions, { notFound }));

    const hasRestoredScroll = useRef(false);

    useEffect(() => {
        if (hasRestoredScroll.current) return;
        if (loading) return;
        if (!auctions?.length) return;

        const savedScrollY = sessionStorage.getItem("returnToAuctionScrollY");
        if (!savedScrollY) return;

        hasRestoredScroll.current = true;

        // Consume so it doesn't restore again on next visit
        sessionStorage.removeItem("returnToAuction");
        sessionStorage.removeItem("returnToAuctionScrollY");
        sessionStorage.removeItem("returnToAuctionLoadedCount");

        const y = parseInt(savedScrollY, 10);

        // two rAFs so the grid is laid out at full height first
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.scrollTo(0, y);
            });
        });
    }, [loading, auctions]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                // Fetch catalogue (day-key) first
                const catRes = await axiosInstance.get(`/api/v1/catalogues/${id}`);
                const cat = catRes.data?.data?.catalogue;
                if (!cat) throw new Error("Catalogue not found");

                setCatalogue(cat);

                // Now fetch auctions in the viewer's day window
                const dayKey = getDayKey(cat.closingDate);
                const { start, end } = getViewerDayBounds(dayKey);

                const { data } = await axiosInstance.get(
                    `/api/v1/catalogues/${id}/auctions`,
                    {
                        params: {
                            currency: userCurrency,
                            page,
                            limit: PAGE_SIZE,
                            start,
                            end,
                        },
                    }
                );

                if (data.success) {
                    setAuctions(data.data.auctions || []);
                    setPagination(data.data.pagination);
                }
            } catch (err) {
                if (err?.response?.status === 404) setNotFound(true);
                toast.error(err?.response?.data?.message || "Failed to load catalogue");
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchData();
    }, [id, userCurrency, page]);

    const handlePageChange = (newPage) => {
        if (newPage === page) return;
        const sp = new URLSearchParams(searchParams);
        if (newPage > 1) sp.set("page", newPage.toString());
        else sp.delete("page");
        setSearchParams(sp, { replace: true });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (loading && !catalogue) {
        return (
            <Container className="py-32 min-h-[70vh] flex items-center justify-center">
                <LoadingSpinner size="large" />
            </Container>
        );
    }

    if (!catalogue) {
        return (
            <Container className="py-32 min-h-[70vh] flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-semibold text-gray-600">Catalogue not found</h2>
                    <button
                        onClick={() => navigate("/")}
                        className="text-[#C59D55] hover:underline mt-4 inline-block"
                    >
                        Back to Home
                    </button>
                </div>
            </Container>
        );
    }

    const dayKey = getDayKey(catalogue.closingDate);
    const displayDate = formatDayKey(dayKey);
    const isPast = isCataloguePast(catalogue.closingDate);

    return (
        <Container className="pt-32 pb-16 min-h-[70vh]">
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-gray-600 hover:text-[#A17B35] transition-colors mb-6"
            >
                <ArrowLeft size={20} />
                <span>Back</span>
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="relative aspect-[21/9] md:aspect-[21/7] bg-gray-100">
                    <img
                        src={catalogue.image?.url}
                        alt={catalogue.title}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 text-white">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium backdrop-blur-md mb-3">
                            <Calendar size={12} />
                            {isPast ? "Closed" : "Closing"} {displayDate}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                            {catalogue.title}
                        </h1>
                    </div>
                </div>
            </div>

            {loading ? (
                <>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">
                            Auctions Closing This Day
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <AuctionCardSkeleton key={i} />
                        ))}
                    </div>
                </>
            ) : auctions.length > 0 ? (
                <>
                    <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
                        <h2 className="text-2xl font-bold text-gray-900">
                            Auctions Closing This Day
                        </h2>
                        <span className="text-sm text-gray-500">
                            Showing {auctions.length} of {pagination?.totalAuctions || 0} auctions
                            {pagination?.totalPages > 1 &&
                                ` · Page ${pagination.currentPage} of ${pagination.totalPages}`}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {auctions.map((auction) => (
                            <AuctionCard key={auction._id} auction={auction} />
                        ))}
                    </div>

                    {pagination && pagination.totalPages > 1 && (
                        <Pagination
                            currentPage={pagination.currentPage}
                            totalPages={pagination.totalPages}
                            onPageChange={handlePageChange}
                        />
                    )}
                </>
            ) : (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
                    <BookMarked size={48} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-xl font-medium text-gray-700 mb-2">
                        No Auctions in This Catalogue
                    </h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                        There are currently no auctions scheduled to end on this date
                        {isPast ? "" : " yet. Check back soon."}
                    </p>
                </div>
            )}
        </Container>
    );
}

export default SingleCatalogue;