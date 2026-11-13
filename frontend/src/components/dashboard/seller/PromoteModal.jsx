import { useEffect, useState } from "react";
import { Loader, X } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../../../utils/axiosInstance";
import useBodyScrollLock from "../../../hooks/useBodyScrollLock";
import { META_BOOST_PACKAGES, META_BOOST_MIN_HOURS_BEFORE_CLOSE } from "../../../utils/fees";
import ListingExtrasPaymentModal from "../../listing/ListingExtrasPaymentModal";

// "Feature this ad" / "Meta Boost" from the listing menu: shows the price in
// the listing's currency, then takes card payment (backend:
// services/listingPromotionService.js). `start` is "featured" or "meta".
const PromoteModal = ({ auction, start = "featured", onClose, onDone }) => {
    useBodyScrollLock(!!auction);
    const [options, setOptions] = useState(null);
    const [featured, setFeatured] = useState(start === "featured");
    const [pkg, setPkg] = useState(start === "meta" ? "plus" : "");
    const [payment, setPayment] = useState(null);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        if (!auction?._id) return;
        axiosInstance.get(`/api/v1/auctions/${auction._id}/promote`)
            .then(({ data }) => setOptions(data.data))
            .catch((err) => { toast.error(err.response?.data?.message || "Could not load prices"); onClose(); });
    }, [auction?._id]);

    if (!auction) return null;
    if (payment) {
        return (
            <ListingExtrasPaymentModal
                isOpen
                payment={payment}
                auctionId={auction._id}
                title={featured ? "Feature this ad" : "Meta Boost"}
                intro={`${auction.title}. Pay by card to switch it on.`}
                confirmUrl={`/api/v1/auctions/${auction._id}/promote/confirm`}
                onClose={onClose}
                onSuccess={() => { onDone?.(); onClose(); }}
            />
        );
    }

    const sym = options?.currency === "GBP" ? "£" : "€";
    const fPrice = options?.featured.price ?? 0;
    const mPrice = pkg ? options?.metaBoost.prices[pkg] ?? 0 : 0;
    const total = (featured && options?.featured.available ? fPrice : 0) + (pkg && options?.metaBoost.available ? mPrice : 0);

    const pay = async () => {
        setStarting(true);
        try {
            const { data } = await axiosInstance.post(`/api/v1/auctions/${auction._id}/promote`, {
                featured: featured && options.featured.available,
                metaBoostPackage: options.metaBoost.available ? pkg : "",
            });
            setPayment(data.data.payment);
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not start the payment");
        } finally {
            setStarting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="promo-title">
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="promo-title" className="text-xl font-semibold text-[#072342]">Promote this ad</h2>
                        <p className="text-sm text-gray-600 mt-1">{auction.title}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-2 -m-1 text-gray-500 hover:text-black"><X size={20} /></button>
                </div>

                {!options ? (
                    <div className="py-10 flex justify-center"><Loader className="animate-spin" /></div>
                ) : (
                    <>
                        <label className={`mt-4 flex items-start gap-3 rounded-xl border-2 p-4 ${featured && options.featured.available ? "border-[#D19F3E] bg-[#FFF7EA]" : "border-gray-200"} ${options.featured.available ? "cursor-pointer" : "opacity-60"}`}>
                            <input type="checkbox" className="mt-1 h-5 w-5" checked={featured && options.featured.available} disabled={!options.featured.available} onChange={(e) => setFeatured(e.target.checked)} />
                            <span className="flex-1">
                                <span className="flex justify-between font-semibold text-gray-900"><span>Feature this ad</span><span>{sym}{fPrice}</span></span>
                                <span className="block text-sm text-gray-600 mt-1">
                                    {options.featured.already ? "Already featured." : "Shown in Featured Ads at the top of the home page, with a Featured badge, until the auction ends."}
                                </span>
                            </span>
                        </label>

                        <fieldset className="mt-3 rounded-xl border-2 border-gray-200 p-4">
                            <legend className="px-1 font-semibold text-gray-900">Meta Boost (Facebook &amp; Instagram)</legend>
                            {!options.metaBoost.available ? (
                                <p className="text-sm text-gray-600">
                                    {options.metaBoost.already ? `Already boosted (${options.metaBoost.already}).` : options.metaBoost.tooLate ? `Needs at least ${META_BOOST_MIN_HOURS_BEFORE_CLOSE} hours before the auction ends.` : "Not available for this listing."}
                                </p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-3 min-h-[44px]"><input type="radio" name="pkg" checked={!pkg} onChange={() => setPkg("")} /> No Meta Boost</label>
                                    {META_BOOST_PACKAGES.filter((p) => p.id).map((p) => (
                                        <label key={p.id} className="flex items-center gap-3 min-h-[44px]">
                                            <input type="radio" name="pkg" checked={pkg === p.id} onChange={() => setPkg(p.id)} />
                                            <span className="flex-1">{p.name}{p.reach ? <span className="text-gray-500 text-sm"> · reach {p.reach}</span> : null}</span>
                                            <span className="font-semibold">{sym}{options.metaBoost.prices[p.id]}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </fieldset>

                        <button
                            type="button"
                            onClick={pay}
                            disabled={!total || starting}
                            className="mt-5 w-full min-h-[50px] rounded-lg bg-[#D19F3E] text-[#072342] font-bold text-lg disabled:opacity-50"
                        >
                            {starting ? "Starting payment…" : total ? `Pay ${sym}${total}` : "Choose an option"}
                        </button>
                        <p className="text-xs text-gray-500 mt-2">Paid by card through Stripe. No VAT.</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default PromoteModal;
