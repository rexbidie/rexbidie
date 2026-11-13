import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
    Elements,
    CardElement,
    useStripe,
    useElements,
} from "@stripe/react-stripe-js";
import axiosInstance from "../../utils/axiosInstance";
import toast from "react-hot-toast";
import { Loader, CreditCard } from "lucide-react";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const PaymentForm = ({ payment, auctionId, onSuccess, onClose, confirmUrl }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);
    const [saveCard, setSaveCard] = useState(false);
    const [error, setError] = useState("");

    // Saved-card state
    const [savedCard, setSavedCard] = useState(null);
    const [loadingSavedCard, setLoadingSavedCard] = useState(true);
    const [useDifferentCard, setUseDifferentCard] = useState(false);

    const sym = payment.currency === "GBP" ? "£" : "€";

    // Fetch saved card from billing
    useEffect(() => {
        (async () => {
            try {
                const { data } = await axiosInstance.get("/api/v1/users/billing");
                if (data.success && data.data.hasCard && data.data.card) {
                    setSavedCard(data.data.card);
                }
            } catch (err) {
                console.error("Fetch saved card error:", err);
            } finally {
                setLoadingSavedCard(false);
            }
        })();
    }, []);

    const hasSavedCard = !!savedCard;
    const usingSavedCard = hasSavedCard && !useDifferentCard;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || processing) return;
        if (!usingSavedCard && !elements) return;

        setProcessing(true);
        setError("");

        const confirmParams = {};

        if (usingSavedCard) {
            confirmParams.payment_method = savedCard.id;
        } else {
            const cardElement = elements.getElement(CardElement);
            if (!cardElement) {
                setError("Card details missing");
                setProcessing(false);
                return;
            }
            confirmParams.payment_method = { card: cardElement };
            if (saveCard) confirmParams.setup_future_usage = "off_session";
        }

        const { error, paymentIntent } = await stripe.confirmCardPayment(
            payment.clientSecret,
            confirmParams
        );

        if (error) {
            setError(error.message);
            toast.error(error.message);
            setProcessing(false);
            return;
        }

        if (paymentIntent?.status === "succeeded") {
            try {
                await axiosInstance.post(confirmUrl || "/api/v1/payments/confirm-listing-extras", {
                    paymentIntentId: paymentIntent.id,
                    // Only signal "save" when a NEW card was entered and checked
                    saveCard: !usingSavedCard && saveCard,
                });
                toast.success(
                    usingSavedCard
                        ? "Payment successful using your saved card!"
                        : saveCard
                            ? "Payment successful! Card saved for future payments."
                            : (confirmUrl ? "Payment successful!" : "Payment successful! Your listing is pending approval.")
                );
                onSuccess?.(auctionId);
            } catch (err) {
                console.error(err);
                toast.error(
                    "Payment succeeded but confirmation failed. Please contact support."
                );
            }
        } else {
            toast.error(`Payment status: ${paymentIntent?.status || "unknown"}`);
        }
        setProcessing(false);
    };

    return (
        <form onSubmit={handleSubmit} className="p-6">
            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">Your paid extras</p>
                {payment.lineItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm py-1">
                        <span>{item.label}</span>
                        <span>{sym}{item.amount.toFixed(2)}</span>
                    </div>
                ))}
                <div className="flex justify-between font-bold pt-2 border-t border-gray-300 mt-2">
                    <span>Total</span>
                    <span className="text-primary">{sym}{payment.amount.toFixed(2)}</span>
                </div>
            </div>

            {/* Payment method area */}
            {loadingSavedCard ? (
                <div className="py-6 flex justify-center">
                    <Loader className="animate-spin text-gray-400" size={20} />
                </div>
            ) : usingSavedCard ? (
                // ── Saved card view ──
                <div className="border border-green-300 bg-green-50 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <CreditCard size={20} className="text-green-700 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-gray-800">
                                    Pay with saved card
                                </p>
                                <p className="text-sm text-gray-700">
                                    {savedCard.brand?.toUpperCase()} •••• {savedCard.last4}
                                    {savedCard.expMonth && savedCard.expYear && (
                                        <span className="text-gray-500">
                                            {" · "}Exp{" "}
                                            {String(savedCard.expMonth).padStart(2, "0")}/
                                            {String(savedCard.expYear).slice(-2)}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setUseDifferentCard(true)}
                            className="text-sm text-primary underline whitespace-nowrap"
                        >
                            Use a different card
                        </button>
                    </div>
                </div>
            ) : (
                // ── New-card entry view ──
                <>
                    <div className="border border-gray-300 rounded-lg p-3">
                        <CardElement options={{ hidePostalCode: true }} />
                    </div>

                    {hasSavedCard && (
                        <button
                            type="button"
                            onClick={() => setUseDifferentCard(false)}
                            className="mt-2 text-sm text-primary underline"
                        >
                            Use saved card instead
                        </button>
                    )}

                    <label className="flex items-start gap-2 mt-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={saveCard}
                            onChange={(e) => setSaveCard(e.target.checked)}
                            className="mt-1"
                        />
                        <span className="text-sm text-gray-700">
                            Save this card for future payments
                            <span className="block text-xs text-gray-500">
                                Used at checkout and future listing extras. You can change it
                                anytime in Billing.
                            </span>
                        </span>
                    </label>
                </>
            )}

            {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {error}
                </div>
            )}

            <div className="flex gap-3 mt-6">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={processing}
                    className="flex-1 py-2 border rounded-lg hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={
                        !stripe ||
                        processing ||
                        loadingSavedCard ||
                        (!usingSavedCard && !elements)
                    }
                    className="flex-1 py-2 bg-primary text-white rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {processing ? (
                        <>
                            <Loader className="animate-spin" size={16} />
                            Processing...
                        </>
                    ) : (
                        `Pay ${sym}${payment.amount.toFixed(2)}`
                    )}
                </button>
            </div>
        </form>
    );
};

// Also used for Featured / Meta Boost bought from the listing menu: pass
// title, intro and confirmUrl (POST /api/v1/auctions/:id/promote/confirm).
const ListingExtrasPaymentModal = ({ isOpen, onClose, payment, auctionId, onSuccess, title, intro, confirmUrl }) => {
    if (!isOpen || !payment) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b">
                    <h2 className="text-xl font-semibold">{title || "Complete your listing payment"}</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        {intro || "Your listing is saved but not submitted. Complete payment to submit it for review."}
                    </p>
                </div>
                <Elements stripe={stripePromise}>
                    <PaymentForm
                        payment={payment}
                        auctionId={auctionId}
                        onSuccess={onSuccess}
                        onClose={onClose}
                        confirmUrl={confirmUrl}
                    />
                </Elements>
            </div>
        </div>
    );
};

export default ListingExtrasPaymentModal;