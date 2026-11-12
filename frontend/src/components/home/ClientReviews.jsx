import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, PenLine, Quote, Star } from "lucide-react";
import Container from "../Container";
import axiosInstance from "../../utils/axiosInstance";
import SectionHeading from "./SectionHeading";

const LABEL = { bidder: "Buyer", seller: "Seller" };

function Stars({ rating }) {
    return (
        <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={16} className={n <= rating ? "fill-[#D19F3E] text-[#D19F3E]" : "text-gray-300"} />
            ))}
        </div>
    );
}

/** Home page: a few approved website reviews, with links to all reviews and the review form. */
function ClientReviews() {
    const [reviews, setReviews] = useState([]);
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        axiosInstance
            .get("/api/v1/website-review/approved?page=1&limit=3")
            .then(({ data }) => {
                if (data?.success) {
                    setReviews(data.data.reviews || []);
                    setSummary(data.data.summary || null);
                }
            })
            .catch(() => {});
    }, []);

    return (
        <section className="bg-white py-10 md:py-16" aria-labelledby="home-reviews-heading">
            <Container>
                <SectionHeading
                    eyebrow="Reviews"
                    title="What Our Clients Say"
                    intro={summary?.total ? `Rated ${Number(summary.average).toFixed(1)} out of 5 by ${summary.total} verified buyer${summary.total === 1 ? "" : "s"} and seller${summary.total === 1 ? "" : "s"}.` : undefined}
                    action={
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Link
                                to="/rate-us"
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] px-5 py-2.5 text-base font-semibold text-[#072342] transition hover:shadow-md"
                            >
                                <PenLine size={18} /> Leave a Review
                            </Link>
                            {reviews.length > 0 && (
                                <Link
                                    to="/reviews"
                                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-[#D19F3E] px-5 py-2.5 text-base font-semibold text-[#A17B35] transition hover:bg-[#D19F3E] hover:text-white"
                                >
                                    See All Reviews <ArrowRight size={18} />
                                </Link>
                            )}
                        </div>
                    }
                />

                {reviews.length > 0 && (
                    <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
                        {reviews.map((r) => (
                            <li
                                key={r._id}
                                className="relative flex w-[86%] shrink-0 snap-start flex-col rounded-2xl border border-gray-200 bg-[#F6F7F9] p-5 sm:w-[60%] md:w-auto md:p-6"
                            >
                                <Quote size={30} className="absolute right-4 top-4 text-[#D19F3E]/20" />
                                <Stars rating={r.rating} />
                                <p className="mt-3 line-clamp-6 flex-1 whitespace-pre-wrap break-words text-base leading-relaxed text-gray-700">
                                    {r.feedback}
                                </p>
                                <p className="mt-4 font-semibold text-[#072342]">{r.name}</p>
                                <p className="text-sm text-gray-500">
                                    {[LABEL[r.userType] || "Client", r.location].filter(Boolean).join(" · ")}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </Container>
        </section>
    );
}

export default ClientReviews;
