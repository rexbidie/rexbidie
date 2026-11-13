import { useState, useEffect } from "react";
import { Loader, Gauge, X } from "lucide-react";
import axiosInstance from "../utils/axiosInstance";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import * as haptics from "../native/haptics";

const ProxyBidSection = ({ auction, userCurrency, onClose, onPaymentRequired, initialMaxAmount }) => {
    const { user } = useAuth();
    const [status, setStatus] = useState(null);
    const [maxAmount, setMaxAmount] = useState("");
    const [newMax, setNewMax] = useState("");
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);

    const symbol = userCurrency === "GBP" ? "£" : "€";

    useEffect(() => {
        if (user && auction?._id) fetchStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auction?._id, userCurrency, user?._id]);

    const fetchStatus = async () => {
        try {
            const { data } = await axiosInstance.get(
                `/api/v1/auctions/${auction._id}/proxy-bid/status?currency=${userCurrency}`
            );
            if (data.success) {
                setStatus(data.data);
                if (data.data.hasProxyBid) setNewMax(String(data.data.convertedMaxAmount ?? ""));
            }
        } catch (e) {
            console.error("Proxy status fetch:", e);
        }
    };

    useEffect(() => {
        if (!initialMaxAmount || !status) return;
        if (status.hasProxyBid && status.isActive) {
            setNewMax(initialMaxAmount);   // was an update
        } else {
            setMaxAmount(initialMaxAmount); // was a new place
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialMaxAmount, status]);

    // Minimum for a NEW or UPDATED max — display currency
    const minBid = auction.bidCount === 0
        ? (auction.convertedStartPrice || 0)
        : (auction.convertedCurrentPrice || 0) + (auction.convertedBidIncrement || 0);

    const handlePlace = async (e) => {
        e.preventDefault();
        const value = parseFloat(maxAmount);
        if (!value || value < minBid) {
            toast.error(`Minimum is ${symbol}${minBid.toFixed(0)}`);
            return;
        }
        setLoading(true);
        try {
            await axiosInstance.post(`/api/v1/auctions/${auction._id}/proxy-bid`, {
                maxAmount: value,
                currency: userCurrency,
            });
            toast.success("Proxy bid placed");
            haptics.bidPlaced();
            await fetchStatus();
            setMaxAmount("");
            onClose?.();
        } catch (err) {
            if (err?.response?.data?.errorCode === 'PAYMENT_METHOD_REQUIRED') {
                onPaymentRequired?.({ type: 'proxy-bid', amount: String(value) });
                // don't toast — parent will open the card modal
            } else {
                toast.error(err?.response?.data?.message || 'Failed');
            }
        } finally { setLoading(false); }
    };

    const handleUpdate = async () => {
        const value = parseFloat(newMax);
        if (!value || value < minBid) {
            toast.error(`Minimum is ${symbol}${minBid.toFixed(0)}`);
            return;
        }
        setUpdating(true);
        try {
            await axiosInstance.put(`/api/v1/auctions/${auction._id}/proxy-bid`, {
                maxAmount: value,
                currency: userCurrency,
            });
            toast.success("Proxy bid updated");
            await fetchStatus();
            onClose?.();
        } catch (err) {
            if (err?.response?.data?.errorCode === 'PAYMENT_METHOD_REQUIRED') {
                onPaymentRequired?.({ type: 'proxy-bid', amount: String(value) });
            } else {
                toast.error(err?.response?.data?.message || 'Failed to update proxy bid');
            }
        } finally { setUpdating(false); }
    };

    const handleCancel = async () => {
        setLoading(true);
        try {
            await axiosInstance.delete(`/api/v1/auctions/${auction._id}/proxy-bid`);
            toast.success("Proxy bid cancelled");
            setStatus(null);
            setNewMax("");
            onClose?.();
        } catch (err) {
            toast.error(err?.response?.data?.message || "Failed to cancel");
        } finally { setLoading(false); }
    };

    if (!user) return null;
    if (auction?.status !== "active") return null;
    if (auction?.auctionType === "buy_now" || auction?.auctionType === "giveaway") return null;

    return (
        <div className="px-3 py-2 rounded-lg">
            {status?.hasProxyBid && status.isActive ? (
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Your Maximum Bid:</span>
                        <span className="font-medium">{symbol}{status.convertedMaxAmount?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Status:</span>
                        <span className="font-medium text-green-600">Active</span>
                    </div>

                    <div className="pt-2 border-t border-gray-200">
                        <label className="text-xs text-gray-500">Update Maximum Bid</label>
                        <div className="flex gap-2 mt-1">
                            <input
                                type="number" step="any"
                                value={newMax}
                                onChange={(e) => setNewMax(e.target.value)}
                                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="New max"
                                min={minBid}
                            />
                            <button
                                onClick={handleUpdate}
                                disabled={updating}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                            >
                                {updating ? <Loader className="h-4 w-4 animate-spin" /> : "Update"}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Minimum {symbol}{minBid.toFixed(0)}</p>
                    </div>

                    <button
                        onClick={handleCancel}
                        disabled={loading}
                        className="mt-1 text-sm text-red-600 hover:text-red-700 flex items-center gap-1 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" /> Cancel Proxy Bid
                    </button>
                </div>
            ) : (
                <form onSubmit={handlePlace} className="space-y-3">
                    <div>
                        <label className="text-sm text-gray-600">
                            Enter your maximum bid ({symbol}{minBid.toFixed(0)} minimum)
                        </label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">{symbol}</span>
                            <input
                                type="number" step="any"
                                value={maxAmount}
                                onChange={(e) => setMaxAmount(e.target.value)}
                                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter max bid"
                                min={minBid}
                                required autoFocus
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? <Loader className="h-4 w-4 animate-spin mx-auto" /> : "Place Proxy Bid"}
                    </button>
                    <p className="text-xs text-gray-500">
                        💡 The system will automatically bid on your behalf up to your maximum. Amounts are shown in {userCurrency}.
                    </p>

                    {/* Information Text */}
                    <p className="text-xs text-gray-500">
                        Note: Your bid is legally binding and cannot be revoked. Don't bid unless you have the capacity to carry out the transaction. By placing a bid, you are in agreement with our{" "}
                        <a
                            href="/buyer-terms"
                            target="_blank"
                            className="text-blue-600 hover:text-blue-800 underline"
                        >
                            buyer's terms.
                        </a>
                    </p>
                </form>
            )}
        </div>
    );
};

export default ProxyBidSection;