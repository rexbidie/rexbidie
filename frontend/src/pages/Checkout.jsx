import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
    Container,
    Header,
    LoadingSpinner,
    AccountInactiveBanner
} from "../components";
import {
    Package,
    Truck,
    CreditCard,
    Banknote,
    CheckCircle,
    XCircle,
    Loader,
    ArrowLeft,
    MapPin,
    User,
    Mail,
    Phone,
    Home,
    Building,
    Calendar,
    Award,
    Info,
    AlertCircle,
    Copy,
    Check,
    Shield,
    Globe,
    Clock
} from "lucide-react";
import axiosInstance from "../utils/axiosInstance.js";
import { useAuth } from "../contexts/AuthContext.jsx";
import toast from "react-hot-toast";

// Bank Transfer Details Component
const BankTransferDetails = ({ bankDetails, onCopy }) => {
    const [copiedField, setCopiedField] = useState(null);

    const handleCopy = (text, field) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        onCopy?.(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    if (!bankDetails) return null;

    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
            <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Banknote size={20} className="text-blue-600" />
                Bank Transfer Details
            </h4>

            <div className="space-y-4">
                {bankDetails.accountHolderName && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                            <p className="text-xs text-gray-500">Account Holder</p>
                            <p className="font-medium">{bankDetails.accountHolderName}</p>
                        </div>
                        <button
                            onClick={() => handleCopy(bankDetails.accountHolderName, 'holder')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {copiedField === 'holder' ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-gray-500" />}
                        </button>
                    </div>
                )}

                {bankDetails.bankName && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                            <p className="text-xs text-gray-500">Bank Name</p>
                            <p className="font-medium">{bankDetails.bankName}</p>
                        </div>
                        <button
                            onClick={() => handleCopy(bankDetails.bankName, 'bank')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {copiedField === 'bank' ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-gray-500" />}
                        </button>
                    </div>
                )}

                {bankDetails.accountNumber && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                            <p className="text-xs text-gray-500">Account Number</p>
                            <p className="font-medium font-mono">{bankDetails.accountNumber}</p>
                        </div>
                        <button
                            onClick={() => handleCopy(bankDetails.accountNumber, 'account')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {copiedField === 'account' ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-gray-500" />}
                        </button>
                    </div>
                )}

                {bankDetails.routingNumber && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                            <p className="text-xs text-gray-500">Routing Number</p>
                            <p className="font-medium font-mono">{bankDetails.routingNumber}</p>
                        </div>
                        <button
                            onClick={() => handleCopy(bankDetails.routingNumber, 'routing')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {copiedField === 'routing' ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-gray-500" />}
                        </button>
                    </div>
                )}

                {bankDetails.iban && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                            <p className="text-xs text-gray-500">IBAN</p>
                            <p className="font-medium font-mono">{bankDetails.iban}</p>
                        </div>
                        <button
                            onClick={() => handleCopy(bankDetails.iban, 'iban')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {copiedField === 'iban' ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-gray-500" />}
                        </button>
                    </div>
                )}

                {bankDetails.swiftCode && (
                    <div className="flex items-center justify-between bg-white p-3 rounded-lg">
                        <div>
                            <p className="text-xs text-gray-500">SWIFT/BIC Code</p>
                            <p className="font-medium font-mono">{bankDetails.swiftCode}</p>
                        </div>
                        <button
                            onClick={() => handleCopy(bankDetails.swiftCode, 'swift')}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            {copiedField === 'swift' ? <Check size={16} className="text-green-600" /> : <Copy size={16} className="text-gray-500" />}
                        </button>
                    </div>
                )}

                {bankDetails.bankAddress && (
                    <div className="bg-white p-3 rounded-lg">
                        <p className="text-xs text-gray-500">Bank Address</p>
                        <p className="font-medium text-sm">{bankDetails.bankAddress}</p>
                    </div>
                )}

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                    <p className="text-xs text-yellow-800 flex items-start gap-2">
                        <Info size={16} className="flex-shrink-0 mt-0.5" />
                        <span>
                            Funds may take 1-3 business days to clear.
                        </span>
                    </p>
                </div>
            </div>
        </div>
    );
};

// Main Checkout Component
const CheckoutContent = () => {
    const { auctionId } = useParams();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const [manualPaymentBlocked, setManualPaymentBlocked] = useState(null);

    const [loading, setLoading] = useState(true);
    const [verifying, setVerifying] = useState(true);
    const [auction, setAuction] = useState(null);
    const [seller, setSeller] = useState(null);
    const [bidderAddress, setBidderAddress] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('stripe'); // 'stripe' or 'bank'
    const [processing, setProcessing] = useState(false);
    const [clientSecret, setClientSecret] = useState(null);
    const [bankDetails, setBankDetails] = useState(null);
    const [copiedField, setCopiedField] = useState(null);
    const [error, setError] = useState(null);

    const [paymentCompleted, setPaymentCompleted] = useState(false);
    const [purchasingLabel, setPurchasingLabel] = useState(false);
    const [trackingInfo, setTrackingInfo] = useState(null);

    // Payment method states
    const [hasSavedCard, setHasSavedCard] = useState(false);
    const [savedCard, setSavedCard] = useState(null);
    const [useSavedCard, setUseSavedCard] = useState(true);
    const [useNewCard, setUseNewCard] = useState(false);
    const [saveCardForFuture, setSaveCardForFuture] = useState(false);
    const [paymentIntentId, setPaymentIntentId] = useState(null);

    const [showBankDetailsModal, setShowBankDetailsModal] = useState(false);
    const [bankDetailsData, setBankDetailsData] = useState(null);

    const [commission, setCommission] = useState({
        commissionType: 'percentage',
        commissionValue: 5
    });

    const [isCommissionEnabled, setIsCommissionEnabled] = useState(true);
    const [commissionAppliesTo, setCommissionAppliesTo] = useState(['seller']);

    const userCurrency = currentUser?.currency || 'EUR';

    // Fetch commission settings
    const fetchCommission = async () => {
        try {
            setLoading(true);
            const { data } = await axiosInstance.get('/api/v1/commissions');
            if (data.success) {
                setCommission(data.data.commission);
                setIsCommissionEnabled(data.data.commission.isEnabled);
                setCommissionAppliesTo(data.data.commission.appliesTo);
            }
        } catch (err) {
            console.error('Fetch commission error:', err);
            toast.error(err.response?.data?.message || "Failed to fetch commission settings");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCommission();
    }, []);

    // Verify access and fetch auction data
    useEffect(() => {
        const verifyAndFetch = async () => {
            try {
                setVerifying(true);
                setLoading(true);

                const { data } = await axiosInstance.get(`/api/v1/checkout/${auctionId}?currency=${userCurrency}`);

                if (data.success) {
                    setAuction(data.data.auction);
                    setSeller(data.data.seller);
                    setBidderAddress(data.data.bidderAddress);

                    // ✅ Use admin bank details instead of seller's
                    if (data.data.adminBankDetails) {
                        setBankDetails({
                            ...data.data.adminBankDetails,
                            auctionId: auctionId
                        });
                    }

                    // Set saved card information
                    if (data.data.paymentInfo) {
                        setHasSavedCard(data.data.paymentInfo.hasSavedCard);
                        if (data.data.paymentInfo.savedCard) {
                            setSavedCard(data.data.paymentInfo.savedCard);
                            setUseSavedCard(true);
                            setUseNewCard(false);
                        } else {
                            setUseSavedCard(false);
                            setUseNewCard(true);
                        }
                    }
                }
            } catch (error) {
                console.error("Checkout verification error:", error);

                const errCode = error.response?.data?.errorCode;

                if (errCode === "MANUAL_PAYMENT_REQUIRED") {
                    setManualPaymentBlocked({
                        message:
                            error.response?.data?.message ||
                            "This item requires manual payment arrangement. Our admin team will be in touch shortly with your invoice and payment link.",
                        finalPriceInEUR: error.response?.data?.data?.finalPriceInEUR,
                    });
                    return; // don't set error, don't navigate — dedicated card will render
                }

                if (error.response?.status === 403) {
                    toast.error("You are not authorized to access this checkout");
                    navigate('/bidder/auctions/won');
                } else {
                    setError(error.response?.data?.message || "Failed to load checkout");
                }
            } finally {
                setVerifying(false);
                setLoading(false);
            }
        };

        if (auctionId) {
            verifyAndFetch();
        }
    }, [auctionId, navigate]);

    // Determine which payment methods to show based on seller's preference
    const getAvailablePaymentMethods = () => {
        if (!auction) return [];

        const preference = auction.paymentCollectionPreference || 'buyer_decides';

        const methods = [];
        if (preference === 'buyer_decides') {
            methods.push('stripe', 'bank');
        } else if (preference === 'credit_card') {
            methods.push('stripe');
        } else if (preference === 'bank_transfer') {
            methods.push('bank');
        }

        return methods;
    };

    const availableMethods = getAvailablePaymentMethods();
    const showBothMethods = availableMethods.length === 2;
    const showStripe = availableMethods.includes('stripe');
    const showBank = availableMethods.includes('bank');

    // Set default payment method based on available options
    useEffect(() => {
        if (availableMethods.length > 0) {
            // If only one method available, set it as default
            if (availableMethods.length === 1) {
                setPaymentMethod(availableMethods[0]);
            } else {
                // If both available, default to stripe
                setPaymentMethod('stripe');
            }
        }
    }, [auction]);

    const handleOneClickPayment = async () => {
        const loadingToast = toast.loading('Processing your payment...');

        try {
            const response = await axiosInstance.post(`/api/v1/payments/create-checkout-payment?currency=${userCurrency}`, {
                auctionId: auction._id
            });

            if (response.data.success) {
                toast.dismiss(loadingToast);
                toast.success("Payment successful!");

                // Redirect after success
                setTimeout(() => navigate('/bidder/auctions/won'), 3000);
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error(error.response?.data?.message || "Payment failed");
        }
    };

    const handleBankTransfer = async () => {
        const loadingToast = toast.loading('Recording your transaction...');

        try {
            const response = await axiosInstance.post(`/api/v1/payments/create-bank-transfer-payment?currency=${userCurrency}`, {
                auctionId: auction._id
            });

            if (response.data.success) {
                toast.dismiss(loadingToast);
                toast.success("Manual payment initiated! Please transfer the amount to the seller.");

                // ✅ Set the bank details and show modal
                if (response.data.data.bankDetails) {
                    setBankDetailsData(response.data.data.bankDetails);
                    setShowBankDetailsModal(true);
                }

                // Redirect after user closes modal or timeout
                setTimeout(() => {
                    if (!showBankDetailsModal) {
                        navigate('/bidder/auctions/won');
                    }
                }, 1000);
            }
        } catch (error) {
            toast.dismiss(loadingToast);
            toast.error(error.response?.data?.message || "Failed to process bank transfer selection");
        }
    };

    // Calculate total
    // `auction.commissionAmount` is the bidder's commission (0 if bidder doesn't pay)
    const calculateTotal = () => {
        if (!auction) return 0;
        // The server works out the total, including VAT where it applies.
        if (auction.totalAmount != null) return auction.totalAmount;
        const winningBid = auction.finalPrice || auction.currentPrice || 0;
        const commission = auction.commissionAmount || 0;
        return winningBid + commission + (auction.vatAmount || 0);
    };

    // Format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency: `${userCurrency}`,
            minimumFractionDigits: 0
        }).format(amount);
    };

    // Format address
    const formatAddress = (address) => {
        if (!address) return 'Address not provided';
        const parts = [
            address.buildingNameNo,
            address.street1,
            address.city,
            address.state,
            address.zip,
            address.country
        ].filter(Boolean);
        return parts.join(', ');
    };

    if (verifying || loading) {
        return (
            <section className="flex min-h-screen">
                <div className="w-full relative">
                    <Header />
                    <Container className={`pt-16 md:pt-32 pb-16`}>
                        <div className="flex justify-center items-center min-h-96">
                            <LoadingSpinner />
                        </div>
                    </Container>
                </div>
            </section>
        );
    }

    if (manualPaymentBlocked) {
        return (
            <section className="flex min-h-screen">
                <div className="w-full relative">
                    <Header />
                    <Container className={`pt-16 md:pt-32 pb-16`}>
                        <AccountInactiveBanner />

                        <div className="max-w-2xl mx-auto mt-8">
                            <button
                                onClick={() => navigate('/bidder/auctions/won')}
                                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
                            >
                                <ArrowLeft size={20} />
                                <span>Back to Won Auctions</span>
                            </button>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
                                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CreditCard size={32} className="text-amber-600" />
                                </div>

                                <h2 className="text-2xl font-bold text-amber-900 mb-2">
                                    Manual Payment Required
                                </h2>

                                <p className="text-amber-800 mb-4">
                                    {manualPaymentBlocked.message}
                                </p>

                                {manualPaymentBlocked.finalPriceInEUR != null && (
                                    <p className="text-sm text-amber-700">
                                        Winning amount:{" "}
                                        <strong>
                                            €{Number(manualPaymentBlocked.finalPriceInEUR).toLocaleString()}
                                        </strong>
                                    </p>
                                )}

                                <button
                                    onClick={() => navigate('/bidder/auctions/won')}
                                    className="mt-6 bg-amber-600 text-white hover:bg-amber-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                                >
                                    Back to Won Auctions
                                </button>
                            </div>
                        </div>
                    </Container>
                </div>
            </section>
        );
    }

    if (error || !auction) {
        return (
            <section className="flex min-h-screen">
                <div className="w-full relative">
                    <Header />
                    <Container className={`pt-16 md:pt-32 pb-16`}>
                        <AccountInactiveBanner />
                        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                            <XCircle size={48} className="mx-auto text-red-500 mb-3" />
                            <p className="text-red-600 text-lg font-medium">{error || "Checkout not available"}</p>
                            <button
                                onClick={() => navigate('/bidder/auctions/won')}
                                className="mt-4 bg-primary text-white hover:bg-primary/90 px-6 py-2 rounded-lg"
                            >
                                Back to Won Auctions
                            </button>
                        </div>
                    </Container>
                </div>
            </section>
        );
    }

    return (
        <section className="flex min-h-screen ">

            <div className="w-full relative">
                <Header />

                <Container className={`pt-16 md:pt-32 pb-16`}>
                    <AccountInactiveBanner />

                    {/* Header */}
                    <div className="max-w-full pt-16 pb-7 md:pt-0">
                        <button
                            onClick={() => navigate('/bidder/auctions/won')}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
                        >
                            <ArrowLeft size={20} />
                            <span>Back to Won Auctions</span>
                        </button>

                        <div className="flex items-center gap-3 mb-2">
                            <CreditCard className="text-primary" size={32} />
                            <h2 className="text-3xl md:text-4xl font-bold">Checkout</h2>
                        </div>
                        <p className="text-gray-600">Complete your purchase for "{auction.title}"</p>
                    </div>

                    {/* Main Content */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column - 2 columns */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Payment Method Selection */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <CreditCard size={20} className="text-blue-600" />
                                    Payment Method
                                </h3>

                                <div className="space-y-4">
                                    {/* Show Stripe option only if available */}
                                    {showStripe && hasSavedCard && (
                                        <label className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${paymentMethod === 'stripe' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                                            }`}>
                                            <input
                                                type="radio"
                                                name="paymentMethod"
                                                value="stripe"
                                                checked={paymentMethod === 'stripe'}
                                                onChange={() => setPaymentMethod('stripe')}
                                                className="w-4 h-4 text-blue-600"
                                                disabled={!showBothMethods}
                                            />
                                            <div className="ml-3 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <CreditCard size={18} />
                                                    <span className="font-medium">Saved Card</span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    {savedCard?.brand} •••• {savedCard?.last4}
                                                    {savedCard?.expiryMonth && savedCard?.expiryYear && (
                                                        <span className="ml-2 text-gray-500">
                                                            Expires {savedCard.expiryMonth}/{savedCard.expiryYear}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <Shield size={20} className="text-green-600" />
                                        </label>
                                    )}

                                    {/* Show Bank Transfer option only if available */}
                                    {/* {showBank && (
                                        <label className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${paymentMethod === 'bank' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                                            }`}>
                                            <input
                                                type="radio"
                                                name="paymentMethod"
                                                value="bank"
                                                checked={paymentMethod === 'bank'}
                                                onChange={() => setPaymentMethod('bank')}
                                                className="w-4 h-4 text-blue-600"
                                                disabled={!showBothMethods}
                                            />
                                            <div className="ml-3 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Banknote size={18} />
                                                    <span className="font-medium">Handle Payment Yourself</span>
                                                </div>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    Pay in cash to seller or transfer directly to their bank account.
                                                </p>
                                            </div>
                                            <Globe size={20} className="text-blue-600" />
                                        </label>
                                    )} */}

                                    {/* Show message if no payment methods available */}
                                    {availableMethods.length === 0 && (
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                            <p className="text-sm text-yellow-800">
                                                No payment methods available for this auction.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Order Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
                                <h3 className="text-lg font-semibold mb-4">Order Summary</h3>

                                <div className="space-y-4">
                                    {/* Auction Details */}
                                    <div className="border-b border-gray-200 pb-4">
                                        <p className="font-medium text-gray-900">{auction.title}</p>
                                        <p className="text-sm text-gray-600 mt-1">Sold by: {seller?.displayName || seller?.companyName || seller?.firstName}</p>
                                    </div>

                                    {/* Price Breakdown */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Winning Bid</span>
                                            <span className="font-medium">{formatCurrency(auction.finalPrice || 0)}</span>
                                        </div>

                                        {auction.vatAmount > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">VAT ({auction.vatRate}%)</span>
                                                <span className="font-medium">{formatCurrency(auction.vatAmount)}</span>
                                            </div>
                                        )}

                                        {auction.commissionAmount > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Commission Fee</span>
                                                <span className="font-medium">{formatCurrency(auction.commissionAmount)}</span>
                                            </div>
                                        )}

                                        <div className="border-t border-gray-200 pt-2 mt-2">
                                            <div className="flex justify-between font-bold text-lg">
                                                <span>Total</span>
                                                <span className="text-primary">{formatCurrency(calculateTotal())}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Button - Single button that handles both payment methods */}
                                    <button
                                        onClick={() => {
                                            if (paymentMethod === 'stripe') {
                                                handleOneClickPayment();
                                            } else if (paymentMethod === 'bank') {
                                                handleBankTransfer();
                                            }
                                        }}
                                        disabled={processing || (paymentMethod === 'stripe' && auction.vatReviewRequired)}
                                        className="w-full bg-primary text-white hover:bg-primary/90 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {processing ? (
                                            <>
                                                <Loader size={18} className="animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                {paymentMethod === 'stripe' ? <CreditCard size={18} /> : <Banknote size={18} />}
                                                {paymentMethod === 'stripe' ? `Pay ${formatCurrency(calculateTotal())}` : 'Confirm Manual Payment'}
                                            </>
                                        )}
                                    </button>

                                    {/* VAT Note */}
                                    {auction?.vatReviewRequired && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 text-sm text-amber-900">
                                            We need to confirm the VAT on this purchase before you can pay. We&rsquo;ll email you a payment request shortly.
                                        </div>
                                    )}
                                    {auction?.vatIncluded && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                                            <p className="text-sm text-gray-500 flex items-start gap-2">
                                                <Info size={16} className="flex-shrink-0 mt-0.5" />
                                                <span>{auction.vatAmount > 0 ? "VAT is included in the total above." : auction.vatTreatment === "zero_rated" ? "VAT is zero-rated on this purchase." : "VAT is applicable on this purchase."}</span>
                                            </p>
                                        </div>
                                    )}

                                    {/* Payment Info */}
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                        <p className="text-xs text-yellow-800 flex items-start gap-2">
                                            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                            {paymentMethod == 'bank' ? <span>By selecting this method, you agree to pay seller with cash or bank transfer manually.</span> : <span>
                                                By selecting this method, you agree to pay with your saved card.
                                            </span>}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Container>
            </div>
        </section>
    );
};

export default CheckoutContent;