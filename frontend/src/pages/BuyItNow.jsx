import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Gavel, MapPin, ShieldCheck, ShoppingCart, Tag } from "lucide-react";
import { Container, LoadingSpinner } from "../components";
import axiosInstance from "../utils/axiosInstance";
import { useAuth } from "../contexts/AuthContext";
import { money, timeLeft } from "../components/buyItNow/binShared";
import { useNow } from "../components/buyItNow/useNow";

// Public page: lots that missed their reserve and are now offered at a fixed
// price for 48 hours. The first buyer to confirm buys the lot.

const LotCard = ({ lot, now }) => {
    const urgent = new Date(lot.endsAt).getTime() - now < 6 * 36e5;
    return (
        <Link
            to={`/auction/${lot._id}`}
            className="group flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
        >
            <div className="relative aspect-[4/3] bg-gray-100">
                {lot.photo ? (
                    <img src={lot.photo.thumbUrl || lot.photo.url} alt={lot.title} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300"><Tag size={40} /></div>
                )}
                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${urgent ? "bg-red-600 text-white" : "bg-black/75 text-white"}`}>
                    <Clock size={12} /> {timeLeft(lot.endsAt, now)}
                </span>
            </div>
            <div className="flex flex-col flex-1 p-4">
                <h2 className="font-semibold text-gray-900 group-hover:underline line-clamp-2">{lot.title}</h2>
                {lot.location && (
                    <p className="text-sm text-gray-500 mt-1 flex items-center gap-1"><MapPin size={13} /> {lot.location}</p>
                )}
                <div className="mt-auto pt-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Last Chance</p>
                    <p className="text-2xl font-bold text-gray-900">
                        {money(lot.price, lot.displayCurrency)}
                        {lot.vatIncluded && <span className="text-xs font-normal text-gray-500 ml-1">+ VAT</span>}
                    </p>
                    {lot.topBid ? (
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <Gavel size={12} /> Top bid at auction {money(lot.topBid, lot.displayCurrency)} ({lot.bidCount} bid{lot.bidCount === 1 ? "" : "s"})
                        </p>
                    ) : null}
                    <span className="mt-3 inline-flex w-full items-center justify-center gap-2 bg-[#edcd1f] text-black font-medium rounded-md py-2 text-sm">
                        <ShoppingCart size={16} /> View &amp; buy
                    </span>
                </div>
            </div>
        </Link>
    );
};

const BuyItNow = () => {
    const { user } = useAuth();
    const currency = user?.currency || "EUR";
    const [lots, setLots] = useState(null);
    const now = useNow(30000);

    useEffect(() => {
        let cancelled = false;
        axiosInstance
            .get(`/api/v1/buy-it-now?currency=${currency}`)
            .then(({ data }) => !cancelled && setLots(data.data.lots || []))
            .catch(() => !cancelled && setLots([]));
        return () => { cancelled = true; };
    }, [currency]);

    const live = (lots || []).filter((l) => new Date(l.endsAt).getTime() > now);

    return (
        <Container>
            <section className="pt-28 pb-16">
                <div className="max-w-3xl">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Last Chance</h1>
                    <p className="text-gray-600 mt-3">
                        Machinery that just missed its reserve at auction, now offered by the seller at a fixed price, at least 10% below their reserve.
                        Each lot is here for 48 hours. The first buyer to confirm gets it.
                    </p>
                    <ul className="mt-4 grid sm:grid-cols-3 gap-3 text-sm text-gray-700">
                        <li className="flex items-start gap-2"><Clock size={16} className="mt-0.5 flex-shrink-0" /> 48 hours only, then it's gone</li>
                        <li className="flex items-start gap-2"><Tag size={16} className="mt-0.5 flex-shrink-0" /> Fixed price, no bidding</li>
                        <li className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-green-700" /> Paid and collected through RexBid, as with any sale</li>
                    </ul>
                </div>

                <div className="mt-10">
                    {lots === null ? (
                        <LoadingSpinner />
                    ) : live.length === 0 ? (
                        <div className="text-center py-16 border border-dashed border-gray-300 rounded-lg">
                            <ShoppingCart size={40} className="mx-auto text-gray-300 mb-3" />
                            <p className="font-medium text-gray-800">Nothing on Last Chance right now</p>
                            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                                Lots appear here after an auction ends without meeting its reserve. Watch or bid on a lot and we'll email you if it comes up on Last Chance.
                            </p>
                            <Link to="/auctions" className="inline-block mt-5 px-5 py-2.5 bg-black text-white rounded-md text-sm">Browse live auctions</Link>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-500 mb-4">{live.length} lot{live.length === 1 ? "" : "s"} · ending soonest first</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {live.map((lot) => <LotCard key={lot._id} lot={lot} now={now} />)}
                            </div>
                        </>
                    )}
                </div>
            </section>
        </Container>
    );
};

export default BuyItNow;
