import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../../../utils/axiosInstance";
import useBodyScrollLock from "../../../hooks/useBodyScrollLock";
import { minLivePrice, CLOSE_CUTOFF_HOURS } from "../../../utils/liveBuyNow";
import { MIN_NO_RESERVE_START_EUR } from "../../../utils/listingRules";

// Small price windows on My Listings. Amounts are in the listing's own
// currency and apply straight away (no approval).

const Shell = ({ title, subtitle, onClose, children }) => (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
        <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-[#072342]">{title}</h2>
                    <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="p-2 -m-1 text-gray-500 hover:text-black"><X size={20} /></button>
            </div>
            {children}
        </div>
    </div>
);

const PriceInput = ({ id, label, sym, value, onChange, placeholder }) => (
    <>
        <label htmlFor={id} className="block mt-4 text-sm font-medium text-gray-800">{label}</label>
        <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">{sym}</span>
            <input id={id} type="number" inputMode="numeric" step="1" min="0" value={value} placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full pl-8 p-3 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#072342] focus:border-transparent" />
        </div>
    </>
);

/** Buy It Now during the auction: set, change or remove the price. */
export const BuyItNowPriceModal = ({ auction, onClose, onChanged }) => {
    useBodyScrollLock(!!auction);
    const current = Number(auction?.liveBuyNow?.price) || 0;
    const [value, setValue] = useState(current ? String(current) : "");
    const [saving, setSaving] = useState(false);
    if (!auction) return null;

    const sym = auction.baseCurrency === "GBP" ? "£" : "€";
    const min = minLivePrice(auction.reservePrice);
    const hasBids = Number(auction.bidCount) > 0;
    const n = Number(value);
    const error = !value ? "" :
        !Number.isInteger(n) || n <= 0 ? "Enter a whole amount." :
        n < min ? `At least 15% above the reserve: ${sym}${min.toLocaleString("en-IE")} or more.` :
        hasBids && current && n > current ? "Once bidding has started it can only be lowered or removed." : "";

    const save = async (price) => {
        setSaving(true);
        try {
            const { data } = await axiosInstance.patch(`/api/v1/auctions/${auction._id}/live-buy-now-price`, { price });
            toast.success(data.message);
            onChanged?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not save the price");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Shell title="Buy It Now price" subtitle={auction.title} onClose={onClose}>
            <p className="mt-3 text-sm text-gray-700">
                Lets a buyer buy outright while the auction is live. It must be at least 15% above your reserve
                ({sym}{Number(auction.reservePrice).toLocaleString("en-IE")} → {sym}{min.toLocaleString("en-IE")} or more).
                It closes once bidding reaches 90% of your reserve, or {CLOSE_CUTOFF_HOURS} hours before the end.
                {hasBids ? " Bidding has started, so you can add it, lower it or remove it, but not raise it." : ""}
            </p>
            <PriceInput id="bin-price" label="Buy It Now price" sym={sym} value={value} onChange={setValue} placeholder={String(min)} />
            {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
            <button type="button" onClick={() => save(n)} disabled={!value || !!error || saving || n === current}
                className="mt-5 w-full min-h-[48px] rounded-lg bg-[#072342] text-white font-semibold disabled:opacity-50">
                {saving ? "Saving…" : current ? "Save new price" : "Add Buy It Now"}
            </button>
            {current > 0 && (
                <button type="button" onClick={() => save(null)} disabled={saving}
                    className="mt-2 w-full min-h-[44px] rounded-lg border border-gray-300 text-red-700 font-semibold">
                    Remove Buy It Now
                </button>
            )}
        </Shell>
    );
};

/** Lower the starting bid (before the first bid only). */
export const StartPriceModal = ({ auction, onClose, onChanged }) => {
    useBodyScrollLock(!!auction);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    if (!auction) return null;

    const sym = auction.baseCurrency === "GBP" ? "£" : "€";
    const current = Number(auction.startPrice) || 0;
    const noReserve = auction.auctionType === "standard";
    const n = Number(value);
    // Sterling minimums are checked by the server at the current exchange rate.
    const min = noReserve && auction.baseCurrency !== "GBP" ? MIN_NO_RESERVE_START_EUR : 1;
    const error = !value ? "" :
        !Number.isInteger(n) || n <= 0 ? "Enter a whole amount." :
        n >= current ? "It must be lower than the current starting bid." :
        n < min ? `The minimum starting bid for a no-reserve auction is ${sym}${min}.` : "";

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await axiosInstance.patch(`/api/v1/auctions/${auction._id}/start-price`, { startPrice: n });
            toast.success(data.message);
            onChanged?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not lower the starting bid");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Shell title="Lower starting bid" subtitle={auction.title} onClose={onClose}>
            <p className="mt-3 text-sm text-gray-700">
                Current starting bid: <strong>{sym}{current.toLocaleString("en-IE")}</strong>. You can lower it until the first bid is placed. It applies straight away.
                {noReserve ? ` No-reserve auctions must start at ${sym === "£" ? "the sterling equivalent of €400" : "€400"} or more.` : " Your reserve stays the same."}
            </p>
            <PriceInput id="start-price" label="New starting bid" sym={sym} value={value} onChange={setValue} />
            {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
            <button type="button" onClick={save} disabled={!value || !!error || saving}
                className="mt-5 w-full min-h-[48px] rounded-lg bg-[#072342] text-white font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Lower starting bid"}
            </button>
        </Shell>
    );
};
