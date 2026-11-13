import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Loader, ShieldCheck, ShoppingCart, X } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../../utils/axiosInstance";
import { useAuth } from "../../contexts/AuthContext";
import { buyerFeeShort, calcBuyerFee } from "../../utils/fees";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { money, timeLeft } from "./binShared";
import { useNow } from "./useNow";
import BinManage from "./BinManage";

// Listing page panel for Buy It Now after the auction.
// Buyers see the price, the time left and a Buy It Now button; the seller
// (and RexBid staff) see the controls to start, schedule or lower it.

// Also used for Buy It Now during the auction (LiveBuyNowPanel), with its own buyUrl.
export const ConfirmModal = ({ open, onClose, info, auction, onBought, buyUrl }) => {
    useBodyScrollLock(open);
    const navigate = useNavigate();
    const [agreed, setAgreed] = useState(false);
    const [buying, setBuying] = useState(false);
    if (!open) return null;
    const cur = info.displayCurrency;
    const fee = cur === "EUR" ? calcBuyerFee(info.price) : null;

    const buy = async () => {
        setBuying(true);
        try {
            const { data } = await axiosInstance.post(buyUrl || `/api/v1/buy-it-now/lot/${auction._id}/buy`, {
                agreed: true,
                expectedPriceInBase: info.priceInBase,
            });
            toast.success(data.message, { duration: 8000 });
            onBought();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not complete the purchase", { duration: 8000 });
            if (err.response?.data?.redirectTo) return navigate(err.response.data.redirectTo);
            onClose(true);
        } finally {
            setBuying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bin-confirm-title">
            <div className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4">
                    <h2 id="bin-confirm-title" className="text-lg font-semibold">Confirm purchase</h2>
                    <button type="button" onClick={() => onClose(false)} aria-label="Close" className="p-1 text-gray-500 hover:text-black"><X size={20} /></button>
                </div>
                <p className="text-sm text-gray-600 mt-1">{auction.title}</p>

                <dl className="mt-4 text-sm divide-y divide-gray-100 border-y border-gray-100">
                    <div className="flex justify-between py-2"><dt>Price</dt><dd className="font-semibold">{money(info.price, cur)}{auction.vatIncluded ? " + VAT" : ""}</dd></div>
                    <div className="flex justify-between py-2">
                        <dt>Buyer fee</dt>
                        <dd>{fee != null ? money(fee, cur) : buyerFeeShort}</dd>
                    </div>
                    {fee != null && (
                        <div className="flex justify-between py-2 font-semibold"><dt>Total{auction.vatIncluded ? " (before VAT)" : ""}</dt><dd>{money(info.price + fee, cur)}</dd></div>
                    )}
                </dl>

                <ul className="text-sm text-gray-700 mt-4 space-y-1.5 list-disc pl-5">
                    <li>This is a binding purchase, the same as winning the auction.</li>
                    <li>We'll email your payment request. Payment is due within 48 hours.</li>
                    <li>Collect within 3 working days of payment.</li>
                </ul>

                <label className="flex items-start gap-2 mt-4 text-sm">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
                    <span>I agree to buy this lot at {money(info.price, cur)} under the <Link to="/buyer-terms" target="_blank" className="underline">buyer terms</Link>.</span>
                </label>

                <button
                    type="button"
                    onClick={buy}
                    disabled={!agreed || buying}
                    className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-[#edcd1f] text-black font-semibold rounded-lg py-3 disabled:opacity-50"
                >
                    {buying ? <Loader size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
                    Buy now for {money(info.price, cur)}
                </button>
            </div>
        </div>
    );
};

const PostAuctionBinPanel = ({ auction, onPurchased }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const currency = user?.currency || "EUR";
    const [info, setInfo] = useState(null);
    const [open, setOpen] = useState(false);
    const now = useNow(30000);

    const relevant = auction?.auctionType === "reserve" &&
        ["reserve_not_met", "sold", "draft", "approved", "active"].includes(auction?.status);

    const load = useCallback(async () => {
        if (!auction?._id) return;
        try {
            const { data } = await axiosInstance.get(`/api/v1/buy-it-now/lot/${auction._id}?currency=${currency}`);
            setInfo(data.data);
        } catch {
            setInfo(null);
        }
    }, [auction?._id, currency]);

    // The listing page keeps `auction` live over its realtime channel, so a
    // change of status or Buy It Now price triggers a reload here.
    useEffect(() => {
        if (relevant) load();
    }, [relevant, load, auction?.status, auction?.postAuctionBin?.status, auction?.postAuctionBin?.price, user?._id]);

    if (!relevant || !info) return null;

    const live = info.live && new Date(info.endsAt).getTime() > now;
    const isManager = !!info.manage;

    if (isManager) {
        // Only show the seller box once there's something to do or see.
        const m = info.manage;
        if (!live && !m.canSetup && !m.scheduledPrice && !["sold", "expired"].includes(info.status) && !m.blockedByTopBid) return null;
        return <div className="my-4"><BinManage auctionId={auction._id} info={info} onChanged={load} /></div>;
    }

    if (!live) return null;

    const start = () => {
        if (!user) return navigate("/login");
        setOpen(true);
    };

    return (
        <div className="my-4 rounded-lg border-2 border-[#edcd1f] bg-white p-4">
            <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Last Chance · fixed price after the auction</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
                {money(info.price, info.displayCurrency)}
                {auction.vatIncluded && <span className="text-sm font-normal text-gray-500 ml-1">+ VAT</span>}
            </p>
            <p className="text-sm text-gray-700 mt-1 flex items-center gap-1.5">
                <Clock size={14} /> {timeLeft(info.endsAt, now)} · first buyer to confirm gets it
            </p>
            <button
                type="button"
                onClick={start}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#edcd1f] text-black font-semibold rounded-lg py-3 hover:bg-[#edcd1f]/90"
            >
                <ShoppingCart size={18} /> Buy now
            </button>
            <p className="text-xs text-gray-500 mt-3 flex items-start gap-1.5">
                <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-green-700" />
                The auction didn't reach the seller's reserve, so they're offering it at this fixed price. Buyer fee applies ({buyerFeeShort}). Paid and collected through RexBid.
            </p>
            <Link to="/last-chance" className="text-xs underline text-gray-600 mt-2 inline-block">See everything on Last Chance</Link>

            <ConfirmModal
                open={open}
                info={info}
                auction={auction}
                onClose={(refresh) => { setOpen(false); if (refresh) load(); }}
                onBought={() => { setOpen(false); load(); onPurchased?.(); }}
            />
        </div>
    );
};

export default PostAuctionBinPanel;
