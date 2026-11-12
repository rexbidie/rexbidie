import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import Container from "../Container";
import { useAuth } from "../../contexts/AuthContext";
import axiosInstance from "../../utils/axiosInstance";
import { getDayKey } from "../../utils/catalogueDate";

import SectionHeading from "./SectionHeading";

const dayLabel = (dayKey) => {
    const [y, m, d] = dayKey.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" });
};

const closesWhen = (dayKey) => {
    const [y, m, d] = dayKey.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((target - today) / 86400000);
    if (days <= 0) return "Closes today";
    if (days === 1) return "Closes tomorrow";
    return `Closes in ${days} days`;
};

// Where "Enter Lots" goes: the create-listing page for anyone logged in
// (buyers use the seller one, as the mobile menu's "Sell" does), otherwise
// the Sell page, which explains how to list.
const CREATE_LISTING = {
    bidder: "/seller/auctions/create",
    seller: "/seller/auctions/create",
    company: "/company/auctions/create",
    broker: "/broker/auctions/create",
    admin: "/admin/auctions/create",
};

function SaleDates() {
    const { user } = useAuth();
    const enterLotsPath = user ? CREATE_LISTING[user.userType] || "/seller/auctions/create" : "/sell";
    const [dates, setDates] = useState([]);

    useEffect(() => {
        axiosInstance
            .get(`/api/v1/catalogues?status=upcoming&limit=6`)
            .then(({ data }) => data?.success && setDates(data.data.catalogues || []))
            .catch((err) => console.error("Sale dates fetch failed:", err));
    }, []);

    if (dates.length === 0) return null;

    return (
        <section className="bg-white py-9 md:py-16">
            <Container>
                <SectionHeading
                    eyebrow="Sale dates"
                    title="Upcoming Sale Dates"
                    action={
                        <div className="flex flex-col gap-3 sm:flex-row">
                        <Link
                            to={enterLotsPath}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] px-5 py-2.5 text-base font-semibold text-[#072342] transition hover:shadow-md"
                        >
                            <Plus size={18} /> Enter Lots
                        </Link>
                        <Link
                            to="/catalogues"
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-[#D19F3E] px-5 py-2.5 text-base font-semibold text-[#A17B35] transition hover:bg-[#D19F3E] hover:text-white"
                        >
                            All Sale Dates <ArrowRight size={18} />
                        </Link>
                        </div>
                    }
                />

                <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
                    {dates.slice(0, 3).map((c) => {
                        const key = getDayKey(c.closingDate);
                        return (
                            <Link
                                key={c._id}
                                to={`/catalogue/${c._id}`}
                                className="group flex w-[88%] shrink-0 snap-start items-center gap-4 rounded-2xl border border-gray-200 bg-white p-3 transition hover:border-[#D19F3E] hover:shadow-md md:w-auto"
                            >
                                <div className="h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 md:h-28 md:w-36">
                                    {c.image?.url && (
                                        <img src={c.image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 text-lg font-bold text-[#072342] md:text-base">
                                        <CalendarDays className="h-4 w-4 shrink-0 text-[#D19F3E] md:h-5 md:w-5" />
                                        {dayLabel(key)}
                                    </p>
                                    <p className="mt-1 text-base text-gray-600 md:text-sm">{closesWhen(key)}</p>
                                    <p className="mt-2 inline-flex items-center gap-1 text-base font-semibold text-[#A17B35] md:text-sm">
                                        View machines
                                        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </Container>
        </section>
    );
}

export default SaleDates;
