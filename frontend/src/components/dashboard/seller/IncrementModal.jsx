import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "react-hot-toast";
import axiosInstance from "../../../utils/axiosInstance";
import useBodyScrollLock from "../../../hooks/useBodyScrollLock";
import { INCREMENT_BANDS, minIncrementFor } from "../../../utils/listingRules";

// Change a listing's bid increment. Amounts are in the listing's own currency.
// Lower any time down to the minimum for the current bid; raise only before
// the first bid (rules: backend/src/utils/listingRules.js).
const IncrementModal = ({ auction, onClose, onChanged }) => {
    useBodyScrollLock(!!auction);
    const [value, setValue] = useState(auction ? String(auction.bidIncrement || "") : "");
    const [saving, setSaving] = useState(false);
    if (!auction) return null;

    const sym = auction.baseCurrency === "GBP" ? "£" : "€";
    const hasBids = Number(auction.bidCount) > 0;
    const basis = hasBids ? Number(auction.currentPrice) : Number(auction.startPrice);
    const min = minIncrementFor(basis);
    const current = Number(auction.bidIncrement) || 0;
    const n = Number(value);
    const error = !value ? "" :
        !Number.isInteger(n) || n <= 0 ? "Enter a whole amount." :
        n < min ? `The minimum here is ${sym}${min}.` :
        hasBids && n > current ? "Once bidding has started you can only lower it." : "";

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await axiosInstance.patch(`/api/v1/auctions/${auction._id}/increment`, { bidIncrement: n });
            toast.success(data.message || "Increment updated");
            onChanged?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message || "Could not change the increment");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="inc-title">
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="inc-title" className="text-xl font-semibold text-[#072342]">Change bid increment</h2>
                        <p className="text-sm text-gray-600 mt-1">{auction.title}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-2 -m-1 text-gray-500 hover:text-black"><X size={20} /></button>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg bg-gray-50 p-3"><dt className="text-gray-500">{hasBids ? "Current bid" : "Start price"}</dt><dd className="font-semibold">{sym}{basis.toLocaleString("en-IE")}</dd></div>
                    <div className="rounded-lg bg-gray-50 p-3"><dt className="text-gray-500">Now</dt><dd className="font-semibold">{sym}{current.toLocaleString("en-IE")}</dd></div>
                    <div className="rounded-lg bg-gray-50 p-3"><dt className="text-gray-500">Minimum</dt><dd className="font-semibold">{sym}{min.toLocaleString("en-IE")}</dd></div>
                </dl>

                <label htmlFor="new-increment" className="block mt-4 text-sm font-medium text-gray-800">New increment</label>
                <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">{sym}</span>
                    <input
                        id="new-increment"
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={min}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="w-full pl-8 p-3 min-h-[44px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#072342] focus:border-transparent"
                    />
                </div>
                {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
                <p className="text-xs text-gray-600 mt-2">
                    {hasBids
                        ? "Bidding has started, so you can lower it but not raise it. It applies straight away."
                        : "You can raise or lower it before the first bid. It applies straight away."}
                    {" "}The minimum rises with the current bid, and the increment goes up automatically if bidding passes into a higher band.
                </p>

                <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-[#072342] font-medium min-h-[44px] flex items-center">Minimum increments table</summary>
                    <table className="w-full mt-1 text-left">
                        <thead><tr className="text-gray-500"><th className="py-1 font-medium">Current bid</th><th className="py-1 font-medium">Minimum</th></tr></thead>
                        <tbody>
                            {INCREMENT_BANDS.map((b) => (
                                <tr key={b.label} className={b.min === min ? "font-semibold text-[#072342]" : ""}>
                                    <td className="py-1">{b.label}</td><td className="py-1">{sym}{b.min.toLocaleString("en-IE")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </details>

                <button
                    type="button"
                    onClick={save}
                    disabled={!value || !!error || saving || n === current}
                    className="mt-5 w-full min-h-[48px] rounded-lg bg-[#072342] text-white font-semibold disabled:opacity-50"
                >
                    {saving ? "Saving…" : "Save increment"}
                </button>
            </div>
        </div>
    );
};

export default IncrementModal;
