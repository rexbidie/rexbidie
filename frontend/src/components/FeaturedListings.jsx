import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Filter, Gavel, Grid, List, Star } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import AuctionCard from "./AuctionCard";
import AuctionListItem from "./AuctionListItem";
import Container from "./Container";
import { useAuth } from "../contexts/AuthContext";
import { useLiveAuctionTicks } from "../hooks/useLiveAuctionTicks";

const FeaturedListings = () => {
    const navigate = useNavigate();
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState("grid"); // grid or list
    const [sortBy, setSortBy] = useState("highestBid");
    const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1, limit: 8 });
    const [category, setCategory] = useState("all");
    const [visible, setVisible] = useState(false);

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
            { threshold: 0.1 }
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
        navigate("/auctions?featured=true");
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
                    <h2 className="text-[1.6rem] font-bold leading-tight text-[#072342] md:text-[2rem]">Featured Machinery</h2>
                </div>
                            {/* <p className="text-gray-500 mt-1">
                                Premium machinery and vehicles handpicked by RexBid
                            </p> */}
                        </div>
                    </div>
                </div>

                {/* Listings grid/list */}
                {viewMode === "grid" ? (
                    <section className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-7 sm:gap-y-10 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
                        {liveAuctions.map((listing, index) => (
                            <div
                                key={listing._id}
                                className={`w-[90%] shrink-0 snap-start sm:w-auto transition-all duration-1000 ease-out ${visible
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
                    className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 mt-10 transition-all delay-[900ms] duration-1000 ease-out ${visible
                        ? "translate-y-0 opacity-100"
                        : "translate-y-6 opacity-0"
                        }`}
                >
                    {pagination.page < pagination.pages && (
                        <button
                            onClick={handleLoadMore}
                            disabled={loading}
                            className="px-8 py-4 border-2 border-[#D19F3E] text-[#A17B35] text-lg font-semibold rounded-xl hover:bg-[#D19F3E] hover:text-white transition-all disabled:opacity-50"
                        >
                            {loading ? "Loading..." : "Load More"}
                        </button>
                    )}
                    <button
                        onClick={handleViewAll}
                        className="group flex w-full items-center justify-center gap-2 bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] text-white text-lg font-semibold rounded-xl hover:bg-gradient-to-r hover:from-[#D19F3E]/90 hover:to-[#E8B86B]/90 px-10 py-4 sm:w-auto transition-all duration-300 hover:bg-[#e4a000] hover:shadow-[0_0_35px_rgba(197,157,85,0.25)] focus:outline-none focus:ring-2 focus:ring-[#F5B51B] focus:ring-offset-2"
                    >
                        <span>See All Machinery</span>
                        <ArrowRight
                            size={22}
                            className="transition-transform duration-300 group-hover:translate-x-1"
                        />
                    </button>
                </div>
            </Container>
        </section>
    );
};

export default FeaturedListings;