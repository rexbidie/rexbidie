import { useCallback, useEffect, useState } from "react";
import { Loader, X } from "lucide-react";
import axiosInstance from "../../utils/axiosInstance";
import { useAuth } from "../../contexts/AuthContext";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import BinManage from "./BinManage";

// Seller dashboard: set up or manage Last Chance after the auction for one lot.
const BinDashboardModal = ({ auction, onClose }) => {
    useBodyScrollLock(!!auction);
    const { user } = useAuth();
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!auction?._id) return;
        try {
            const { data } = await axiosInstance.get(`/api/v1/buy-it-now/lot/${auction._id}?currency=${user?.currency || "EUR"}`);
            setInfo(data.data);
        } catch (err) {
            setError(err.response?.data?.message || "Could not load Last Chance");
        }
    }, [auction?._id, user?.currency]);

    useEffect(() => { load(); }, [load]);

    if (!auction) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bin-dash-title">
            <div className="bg-white w-full sm:max-w-lg rounded-t-xl sm:rounded-xl p-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                        <h2 id="bin-dash-title" className="text-lg font-semibold">Last Chance (48 hours)</h2>
                        <p className="text-sm text-gray-600">{auction.title}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-black"><X size={20} /></button>
                </div>
                {error ? (
                    <p className="text-sm text-red-600">{error}</p>
                ) : !info ? (
                    <p className="text-sm text-gray-500 flex items-center gap-2"><Loader size={14} className="animate-spin" /> Loading…</p>
                ) : (
                    <BinManage auctionId={auction._id} info={info} onChanged={load} />
                )}
                <ul className="mt-4 text-xs text-gray-500 list-disc pl-5 space-y-1">
                    <li>For lots with a reserve. The price must be at least 10% below your reserve and above the top bid.</li>
                    <li>The lot is on the public Last Chance page for 48 hours. Bidders, watchers and people who asked about it are told.</li>
                    <li>The first buyer to confirm buys it, and the sale follows the normal RexBid process.</li>
                </ul>
            </div>
        </div>
    );
};

export default BinDashboardModal;
