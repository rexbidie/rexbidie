import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Filter, Gavel, Grid, List, Star } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import AuctionCard from "./AuctionCard";
import AuctionListItem from "./AuctionListItem";
import Container from "./Container";
import { useAuth } from "../contexts/AuthContext";
import { useLiveAuctionTicks } from "../hooks/useLiveAuctionTicks";

// Home page section (default) or the full Featured page (page). Featured
// listings are shown in a fair rotation: a new random order each visit, so
// every seller who paid for Featured gets seen.
const FeaturedListings = ({ page = false }) => {
    const navigate = useNavigate();
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState("grid"); // grid or list
    const [sortBy, setSortBy] = useState("rotate");
    const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1, limit: page ? 24 : 8 });
    // Same random order across "Load more" pages for this visit.
    const [seed] = useState(() => Math.random().toString(36).slice(2));
    const [category, setCategory] = useState("all");
    // The full page shows straight away; the home section fades in on scroll.
    const [visible, setVisible] = useState(page);

    const [liveAuctions, setLiveAuctions] = useState([]);
    useEffect(() => { setLiveAuctions(listings); }, [listings]);
    useLiveAuctionTicks(setLiveAuctions);

    const sectionRef = useRef(null);

    const { user } = useAuth();
    const userCurrency = user?.currency || 'EUR';

    const fetchFeaturedListings = async (page = 1, reset = true) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append("limit", pagination.limit.toString());
            params.append("page", page.toString());
            params.append("sortBy", sortBy);
            if (sortBy === "rotate") params.append("seed", seed);
            params.append("currency", userCurrency);
            if (category !== "all") params.append("category", category);

            const { data } = await axiosInstance.get(`/api/v1/auctions/featured?${params}`);
            if (data.success) {
                if (reset) {
                    setListings(data.data.listings);
                } else {
                    setListings((prev) => [...prev, ...data.data.listings]);
                }
                setPagination((prev) => ({
                    ...prev,
                    page,
                    total: data.data.pagination.total,
                    pages: data.data.pagination.pages,
                }));
            }
        } catch (error) {
            console.error("Fetch featured listings error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeaturedListings(1, true);
    }, [sortBy, category]);

    // ============================================================
    // INTERSECTION OBSERVER
    //
    // Only start observing AFTER loading has finished.
    // ============================================================

    useEffect(() => {
        if (loading) return;

        const element = sectionRef.current;
        if (!element) return;

        // Fade in once, then stay visible.
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            // Any part on screen: a long list can never be 10% visible on a phone.
            { threshold: 0 }
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, [loading, liveAuctions.length]);

    const handleLoadMore = () => {
        if (pagination.page < pagination.pages) {
            fetchFeaturedListings(pagination.page + 1, false);
        }
    };

    const handleViewAll = () => {
        navigate("/featured");
    };

    if (loading && liveAuctions.length === 0) {
        return (
            <Container className="my-14">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-7">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
                            <div className="h-48 bg-gray-200 rounded-lg mb-4"></div>
                            <div className="h-4 bg-gray-200 rounded mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded mb-4"></div>
                            <div className="flex justify-between">
                                <div className="h-6 bg-gray-200 rounded w-20"></div>
                                <div className="h-6 bg-gray-200 rounded w-16"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </Container>
        );
    }

    if (!loading && liveAuctions.length === 0) {
        return (
            <Container className="pt-14">
                <div className="mb-8">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#A17B35]">Featured</p>
                    <h2 className="text-[1.6rem] font-bold leading-tight text-[#072342] md:text-[2rem]">Featured Machinery</h2>
                </div>
                {/* <p className="text-gray-500 mt-1">
                        Premium machinery and vehicles handpicked by RexBid
                    </p> */}
                <div className="text-center py-16 text-gray-500">
                    <Star size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium">No featured machinery right now</p>
                    <p className="text-sm">Check back soon</p>
                </div>
            </Container>
        );
    }

    return (
        <section ref={sectionRef} className="relative [overflow:clip]">
            {/* Background accent */}
            {/* <div className="pointer-events-none absolute -right-40 top-20 h-[450px] w-[450px] rounded-full bg-[#C59D55]/[0.045] blur-[100px]" /> */}

            <Container className="pt-5 pb-8 md:py-10">
                <div
                    className={`transition-all duration-1000 ease-out ${visible
                        ? "translate-y-0 opacity-100"
                        : "translate-y-8 opacity-0"
                        }`}
                >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
                        <div>
                            {/* <h2 className="text-3xl md:text-4xl font-bold text-primary flex items-center gap-2">
                                <Star className="text-[#D19F3E]" size={28} />
                                Featured Listings
                            </h2> */}
                            <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#A17B35]">Featured</p>
                    {page
                        ? <h1 className="text-[1.8rem] font-bold leading-tight text-[#072342] md:text-[2.4rem]">Featured Machinery</h1>
                        : <h2 className="text-[1.6rem] font-bold leading-tight text-[#072342] md:text-[2rem]">Featured Machinery</h2>}
                    {page && <p className="mt-2 text-gray-600">{pagination.total} featured lot{pagination.total === 1 ? "" : "s"} live now. The order changes on every visit.</p>}
                </div>
                            {/* <p className="text-gray-500 mt-1">
                                Premium machinery and vehicles handpicked by RexBid
                            </p> */}
                        </div>
                        {page && (
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                Sort
                                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3">
                                    <option value="rotate">Mixed (changes each visit)</option>
                                    <option value="endingSoon">Ending soonest</option>
                                    <option value="highestBid">Highest bid</option>
                                    <option value="newest">Newest</option>
                                </select>
                            </label>
                        )}
                    </div>
                </div>

                {/* Listings grid/list */}
                {viewMode === "grid" ? (
                    <section className={page
                        ? "grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-7 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4"
                        : "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-7 sm:gap-y-10 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4"}>
                        {liveAuctions.map((listing, index) => (
                            <div
                                key={listing._id}
                                className={`${page ? "" : "w-[90%] shrink-0 snap-start sm:w-auto "}transition-all duration-1000 ease-out ${visible
                                    ? "translate-y-0 opacity-100"
                                    : "translate-y-10 opacity-0"
                                    }`}
                                style={{
                                    transitionDelay: `${300 + index * 150}ms`,
                                }}
                            >
                                <AuctionCard auction={listing} />
                            </div>
                        ))}
                    </section>
                ) : (
                    <div className="space-y-4">
                        {liveAuctions.map((listing, index) => (
                            <div
                                key={listing._id}
                                className={`transition-all duration-1000 ease-out ${visible
                                    ? "translate-y-0 opacity-100"
                                    : "translate-y-10 opacity-0"
                                    }`}
                                style={{
                                    transitionDelay: `${300 + index * 150}ms`,
                                }}
                            >
                                <AuctionListItem auction={listing} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Load More / View All buttons */}
                <div
                    className={`flex flex-row items-center justify-center gap-3 mt-8 md:mt-10 transition-all delay-[900ms] duration-1000 ease-out ${visible
                        ? "translate-y-0 opacity-100"
                        : "translate-y-6 opacity-0"
                        }`}
                >
                    {page ? (
                        pagination.page < pagination.pages && (
                            <button
                                onClick={handleLoadMore}
                                disabled={loading}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-[#D19F3E] px-6 py-2.5 text-base font-semibold text-[#A17B35] transition hover:bg-[#D19F3E] hover:text-white disabled:opacity-50"
                            >
                                {loading ? "Loading…" : "Load more"}
                            </button>
                        )
                    ) : (
                        <button
                            onClick={handleViewAll}
                            className="group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] px-6 py-2.5 text-base font-semibold text-white transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#F5B51B] focus:ring-offset-2"
                        >
                            <span>See all featured{pagination.total > liveAuctions.length ? ` (${pagination.total})` : ""}</span>
                            <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                        </button>
                    )}
                </div>
            </Container>
        </section>
    );
};

export default FeaturedListings;