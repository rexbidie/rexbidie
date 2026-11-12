import { Link } from "react-router-dom";
import { ArrowRight, Clock, MapPin, ShoppingCart } from "lucide-react";
import Container from "../Container";
import { money, timeLeft } from "../buyItNow/binShared";
import { useNow } from "../buyItNow/useNow";

/**
 * Shown at the very top of the homepage while any lot is on Buy It Now
 * (after the auction, 48 hours). Ending soonest first; hidden when nothing is live.
 */
function HomeBuyItNow({ lots }) {
    const now = useNow(30000);
    const live = (lots || []).filter((l) => new Date(l.endsAt).getTime() > now);
    if (live.length === 0) return null;
    const shown = live.slice(0, 4);

    return (
        <section className="bg-white pt-[72px] md:pt-[84px]" aria-labelledby="home-bin-heading">
            <Container>
                <div className="mt-4 rounded-2xl bg-[#072342] p-4 shadow-lg md:p-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="inline-flex items-center gap-1.5 rounded-full bg-[#D19F3E] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#072342]">
                                <Clock size={12} /> 48 hours only
                            </p>
                            <h2 id="home-bin-heading" className="mt-2 text-[1.6rem] font-bold text-white md:text-2xl">Buy It Now</h2>
                            <p className="text-base text-gray-300 md:text-sm">Missed their reserve, now at a fixed price at least 10% below it. First buyer gets it.</p>
                        </div>
                        <Link
                            to="/buy-it-now"
                            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#D19F3E] px-5 py-2.5 text-base font-semibold text-[#072342] transition hover:bg-[#E8B86B] sm:w-auto"
                        >
                            See All {live.length} <ArrowRight size={18} />
                        </Link>
                    </div>

                    <ul className="mt-4 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-4 md:overflow-visible">
                        {shown.map((lot) => {
                            const urgent = new Date(lot.endsAt).getTime() - now < 6 * 36e5;
                            return (
                                <li key={lot._id} className="w-[86%] shrink-0 snap-start sm:w-[45%] md:w-auto">
                                    <Link to={`/auction/${lot._id}`} className="group flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-white/10 transition hover:ring-2 hover:ring-[#D19F3E]">
                                        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                                            {lot.photo && <img src={lot.photo.thumbUrl || lot.photo.url} alt={lot.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                                            <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${urgent ? "bg-red-600" : "bg-black/75"}`}>
                                                <Clock size={11} /> {timeLeft(lot.endsAt, now)}
                                            </span>
                                        </div>
                                        <div className="flex flex-1 flex-col p-3">
                                            <h3 className="line-clamp-2 text-base font-semibold text-gray-900 group-hover:underline md:text-sm">{lot.title}</h3>
                                            {lot.location && <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500 md:text-xs"><MapPin size={12} /> {lot.location}</p>}
                                            <p className="mt-auto pt-2 text-xl font-bold text-gray-900 md:text-lg">
                                                {money(lot.price, lot.displayCurrency)}
                                                {lot.vatIncluded && <span className="ml-1 text-[11px] font-normal text-gray-500">+ VAT</span>}
                                            </p>
                                            <span className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-[#edcd1f] py-2.5 text-sm font-semibold text-black md:py-1.5 md:text-xs">
                                                <ShoppingCart size={14} /> Buy It Now
                                            </span>
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </Container>
        </section>
    );
}

export default HomeBuyItNow;
