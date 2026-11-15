import { forwardRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axiosInstance from "../utils/axiosInstance";
import { useAuth } from "../contexts/AuthContext";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

const BidConfirmationModal = forwardRef((props, ref) => {
    const { isOpen, onClose, onConfirm, auction, bidAmount, needsTerms = false, confirming = false } = props;
    // First bid of the night: the bidder ticks the Buyer Terms box once.
    const [agreed, setAgreed] = useState(false);
    useEffect(() => { if (isOpen) setAgreed(false); }, [isOpen]);

    const [serviceFee, setServiceFee] = useState(0);
    const [isCommissionEnabled, setIsCommissionEnabled] = useState(false);
    const [isCapped, setIsCapped] = useState(false);
    const [capDisplay, setCapDisplay] = useState("");

    const { user } = useAuth();
    const userCurrency = user?.currency || "EUR";
    useBodyScrollLock(isOpen);

    useEffect(() => {
        if (!isOpen) return;

        const getCommission = async () => {
            try {
                const { data } = await axiosInstance.get("/api/v1/commissions");
                const commission = data?.data?.commission;
                if (!commission) return;

                const tiers = commission.bidderTiers || [];
                const appliesToBidder = commission.appliesTo?.includes("bidder");
                setIsCommissionEnabled(
                    !!commission.isEnabled && appliesToBidder && tiers.length > 0
                );

                // Progressive tier calculation
                const amount = Number(bidAmount) || 0;
                let fee = 0;
                if (commission.isEnabled && appliesToBidder) {
                    for (const tier of tiers) {
                        const from = Number(tier.from) || 0;
                        const to =
                            tier.to === null || tier.to === undefined
                                ? Infinity
                                : Number(tier.to);
                        if (amount <= from) break;
                        const slice = Math.min(amount, to) - from;
                        fee += slice * (Number(tier.value) / 100);
                    }
                }

                // Cap (optional)
                const capAmount = commission.maxCommissionAmount;
                const capCurrency = commission.maxCommissionCurrency ?? "EUR";
                let capped = false;
                let capInUserCurrency = 0;

                if (capAmount && capAmount > 0) {
                    capInUserCurrency = capAmount;
                    const symbol =
                        capCurrency === "GBP" ? "£" : capCurrency === "EUR" ? "€" : "";
                    setCapDisplay(`${symbol}${capAmount}`);

                    if (capCurrency !== userCurrency) {
                        const ratesRes = await axiosInstance.get("/api/v1/currency/rates");
                        const rates = ratesRes.data || {};
                        const rate = rates[capCurrency]?.rates?.[userCurrency];
                        if (rate) capInUserCurrency = capAmount * rate;
                    }

                    if (fee > capInUserCurrency) {
                        fee = capInUserCurrency;
                        capped = true;
                    }
                } else {
                    setCapDisplay("");
                }

                setIsCapped(capped);
                setServiceFee(fee);
            } catch (error) {
                console.error("Error fetching commission:", error);
            }
        };

        getCommission();
    }, [bidAmount, isOpen, userCurrency]);

    if (!isOpen) return null;

    const formatCurrency = (amount) => {
        if (!amount && amount !== 0) {
            return `${userCurrency === "GBP" ? "£" : "€"}0`;
        }
        return `${userCurrency === "GBP" ? "£" : "€"}${Number(amount).toLocaleString(
            "en-IE"
        )}`;
    };

    const total =
        isCommissionEnabled ? Number(bidAmount) + Number(serviceFee) : Number(bidAmount);

    return createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex justify-between items-center py-3 px-6 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Confirm your bid
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl font-light"
                    >
                        ×
                    </button>
                </div>

                {/* Vehicle Info */}
                <div className="py-3 px-6 border-b border-gray-200">
                    <strong className="text-gray-900">
                        {auction?.auctionType === "standard" ? "No Reserve" : "Reserve"}:{" "}
                        {auction?.title || "2016 Land Rover LR4 HSE"}
                    </strong>
                </div>

                {/* Bid Details */}
                <div className="py-2 px-6 md:px-6 border-b border-gray-200">
                    <table className="w-full">
                        <tbody>
                            <tr>
                                <td className="text-gray-600">Bid Amount:</td>
                                <td className="text-right text-gray-900">
                                    {formatCurrency(bidAmount)}
                                </td>
                            </tr>
                            {isCommissionEnabled && (
                                <tr>
                                    <td className="py-2 text-gray-600">
                                        Commission Fee:
                                        {isCapped && capDisplay && (
                                            <span className="ml-2 text-xs text-gray-400">
                                                (capped at {capDisplay})
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 text-right text-gray-900">
                                        {formatCurrency(serviceFee)}
                                    </td>
                                </tr>
                            )}
                            <tr className="border-t border-gray-200">
                                <td className="py-3 font-semibold text-gray-900">Total:</td>
                                <td className="py-3 text-right font-semibold text-gray-900">
                                    {formatCurrency(total)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    {/* {isCommissionEnabled && (
                        <p className="text-xs text-gray-500 text-center">
                            Note: A buyer's commission will be applied on the winning bid amount.
                        </p>
                    )} */}
                </div>

                {/* Information Text */}
                <div className="py-3 px-6 border-b border-gray-200 space-y-4">
                    <p className="text-sm text-gray-600">
                        Note: Your bid is legally binding and cannot be revoked. Don't bid unless you have the capacity to carry out the transaction. By placing a bid, you are in agreement with our{" "}
                        <a
                            href="/buyer-terms"
                            target="_blank"
                            className="text-blue-600 hover:text-blue-800 underline"
                        >
                            buyer's terms.
                        </a>
                    </p>
                    {needsTerms && (
                        <label className="flex items-start gap-3 rounded-md border border-gray-300 bg-gray-50 p-3 text-sm text-gray-800 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                                className="mt-0.5 h-5 w-5 flex-shrink-0 accent-black"
                            />
                            <span>
                                I agree to the{" "}
                                <a href="/buyer-terms" target="_blank" className="text-blue-600 underline">Buyer Terms</a>{" "}
                                and understand my bids are binding. You won't be asked again tonight: after this, each bid is placed with one tap.
                            </span>
                        </label>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="py-3 px-6 md:p-6 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 px-4 md:py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                    >
                        Cancel
                    </button>

                    <button
                        ref={ref}
                        onClick={onConfirm}
                        type="submit"
                        disabled={(needsTerms && !agreed) || confirming}
                        className="flex-1 py-2 px-4 md:py-3 bg-black text-white rounded-md hover:bg-gray-900 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {confirming ? "Placing bid..." : "Place Bid"}
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
});

export default BidConfirmationModal;