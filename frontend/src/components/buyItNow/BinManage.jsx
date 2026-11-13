import { useState } from "react";
import { Loader } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../../utils/axiosInstance";
import { money, timeLeft } from "./binShared";

// Seller (or RexBid staff) controls for Last Chance after the auction.
// Used on the listing page and in the dashboard modal.
// `info` is the response of GET /api/v1/buy-it-now/lot/:id (with `manage`).

const BinManage = ({ auctionId, info, onChanged }) => {
    const m = info?.manage;
    const cur = info?.displayCurrency || "EUR";
    const sym = cur === "GBP" ? "£" : "€";
    const [price, setPrice] = useState("");
    const [saving, setSaving] = useState(false);

    if (!m) return null;

    const call = async (method, url, body, okMessage) => {
        setSaving(true);
        try {
            const { data } = await axiosInstance({ method, url, data: body });
            toast.success(data.message || okMessage);
            setPrice("");
            onChanged?.();
        } catch (err) {
            toast.error(err.response?.data?.message || "Something went wrong", { duration: 6000 });
        } finally {
            setSaving(false);
        }
    };

    const submit = (e) => {
        e.preventDefault();
        if (!price) return;
        if (info.live) {
            call("patch", `/api/v1/buy-it-now/lot/${auctionId}/price`, { price: Number(price), currency: cur });
        } else {
            if (m.mode === "start" && !window.confirm(`Put this lot on Last Chance at ${money(price, cur)} for 48 hours? The first buyer to confirm buys it.`)) return;
            call("post", `/api/v1/buy-it-now/lot/${auctionId}/setup`, { price: Number(price), currency: cur });
        }
    };

    const priceInput = (label, hint) => (
        <form onSubmit={submit} className="mt-3">
            <label htmlFor={`bin-price-${auctionId}`} className="block text-sm font-medium text-gray-800">{label}</label>
            <div className="flex gap-2 mt-1">
                <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{sym}</span>
                    <input
                        id={`bin-price-${auctionId}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#edcd1f]"
                    />
                </div>
                <button type="submit" disabled={!price || saving} className="px-4 py-2 bg-black text-white rounded-md text-sm disabled:opacity-50 inline-flex items-center gap-2">
                    {saving && <Loader size={14} className="animate-spin" />}
                    {info.live ? "Lower price" : m.mode === "start" ? "Start 48 hours" : "Save"}
                </button>
            </div>
            {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
        </form>
    );

    const limits = [
        m.maxPrice ? `No more than ${money(m.maxPrice, cur)} (10% below your reserve)` : null,
        m.topBid ? `more than the top bid of ${money(m.topBid, cur)}` : null,
    ].filter(Boolean).join(", and ");

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <p className="font-semibold text-gray-900">Last Chance after the auction</p>

            {info.live ? (
                <>
                    <p className="mt-1">
                        On Last Chance at <strong>{money(m.livePrice, cur)}</strong> · {timeLeft(info.endsAt)}. We've told the bidders, watchers and everyone who asked about it.
                    </p>
                    {priceInput("Lower the price (optional)", `Must be lower than ${money(m.livePrice, cur)}${m.topBid ? ` and more than the top bid of ${money(m.topBid, cur)}` : ""}.`)}
                </>
            ) : info.status === "sold" ? (
                <p className="mt-1">Sold on Last Chance at {money(info.price, cur)}.</p>
            ) : info.status === "expired" ? (
                <p className="mt-1">Last Chance ended without a sale. You can relist the lot from your dashboard.</p>
            ) : m.blockedByTopBid ? (
                <p className="mt-1">The top bid is already within 10% of your reserve, so Last Chance isn't available. Contact RexBid if you'd like to sell to the top bidder.</p>
            ) : m.scheduledPrice ? (
                <>
                    <p className="mt-1">
                        If the reserve isn't met, this lot goes on Last Chance for 48 hours at <strong>{money(m.scheduledPrice, cur)}</strong>.
                    </p>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => call("delete", `/api/v1/buy-it-now/lot/${auctionId}/setup`, undefined, "Removed")}
                        className="mt-2 text-sm underline text-gray-700 hover:text-black"
                    >
                        Remove this price
                    </button>
                    {priceInput("Change the price", limits ? `${limits}. It must also beat the final top bid.` : null)}
                </>
            ) : m.canSetup ? (
                m.mode === "start" ? (
                    <>
                        <p className="mt-1">Your reserve wasn't met. Offer the lot at a fixed price for 48 hours. We'll tell the bidders, watchers and everyone who asked about it, and the first buyer to confirm buys it.</p>
                        {priceInput("Last Chance price", limits ? `${limits}.` : null)}
                    </>
                ) : (
                    <>
                        <p className="mt-1">Set a backup price now. If the reserve isn't met, the lot goes straight onto Last Chance for 48 hours.</p>
                        {priceInput("Backup Last Chance price", limits ? `${limits}. It must also beat the final top bid.` : null)}
                    </>
                )
            ) : (
                <p className="mt-1">{m.note || m.reason}</p>
            )}
            {info.status === "not_started" && m.note && <p className="mt-2 text-amber-700">Your earlier price couldn't be used: {m.note}</p>}
        </div>
    );
};

export default BinManage;
