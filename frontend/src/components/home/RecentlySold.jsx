import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import Container from "../Container";
import axiosInstance from "../../utils/axiosInstance";
import { useAuth } from "../../contexts/AuthContext";
import { money } from "./shared";
import SectionHeading from "./SectionHeading";

// Only show sales that closed at least this long ago: newer ones may still be
// awaiting payment or collection.
const MIN_AGE_DAYS = 14;

function RecentlySold() {
    const { user } = useAuth();
    const currency = user?.currency || "EUR";
    const [items, setItems] = useState([]);

    useEffect(() => {
        axiosInstance
            .get(`/api/v1/auctions/top?status=sold&sortBy=recentlyEnded&minAgeDays=${MIN_AGE_DAYS}&limit=8&currency=${currency}`)
            .then(({ data }) => {
                if (!data?.success) return;
                const cutoff = Date.now() - MIN_AGE_DAYS * 86400000;
                // Also filtered here, so the rule holds even against an older backend.
                const list = (data.data.auctions || [])
                    .filter((a) => new Date(a.endDate).getTime() <= cutoff)
                    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
                setItems(list);
            })
            .catch((err) => console.error("Recently sold fetch failed:", err));
    }, [currency]);

    if (items.length < 4) return null;

    return (
        <section className="bg-[#F6F7F9] py-9 md:py-16">
            <Container>
                <SectionHeading
                    eyebrow="Results"
                    title="Recently Sold on RexBid"
                    intro="Real prices from real Irish sellers."
                />
                <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
                    {items.slice(0, items.length >= 8 ? 8 : 4).map((a) => (
                        <Link
                            key={a._id}
                            to={`/auction/${a._id}`}
                            className="group w-[80%] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:shadow-md sm:w-[40%] md:w-auto"
                        >
                            <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                                {a.photos?.[0]?.url && (
                                    <img
                                        src={a.photos[0].url}
                                        alt={a.title}
                                        loading="lazy"
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                    />
                                )}
                                <span className="absolute left-2.5 top-2.5 rounded-full bg-[#072342] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                                    Sold
                                </span>
                            </div>
                            <div className="p-3.5">
                                <p className="truncate text-lg font-semibold text-gray-900 md:text-base">{a.title}</p>
                                {a.location && (
                                    <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-gray-500 md:text-xs">
                                        <MapPin size={12} className="shrink-0" /> {a.location}
                                    </p>
                                )}
                                <p className="mt-2 text-base text-gray-600 md:text-sm">
                                    Sold for{" "}
                                    <span className="text-xl font-bold text-[#072342] md:text-lg">
                                        {money(a.convertedFinalPrice ?? a.finalPrice ?? a.currentPrice, currency)}
                                    </span>
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            </Container>
        </section>
    );
}

export default RecentlySold;
