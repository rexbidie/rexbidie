import { CalendarDays, CheckSquare, Clock, Download, File, Fuel, Gauge, Gavel, Heart, Loader, MapPin, MessageCircle, PaintBucket, Plane, ShieldCheck, Tag, User, Users, Weight, Zap, Banknote, MessageSquare, Mail, Phone, Star, CreditCard, Info, Bell, Truck, Stars, Share2 } from "lucide-react";
import { AuthBidModal, BidConfirmationModal, BuyNowModal, Container, GiveawayClaimModal, LoadingSpinner, MobileBidBottomBar, MobileBidStickyBar, ProxyBidSection, RatingStars, ReminderModal, ReviewModal, SellerStatsCard, SpecificationsSection, TabSection, TimerDisplay, WatchlistButton } from "../components";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { lazy, Suspense, useRef, useState, useEffect } from "react";
import useAuctionCountdown from "../hooks/useAuctionCountDown";
import axiosInstance from "../utils/axiosInstance";
import { toast } from "react-hot-toast";
import { useComments } from "../hooks/useComments";
import { useWatchlist } from "../hooks/useWatchlist";
import { useAuth } from "../contexts/AuthContext";
import PilotPhaseModal from "../components/PilotPhaseModal";
import PaymentMethodModal from "../components/PaymentMethodModal";
import { socket } from "../utils/socket";
import { convertAuctionPrices } from "../utils/convertAuctionPrices.js";
import { useSeo, buildAuctionSeo } from "../utils/seo";
import { buyerFeeShort } from "../utils/fees";
import { trackMeta } from "../utils/metaPixel";
import PostAuctionBinPanel from "../components/buyItNow/PostAuctionBinPanel";
import LiveBuyNowPanel from "../components/buyItNow/LiveBuyNowPanel";
import { isNativeApp } from "../native/platform";
import * as haptics from "../native/haptics";
import { shareLink } from "../native/share";

const YouTubeEmbed = lazy(() => import('../components/YouTubeEmbed'));
const ImageLightBox = lazy(() => import('../components/ImageLightBox'));
const MakeOfferModal = lazy(() => import('../components/MakeOfferModal'));

function SingleAuction() {
    const { id } = useParams();
    const [auction, setAuction] = useState(null);
    const [loading, setLoading] = useState(true);
    const [bidding, setBidding] = useState(false);
    const [buying, setBuying] = useState(false);
    const [makingOffer, setMakingOffer] = useState(false);
    const [bidAmount, setBidAmount] = useState('');
    const [offerAmount, setOfferAmount] = useState('');
    const [offerMessage, setOfferMessage] = useState('');
    const [isMakeOfferModalOpen, setIsMakeOfferModalOpen] = useState(false);
    const bidSectionRef = useRef(null);
    const commentSectionRef = useRef(null);
    const offerSectionRef = useRef(null);
    const auctionTime = useAuctionCountdown(auction);
    const countdown = useAuctionCountdown(auction);
    const [activeTab, setActiveTab] = useState('description');
    const { pagination } = useComments(id);
    const { isWatchlisted, toggleWatchlist, watchlistCount } = useWatchlist(id, auction);
    const hasFetchedRef = useRef(false);
    const [isBidModalOpen, setIsBidModalOpen] = useState(false);
    const formRef = useRef();
    const { user } = useAuth();
    // Only a genuine 404 marks the page noindex; a temporary API error must not.
    const [notFound, setNotFound] = useState(false);
    useSeo(buildAuctionSeo(auction, { notFound }));
    const navigate = useNavigate();
    const [showBuyNowModal, setShowBuyNowModal] = useState(false);
    const [showGiveawayModal, setShowGiveawayModal] = useState(false);
    const [claiming, setClaiming] = useState(false);
    const [isClaimingGiveaway, setIsClaimingGiveaway] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [userReview, setUserReview] = useState(null);
    const [revieweeId, setRevieweeId] = useState(null);
    const [auctionReviews, setAuctionReviews] = useState([]);
    const makingOfferRef = useRef(false);
    const viewedListingRef = useRef(null);   // ← add this
    // Pilot phase
    const [isPilotModalOpen, setIsPilotModalOpen] = useState(false);
    const timeRemaining = auction?.endDate ? new Date(auction.endDate) - new Date() : 0;

    const userCurrency = user?.currency || 'EUR';
    const [showReminderModal, setShowReminderModal] = useState(false);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // { type: 'bid' | 'offer' }

    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [pendingBidAmount, setPendingBidAmount] = useState('');
    const [pendingProxyAmount, setPendingProxyAmount] = useState('');

    const [showProxyBidModal, setShowProxyBidModal] = useState(false);
    const prevStatusRef = useRef(null);

    const updateAuctionState = (updatedAuction) => {
        setAuction(updatedAuction);
    };

    // const handleOpenBidModal = () => {
    //     setIsBidModalOpen(true);
    //     // setIsPilotModalOpen(true);
    // };

    const handleOpenBidModal = () => {
        const bidValue = parseFloat(bidAmount);
        const symbol = userCurrency === 'GBP' ? '£' : '€';

        if (!bidAmount || isNaN(bidValue) || bidValue < minBidAmount) {
            toast.error(`Minimum bid is ${symbol}${minBidAmount.toFixed(0)}`);
            return;
        }
        if (user && user._id?.toString() === auction?.seller?._id?.toString()) {
            toast.error(`You can't bid on your own auction.`);
            return;
        }

        gtag('event', 'bid_intent', {
            listing_id: auction._id,
            item_name: auction.title,
            category: auction.categories?.[1] || auction.categories?.[0] || '',
            bid_amount: bidValue,
            currency: userCurrency,
            auction_type: auction.auctionType,
            bid_number: (auction.bidCount || 0) + 1,
        });

        // Gate on auth
        if (!user) {
            setPendingAction({ type: 'bid', amount: bidAmount });
            setIsAuthModalOpen(true);
            return;
        }

        setIsBidModalOpen(true);
    };

    const handleAuthSuccess = (authedUser) => {
        setIsAuthModalOpen(false);

        // Payment already on file → straight to confirmation
        if (authedUser?.isPaymentVerified || pendingAction?.type === 'giveaway') {
            resumePendingAction();
            return;
        }

        // Need card first → payment modal, pendingAction stays intact
        setIsPaymentModalOpen(true);
    };

    const handleOpenProxyBidModal = () => {
        setPendingProxyAmount('');
        if (!user) {
            setPendingAction({ type: 'proxy-bid' });
            setIsAuthModalOpen(true);
            return;
        }
        if (user._id?.toString() === auction?.seller?._id?.toString()) {
            toast.error(`You can't proxy bid on your own auction.`);
            return;
        }
        setShowProxyBidModal(true);
    };

    const handleProxyPaymentRequired = ({ amount }) => {
        setPendingProxyAmount(amount);
        setShowProxyBidModal(false);
        setPendingAction({ type: 'proxy-bid' });
        setIsPaymentModalOpen(true);
    };

    const handleConfirmBid = (e) => {
        handleBid(e);
        setIsBidModalOpen(false);
    };

    const handleCloseBidModal = () => {
        setIsBidModalOpen(false);
    };

    const handlePilotModalClose = () => {
        setIsPilotModalOpen(false);
        navigate('/');
    };

    const handleOpenMakeOfferModal = () => {
        setIsMakeOfferModalOpen(true);
        // setIsPilotModalOpen(true);
    };

    const handleCloseMakeOfferModal = () => {
        setIsMakeOfferModalOpen(false);
        setOfferAmount('');
        setOfferMessage('');
    };

    const handleClosePaymentModal = () => {
        setIsPaymentModalOpen(false);
        setPendingAction(null);
    };

    // Reopens the correct confirmation modal with the saved amount
    const resumePendingAction = () => {
        if (!pendingAction) return;

        if (pendingAction.type === 'offer') {
            setOfferAmount(pendingAction.amount);
            setOfferMessage(pendingAction.message || '');
            setIsMakeOfferModalOpen(true);
        } else if (pendingAction.type === 'buynow') {
            setShowBuyNowModal(true);
        } else if (pendingAction.type === 'proxy-bid') {
            setShowProxyBidModal(true);
        } else if (pendingAction.type === 'giveaway') {
            setShowGiveawayModal(true);
        } else {
            // bid
            setBidAmount(pendingAction.amount);
            setIsBidModalOpen(true);
        }

        setPendingAction(null);
    };

    // Called when the card is successfully added inside the modal
    const handleCardAdded = () => {
        setIsPaymentModalOpen(false);

        if (auction?._id) {
            gtag('event', 'bidder_verification_complete', {
                listing_id: auction._id,
                item_name: auction.title,
                category: auction.categories?.[1] || auction.categories?.[0] || '',
                user_type: user?.userType || 'bidder',
                verification_type: 'card_link',
                action: pendingAction?.type || 'bid',
            });
        }

        resumePendingAction();
    };

    const handleSetReminder = () => {
        if (user) {
            // Logged in → same behaviour as the heart/watchlist button
            toggleWatchlist();
        } else {
            // Anonymous visitor → open the reminder modal
            setShowReminderModal(true);
        }
    };

    const userBidStatus = (() => {
        if (!user || !auction) return null;
        if (auction.seller?._id?.toString() === user._id?.toString()) return null;
        if (auction.status !== "active") return null;
        if (countdown.status !== "counting-down" && countdown.status !== "always-available") return null;

        const uid = user._id?.toString();
        const hasBid = (auction.bids || []).some(
            (b) => (b.bidder?._id ?? b.bidder)?.toString() === uid
        );
        const userProxy = (auction.proxyBids || []).find(
            (pb) => (pb.bidder?._id ?? pb.bidder)?.toString() === uid && pb.isActive
        );
        if (!hasBid && !userProxy) return null;

        const currentBidderId =
            auction.currentBidder?._id?.toString() ?? auction.currentBidder?.toString();
        if (currentBidderId === uid) return "highest";
        return "outbid";
    })();

    // App: buzz and tell the bidder straight away when someone outbids them.
    const prevBidStatus = useRef(null);
    useEffect(() => {
        if (isNativeApp && prevBidStatus.current === "highest" && userBidStatus === "outbid") {
            haptics.outbid();
            toast.error("You've been outbid", { icon: "⚠️", duration: 4000 });
        }
        prevBidStatus.current = userBidStatus;
    }, [userBidStatus]);

    useEffect(() => {
        const fetchAuction = async () => {
            try {
                setLoading(true);
                const { data } = await axiosInstance.get(`/api/v1/auctions/${id}?currency=${userCurrency}`);
                if (data.success) {
                    setAuction(data.data.auction);
                }
            } catch (error) {
                if (error?.response?.status === 404) setNotFound(true);
                toast.error(error?.response?.data?.message || 'Failed to fetch auction');
                console.error('Fetch auction error:', error);
            } finally {
                setLoading(false);
            }
        };

        if (countdown?.status === 'ended') {
            const timer = setTimeout(() => {
                fetchAuction();
            }, 2000);
            return () => clearTimeout(timer);
        } else if (!hasFetchedRef.current) {
            hasFetchedRef.current = true;
            fetchAuction();
        }
    }, [id, countdown?.status]);

    // ---- LIVE SUBSCRIPTION ----
    useEffect(() => {
        if (!id) return;

        const joinRoom = () => {
            socket.emit("joinAuction", id);
        };

        // On (re)connect: rejoin the room, then refetch once to catch up
        // on any state we missed while the socket was down.
        const onConnect = async () => {
            joinRoom();
            try {
                const { data } = await axiosInstance.get(`/api/v1/auctions/${id}?currency=${userCurrency}`);
                if (data.success) setAuction(data.data.auction);
            } catch (_) {
                // silent — the live tick will fill in shortly
            }
        };

        joinRoom();
        socket.on("connect", onConnect);

        // ⬇️ THIS IS THE CHANGE ⬇️
        const onUpdate = ({ auction, rates, baseCurrency }) => {
            // The broadcast is the public view: it omits per-user data
            // (your own proxy bid, offers, giveaway entry). Keep the copy we
            // already have from the authenticated fetch.
            setAuction((prev) => {
                const merged = {
                    proxyBids: prev?.proxyBids,
                    offers: prev?.offers,
                    participants: prev?.participants,
                    ...auction,
                    rates: rates || auction.rates,
                    baseCurrency: baseCurrency || auction.baseCurrency,
                };
                return convertAuctionPrices(merged, userCurrency);
            });
        };

        const onRemoved = () => setAuction(null);

        socket.on("auction:update", onUpdate);
        socket.on("auction:removed", onRemoved);

        return () => {
            socket.off("connect", onConnect);
            socket.off("auction:update", onUpdate);
            socket.off("auction:removed", onRemoved);
            socket.emit("leaveAuction", id);
        };
    }, [id, userCurrency]);   // ⬅️ add userCurrency
    // ---------------------------

    // ---- GA4 view_item ----
    useEffect(() => {
        if (!auction?._id) return;
        if (viewedListingRef.current === auction._id) return;

        viewedListingRef.current = auction._id;

        // Pick the most meaningful price to report
        let itemPrice = 0;
        if (auction.auctionType === 'buy_now' && auction.convertedBuyNowPrice) {
            itemPrice = Number(auction.convertedBuyNowPrice);
        } else if (auction.bidCount > 0 && auction.convertedCurrentPrice) {
            itemPrice = Number(auction.convertedCurrentPrice);
        } else {
            itemPrice = Number(auction.convertedStartPrice || 0);
        }

        trackMeta('ViewContent', {
            content_ids: [auction._id],
            content_name: auction.title,
            content_category: auction.categories?.[1] || auction.categories?.[0] || '',
            value: itemPrice,
            currency: userCurrency,
        });

        gtag('event', 'view_item', {
            currency: userCurrency,
            value: itemPrice,
            items: [{
                item_id: auction._id,
                item_name: auction.title,
                item_category: auction.categories?.[0] || '',
                item_category2: auction.categories?.[1] || '',
                price: itemPrice,
                quantity: 1
            }]
        });
    }, [auction?._id]);
    // -----------------------

    useEffect(() => {
        const fetchUserReview = async () => {
            if (!user || !auction || auction.status !== 'sold') return;
            try {
                const { data } = await axiosInstance.get(`/api/v1/reviews/my-review/auction/${auction._id}`);
                setUserReview(data.data);
            } catch (error) {
                console.error("Error fetching user review:", error);
            }
        };
        fetchUserReview();
    }, [user, auction]);

    useEffect(() => {
        const fetchReviews = async () => {
            if (!auction?._id) return;
            try {
                const { data } = await axiosInstance.get(`/api/v1/reviews/auction/${auction._id}`);
                setAuctionReviews(data.data);
            } catch (error) {
                console.error("Failed to fetch reviews:", error);
            }
        };
        fetchReviews();
    }, [auction]);

    const handleGiveawayClaimSuccess = async () => {
        try {
            const { data } = await axiosInstance.get(`/api/v1/auctions/${id}?currency=${userCurrency}`);
            if (data.success) {
                setAuction(data.data.auction);
            }
        } catch (error) {
            console.error("Error refreshing auction:", error);
        }
    };

    const scrollToBidSection = () => {
        bidSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    };

    const scrollToCommentSection = () => {
        commentSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    };

    const scrollToOfferSection = () => {
        offerSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    };

    // Quiet refetch (no spinner), e.g. after a Buy It Now purchase.
    const refreshAuction = async () => {
        try {
            const { data } = await axiosInstance.get(`/api/v1/auctions/${id}?currency=${userCurrency}`);
            if (data.success) setAuction(data.data.auction);
        } catch (_) { /* the realtime update will follow */ }
    };

    // Links from question emails/texts: /auction/:id?tab=questions#q-<id>
    const location = useLocation();
    useEffect(() => {
        const tab = new URLSearchParams(location.search).get("tab");
        if ((tab === "questions" || tab === "comments") && auction?._id) {
            setActiveTab("comments");
            if (!location.hash) setTimeout(scrollToCommentSection, 300);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, auction?._id]);

    const handleAskSeller = () => handleTabClick("comments");

    const handleTabClick = (tabId) => {
        setActiveTab(tabId);
        if (tabId === 'comments' || tabId === 'bids' || tabId === 'offers') {
            scrollToCommentSection();
        }
    };

    // ============= BID HANDLER =============
    const handleBid = async (e) => {
        e.preventDefault();

        if (!user) {
            setPendingAction({ type: 'bid', amount: bidAmount });
            setIsAuthModalOpen(true);
            return;
        }

        if (user._id?.toString() === auction?.seller?._id?.toString()) {
            toast.error(`You can't bid on your own auction.`);
            return;
        }

        // Calculate minimum bid in user's currency
        let minBidInUserCurrency;
        if (auction.bidCount === 0) {
            // First bid: must be at least starting price
            minBidInUserCurrency = auction.convertedStartPrice;
        } else {
            // Subsequent bids: current price + bid increment
            minBidInUserCurrency = auction.convertedCurrentPrice + (auction.convertedBidIncrement || 0);
        }

        const bidValue = parseFloat(bidAmount);
        if (!bidAmount || bidValue < minBidInUserCurrency) {
            const currencySymbol = userCurrency === 'GBP' ? '£' : '€';
            toast.error(`Minimum bid is ${currencySymbol}${minBidInUserCurrency.toFixed(0)}`);
            return;
        }

        try {
            setBidding(true);

            const { data } = await axiosInstance.post(`/api/v1/auctions/bid/${id}`, {
                amount: bidValue,
                currency: userCurrency
            });

            if (data.success) {
                setAuction(data.data.auction);
                setBidAmount('');
                toast.success('Bid placed successfully!');
                haptics.bidPlaced();

                // place_bid — fires only after the backend confirms the bid was accepted
                gtag('event', 'place_bid', {
                    listing_id: data.data.auction._id,
                    item_name: data.data.auction.title,
                    category: data.data.auction.categories?.[1] || data.data.auction.categories?.[0] || '',
                    bid_amount: bidValue,
                    currency: userCurrency,
                    auction_type: data.data.auction.auctionType,
                    bid_number: data.data.auction.bidCount || 1
                });
                trackMeta('PlaceBid', {
                    content_ids: [data.data.auction._id],
                    content_name: data.data.auction.title,
                    content_category: data.data.auction.categories?.[1] || data.data.auction.categories?.[0] || '',
                    value: bidValue,
                    currency: userCurrency,
                });

                // Show anti-sniping message if the auction time was extended
                if (data.data.extended) {
                    toast.success('Anti-sniping: Your bid extended the auction by 1 minute!', {
                        duration: 5000,
                        position: 'bottom-center',
                        icon: '⏳',
                    });
                }
            }
        } catch (error) {
            if (
                error?.response?.data?.errorCode === 'PAYMENT_METHOD_REQUIRED' ||
                error?.response?.data?.errorCode === 'PAYMENT_METHOD_INVALID' ||
                error?.response?.data?.errorCode === 'STRIPE_CUSTOMER_INVALID'
            ) {
                setPendingAction({ type: 'bid', amount: bidAmount });
                setIsPaymentModalOpen(true);
            } else {
                toast.error(error?.response?.data?.message || 'Failed to place bid');
            }
        } finally {
            setBidding(false);
        }
    };

    const handleMobilePlaceBid = () => {
        if (!bidAmount || parseFloat(bidAmount) <= 0) {
            toast.error('Please enter a valid bid amount.');
            return;
        }

        const bidValue = parseFloat(bidAmount);
        if (bidValue < minBidAmount) {
            toast.error(`Minimum bid is ${userCurrency === 'GBP' ? '£' : '€'}${minBidAmount.toFixed(0)}`);
            return;
        }

        handleOpenBidModal();
    };

    // ============= BUY NOW HANDLER =============
    const handleBuyNow = async () => {
        if (!user) {
            setPendingAction({ type: 'buynow' });
            setIsAuthModalOpen(true);
            return;
        }

        if (user._id?.toString() === auction?.seller?._id?.toString()) {
            toast.error(`You can't buy your own auction.`);
            return;
        }

        if (!auction.convertedBuyNowPrice) {
            toast.error('Buy Now is not available for this auction.');
            return;
        }

        if (countdown.status !== 'always-available') {
            toast.error('Auction is not active.');
            return;
        }

        try {
            setBuying(true);

            // Execute Buy Now - SIMPLIFIED VERSION
            const { data } = await axiosInstance.post(`/api/v1/buy-now/${id}`);

            if (data.success) {
                setAuction(data.data.auction);
                toast.success('Congratulations! You have purchased this item.');

                // Optionally scroll to show success message
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to complete Buy Now purchase');
            console.error('Buy Now error:', error);
        } finally {
            setBuying(false);
        }
    };

    // const handleClaimNow = async () => {
    //     if (!user) {
    //         toast.error('You must login to claim this item.');
    //         navigate('/login');
    //         return;
    //     }

    //     if (user._id?.toString() === auction?.seller?._id?.toString()) {
    //         toast.error(`You can't claim your own giveaway.`);
    //         return;
    //     }

    //     if (auction.winner) {
    //         toast.error('This item has already been claimed.');
    //         return;
    //     }

    //     try {
    //         setClaiming(true);

    //         const { data } = await axiosInstance.post(`/api/v1/buy-now/${id}`);

    //         if (data.success) {
    //             setAuction(data.data.auction);
    //             toast.success('🎉 Congratulations! You have claimed this item for free!');
    //             setShowBuyNowModal(false);
    //             window.scrollTo({ top: 0, behavior: 'smooth' });
    //         }
    //     } catch (error) {
    //         toast.error(error?.response?.data?.message || 'Failed to claim item');
    //         console.error('Claim error:', error);
    //     } finally {
    //         setClaiming(false);
    //     }
    // };

    // ============= GIVEAWAY HANDLER =============

    const handleClaimGiveaway = async () => {
        if (!user) {
            setPendingAction({ type: 'giveaway' });
            setIsAuthModalOpen(true);
            return;
        }

        if (user._id?.toString() === auction?.seller?._id?.toString()) {
            toast.error(`You can't participate in your own giveaway.`);
            return;
        }

        if (auction.winner) {
            toast.error('This item has already been given away.');
            return;
        }

        try {
            setIsClaimingGiveaway(true);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to claim item');
            console.error('Claim error:', error);
        } finally {
            setIsClaimingGiveaway(false);
        }
    }

    const handleMakeOffer = async (e) => {
        e.preventDefault();
        if (makingOfferRef.current) return;
        makingOfferRef.current = true;

        // Gate on auth BEFORE anything else
        if (!user) {
            setPendingAction({
                type: 'offer',
                amount: offerAmount,
                message: offerMessage,
            });
            setIsMakeOfferModalOpen(false);   // close the modal
            setIsAuthModalOpen(true);         // open auth popup
            makingOfferRef.current = false;   // we haven't submitted
            return;
        }

        if (user._id?.toString() === auction?.seller?._id?.toString()) {
            toast.error(`You can't make an offer on your own auction.`);
            makingOfferRef.current = false;
            return;
        }

        if (!auction.allowOffers) {
            toast.error('Offers are not allowed for this auction.');
            return;
        }

        if (!offerAmount || parseFloat(offerAmount) <= 0) {
            toast.error('Please enter a valid offer amount.');
            return;
        }

        if (parseFloat(offerAmount) < auction.convertedStartPrice) {
            toast.error(`Offer must be at least ${userCurrency === 'GBP' ? '£' : '€'}${auction.convertedStartPrice}`);
            return;
        }

        if (auction.convertedBuyNowPrice && parseFloat(offerAmount) >= auction.convertedBuyNowPrice) {
            toast.error(`Offer is higher than Buy Now price. Consider using Buy Now instead.`);
            return;
        }

        try {
            setMakingOffer(true);

            const { data } = await axiosInstance.post(`/api/v1/offers/auction/${id}`, {
                amount: parseFloat(offerAmount),
                message: offerMessage,
                currency: userCurrency
            });

            if (data.success) {
                // Update auction state
                setAuction(data.data.auction);

                // make_offer — fires only after the backend confirms the offer was submitted
                gtag('event', 'make_offer', {
                    listing_id: data.data.auction._id,
                    item_name: data.data.auction.title,
                    category: data.data.auction.categories?.[1] || data.data.auction.categories?.[0] || '',
                    offer_amount: parseFloat(offerAmount),
                    currency: userCurrency,
                    auction_type: data.data.auction.auctionType
                });

                handleCloseMakeOfferModal();
                toast.success('Your offer has been submitted successfully!');

                // Switch to offers tab
                setActiveTab('offers');
            }
        } catch (error) {
            if (
                error?.response?.data?.errorCode === 'PAYMENT_METHOD_REQUIRED' ||
                error?.response?.data?.errorCode === 'PAYMENT_METHOD_INVALID' ||
                error?.response?.data?.errorCode === 'STRIPE_CUSTOMER_INVALID'
            ) {
                setPendingAction({
                    type: 'offer',
                    amount: offerAmount,
                    message: offerMessage,
                });
                setIsMakeOfferModalOpen(false);
                setIsPaymentModalOpen(true);
            } else {
                toast.error(error?.response?.data?.message || 'Failed to submit offer');
            }
        } finally {
            setMakingOffer(false);
            makingOfferRef.current = false;
        }
    };

    // Handle document download
    const handleDocumentDownload = (documentUrl, filename) => {
        const link = document.createElement('a');
        link.href = documentUrl;
        link.download = filename;
        link.target = '_blank';
        link.click();
    };

    // Extract YouTube ID from URL
    function getYouTubeId(input) {
        if (!input) return null;

        // Already a bare 11-char ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
            return input;
        }

        // watch?v=ID | embed/ID | shorts/ID | live/ID | v/ID | youtu.be/ID
        // Accepts optional www. / m. and any query string afterwards.
        const match = input.match(
            /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
        );

        return match ? match[1] : null;
    }

    const youtubeVideoId = getYouTubeId(auction?.videoLink);
    const minBidAmount = auction?.bidCount > 0 ? auction?.convertedCurrentPrice + auction?.convertedBidIncrement : auction?.convertedCurrentPrice;

    // Check if Buy Now is available - remove timer check for buy_now
    const isBuyNowAvailable = auction?.convertedBuyNowPrice &&
        auction?.auctionType === 'buy_now' &&
        !auction?.winner &&
        auction?.status === 'active'; // Only check status, not timer

    // Check if Make Offer is available - updated for all auction types
    const isMakeOfferAvailable = auction?.allowOffers &&
        !auction?.winner &&
        auction?.status === 'active' && // Check status instead of countdown
        (auction.auctionType === 'standard' ||
            auction.auctionType === 'reserve' ||
            auction.auctionType === 'buy_now'); // Include buy_now

    if (loading) {
        return (
            <Container className="py-32 min-h-[70vh] flex items-center justify-center">
                <LoadingSpinner size="large" />
            </Container>
        );
    }

    if (!auction) {
        return (
            <Container className="py-32 min-h-[70vh] flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-semibold text-gray-600">Auction not found</h2>
                    <Link to="/auctions" className="text-orange-500 hover:underline mt-4 inline-block">
                        Back to Auctions
                    </Link>
                </div>
            </Container>
        );
    }

    return (
        <Container className={`pt-20 md:pt-32 pb-16 min-h-[70vh] grid grid-cols-1 lg:grid-cols-3 items-start gap-10`}>
            <section className="col-span-1 lg:col-span-2">
                {/* Title and top section */}
                <div className="hidden md:flex flex-wrap gap-2 capitalize justify-between items-center text-secondary">
                    <div className="flex items-center flex-wrap gap-2">
                        <span className="text-sm">Category:</span>
                        <div>
                            {auction.categories?.map((category, index) => (
                                <Link
                                    key={index}
                                    to={`/auctions?category=${category}`}
                                    className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors"
                                >
                                    {category}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* <p onClick={toggleWatchlist}
                            title="Add to watchlist"
                            className={`flex items-center gap-2 py-1 px-3 border border-gray-200 rounded-full transition-colors ${isWatchlisted
                                ? 'bg-gray-100 text-black hover:bg-gray-200'
                                : 'text-secondary hover:bg-gray-200'
                                } disabled:opacity-50`}>
                            <Heart size={18} fill={isWatchlisted ? 'currentColor' : 'none'} />
                            <span>{watchlistCount || auction?.watchlistCount || 0}</span>
                        </p> */}

                        <p onClick={() => handleTabClick('comments')}
                            title="Questions & Answers"
                            className="flex items-center gap-2 border border-gray-200 py-1 px-3 rounded-full cursor-pointer hover:bg-gray-100">
                            <MessageSquare size={16} />
                            <span>{pagination?.totalComments || 0} {pagination?.totalComments === 1 ? 'question' : 'questions'}</span>
                        </p>

                        {
                            (auction.auctionType === 'standard' || auction.auctionType === 'reserve') && (
                                <p onClick={() => handleTabClick('bids')}
                                    className="flex items-center gap-2 border border-gray-200 py-1 px-3 rounded-full cursor-pointer hover:bg-gray-100">
                                    <Gavel size={16} />
                                    <span>{auction.status === 'approved' ? '--' : (auction.bids?.length || 0)}</span>
                                </p>
                            )
                        }

                        {/* Offers Count */}
                        {/* {auction?.allowOffers && (
                            <p onClick={() => handleTabClick('offers')}
                                className="flex items-center gap-2 border border-gray-200 py-1 px-3 rounded-full cursor-pointer hover:bg-gray-100">
                                <Banknote size={18} />
                                <span>{auction.offers?.length}</span>
                            </p>
                        )} */}
                    </div>
                </div>

                <div className="flex items-center gap-3 mt-4 mb-6 flex-wrap">
                    <h2 className="text-2xl md:text-3xl font-semibold text-primary">{auction.title}</h2>
                    {isNativeApp && (
                        <button
                            type="button"
                            onClick={() => shareLink({ title: auction.title, text: `${auction.title} on RexBid`, path: `/auction/${auction._id}` })}
                            className="ml-auto inline-flex items-center gap-1.5 py-1.5 px-3 border border-gray-200 rounded-full text-secondary"
                            aria-label="Share this listing"
                        >
                            <Share2 size={18} /> Share
                        </button>
                    )}
                    {/* {auctionReviews.length > 0 && (
                        <div className="flex items-center gap-1 bg-orange-100 px-3 py-1 rounded-full">
                            <RatingStars rating={auctionReviews.reduce((sum, r) => sum + r.rating, 0) / auctionReviews.length} size={16} />
                            <span className="text-sm text-gray-600 ml-1">({auctionReviews.length})</span>
                        </div>
                    )} */}
                </div>

                {/* Image section */}
                {/* <Suspense fallback={<LoadingSpinner />}> */}
                <ImageLightBox isFeatured={auction.isFeatured} images={auction.photos} auctionType={auction?.auctionType} isReserveMet={auction.reserveMet} />
                {/* </Suspense> */}

                <MobileBidStickyBar
                    currentBid={auction.convertedCurrentPrice}
                    timeRemaining={countdown}
                    onBidClick={() => scrollToBidSection()}
                    convertedBuyNowPrice={auction.convertedBuyNowPrice}
                    onBuyNowClick={isBuyNowAvailable ? handleBuyNow : null}
                    onMakeOfferClick={isMakeOfferAvailable ? handleOpenMakeOfferModal : null}
                    allowOffers={auction.allowOffers}
                    auctionType={auction.auctionType}
                    status={countdown.status}
                    auction={auction}
                    userCurrency={userCurrency}
                    onSetReminder={handleSetReminder}
                    isWatchlisted={isWatchlisted}
                    watchlistCount={watchlistCount || auction?.watchlistCount || 0}
                    views={auction?.views || 0}
                    bidAmount={bidAmount}
                    setBidAmount={setBidAmount}
                    minBidAmount={minBidAmount}
                    onPlaceBid={handleMobilePlaceBid}
                    bidding={bidding}
                    countdown={countdown}
                    onProxyBidClick={handleOpenProxyBidModal}
                />

                {/* Buy It Now after the auction (mobile; desktop shows it in the bid panel) */}
                <div className="lg:hidden">
                    <LiveBuyNowPanel auction={auction} onPurchased={refreshAuction} />
                    <PostAuctionBinPanel auction={auction} onPurchased={refreshAuction} />
                </div>

                <hr className="my-8" />

                <Suspense fallback={<LoadingSpinner />}>
                    <TabSection
                        ref={commentSectionRef}
                        description={auction.description}
                        bids={auction.bids}
                        offers={auction.offers}
                        auction={auction}
                        activatedTab={activeTab}
                        onAuctionUpdate={updateAuctionState}
                        auctionReviews={auctionReviews}
                        userCurrency={userCurrency}
                    />
                </Suspense>

                {/* Info section */}
                {/* <div>
                    <h3 className="my-5 text-primary text-xl font-semibold">Auction Overview</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-10">

                        <div className="flex items-center gap-3">
                            <Tag className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8" strokeWidth={1} />
                            <div>
                                <p className="text-secondary text-sm">Category</p>
                                <p className="text-base capitalize">{auction?.categories[1]}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <MapPin className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8" strokeWidth={1} />
                            <div>
                                <p className="text-secondary text-sm">Location</p>
                                <p className="text-base">{auction.location || 'Not specified'}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <CalendarDays className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8" strokeWidth={1} />
                            <div>
                                <p className="text-secondary text-sm">Start Date</p>
                                <p className="text-base">
                                    {new Date(auction.startDate).toLocaleDateString()}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Clock className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8" strokeWidth={1} />
                            <div>
                                <p className="text-secondary text-sm">End Date</p>
                                <p className="text-base">
                                    {new Date(auction.endDate).toLocaleDateString()}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <User className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8" strokeWidth={1} />
                            <div>
                                <p className="text-secondary text-sm">Seller</p>
                                <p className="text-base break-all">{auction.sellerUsername}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Gavel className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8" strokeWidth={1} />
                            <div>
                                <p className="text-secondary text-sm">Auction Type</p>
                                <p className="text-base capitalize">
                                    {auction.auctionType === 'reserve' ? 'Reserve Price' : auction.auctionType === 'standard' ? 'No Reserve' : auction.auctionType === 'giveaway' ? 'Giveaway' : 'Buy Now'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div> */}

                <SpecificationsSection auction={auction} />

                <hr className="my-8" />

                {/* Features Section */}
                {auction.features && (
                    <>
                        <div>
                            <hr className="my-8" />
                            <h3 className="my-5 text-primary text-xl font-semibold">Features & Options</h3>
                            <div className="prose prose-lg max-w-none border rounded-lg px-6 py-3 bg-white text-md">
                                {auction.features ? (
                                    <div dangerouslySetInnerHTML={{ __html: auction.features }} />
                                ) : (
                                    <p className="text-gray-500">No Features provided.</p>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Document section */}
                {auction.documents && auction.documents.length > 0 && (
                    <div>
                        <hr className="my-8" />
                        <h3 className="my-5 text-primary text-xl font-semibold">Document(s)</h3>
                        <div className="flex gap-5 max-w-full flex-wrap">
                            {auction.documents.map((doc, index) => (
                                <div key={index} className="flex flex-col items-center">
                                    <button
                                        onClick={() => handleDocumentDownload(doc.url, doc.originalName || doc.filename)}
                                        className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 cursor-pointer border border-gray-200 py-3 px-5 rounded-md text-secondary group hover:text-primary"
                                    >
                                        <File size={20} className="flex-shrink-0" />
                                        <span className="group-hover:underline max-w-[125px] truncate">
                                            {doc.originalName || doc.filename}
                                        </span>
                                        <Download size={20} className="flex-shrink-0" />
                                    </button>
                                    {/* Add caption display for documents */}
                                    {doc.caption && (
                                        <p className="text-xs text-gray-600 mt-1 max-w-[150px] text-center truncate" title={doc.caption}>
                                            {doc.caption}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Service Records Section */}
                {auction.serviceRecords && auction.serviceRecords.length > 0 && (
                    <>
                        <div>
                            <h3 className="my-5 text-primary text-xl font-semibold">Other Images</h3>
                            <ImageLightBox
                                images={auction.serviceRecords}
                                captions={auction.serviceRecords.map(record => record.caption || '')} // ADD THIS LINE
                                type="logbooks"
                            />
                        </div>
                    </>
                )}

                {/* Video section */}
                {youtubeVideoId && (
                    <>
                        <div className="my-8" />
                        <div>
                            <h3 className="my-5 text-primary text-xl font-semibold">Video Look</h3>
                            <Suspense fallback={<LoadingSpinner />}>
                                <YouTubeEmbed videoId={youtubeVideoId} title={auction.title} />
                            </Suspense>
                        </div>
                    </>
                )}

                {/* NEW: Seller Stats Card */}
                {auction?.seller && (
                    <div className="my-8">
                        <SellerStatsCard
                            sellerId={auction.seller._id}
                            auctionId={auction._id}
                            contactMode={auction.contactMode}
                            onAskQuestion={handleAskSeller}
                        />
                    </div>
                )}
            </section>

            {/* Bid Section */}
            <section ref={bidSectionRef} className="hidden lg:block col-span-1 border border-gray-200 bg-gray-100 rounded-lg sticky top-24">
                {/* Timer section */}
                <TimerDisplay countdown={countdown} auction={auction} userCurrency={userCurrency} />

                <hr className="mx-6" />

                {/* Current bid section */}
                <div className="p-4 flex flex-col gap-3">
                    {
                        (auction.auctionType === 'standard' || auction.auctionType === 'reserve') && (
                            <>
                                <div className="flex flex-row items-center justify-between gap-2">
                                    <p className="font-light text-secondary text-base">{auction.status === 'sold' ? 'Sold At' : auction.bidCount > 0 ? 'Current Bid' : 'Start Bidding At'}</p>
                                    <p className="flex items-center gap-1 text-3xl sm:text-3xl font-medium">
                                        <span>{userCurrency === 'GBP' ? '£' : '€'}</span>
                                        <span> {auction.convertedCurrentPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 }) || auction.convertedFinalPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                                    </p>
                                </div>

                                {userBidStatus === "highest" && (
                                    <span className="inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                                        <CheckSquare size={13} /> You're the highest bidder
                                    </span>
                                )}
                                {userBidStatus === "outbid" && (
                                    <span className="inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                                        <Gavel size={13} /> You've been outbid
                                    </span>
                                )}

                                {auction.auctionType === 'reserve' && timeRemaining > 0 && timeRemaining > 24 * 60 * 60 * 1000 && (
                                    <p className={`${auction.reserveMet ? 'text-green-600 bg-green-100' : 'text-blue-600 bg-blue-100'} flex items-start self-start text-xs font-medium px-4 py-2 rounded-md`}>
                                        {auction.reserveMet ? 'Reserve Met' : 'Reserve Applies'}
                                    </p>
                                )}

                                {auction.auctionType === 'reserve' && auction.status === "active" &&
                                    countdown.status === "counting-down" &&
                                    timeRemaining > 0 &&
                                    timeRemaining < 24 * 60 * 60 * 1000 &&
                                    auction.hasReserve &&
                                    auction.bidCount === 0 && (
                                        <p className={`${auction.reserveMet ? 'text-green-600 bg-green-100' : 'text-blue-600 bg-blue-100'} flex items-start self-start text-xs font-medium px-4 py-2 rounded-md`}>
                                            {auction.reserveMet ? 'Reserve Met' : 'Reserve Applies'}
                                        </p>
                                    )}

                                {/* ----- RESERVE PROGRESS INDICATOR (only in last 24h) ----- */}
                                {auction.auctionType === "reserve" &&
                                    auction.status === "active" &&
                                    countdown.status === "counting-down" &&
                                    timeRemaining > 0 && // still active
                                    timeRemaining < 24 * 60 * 60 * 1000 && // last 24 hours
                                    auction.hasReserve &&
                                    auction.bidCount > 0 && // only show if there is at least one bid
                                    (() => {
                                        // Reserve amount is never sent to the browser; the server provides a
                                        // rounded progress value and a met/not-met flag instead.
                                        const reserveProgress = Number(auction.reserveProgress) || 0;
                                        const reserveMet = !!auction.reserveMet;

                                        return (
                                            <div className="mt-2 border-t pt-3">
                                                <div className="mb-1 flex items-center justify-between">
                                                    <span className="text-sm text-secondary">
                                                        Reserve Progress
                                                    </span>

                                                    <span
                                                        className={`text-xs font-medium ${reserveMet
                                                            ? "text-green-600"
                                                            : "text-gray-600"
                                                            }`}
                                                    >
                                                        {reserveMet ? "✅ Met" : "⏳ Not met"}
                                                    </span>
                                                </div>

                                                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                                                    <div
                                                        className={`h-2.5 rounded-full transition-all duration-500 ${reserveMet
                                                            ? "bg-green-500"
                                                            : "bg-orange-400"
                                                            }`}
                                                        style={{
                                                            width: `${reserveProgress}%`,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()}

                                <p className="flex w-full justify-between border-b pb-2">
                                    <span className="text-secondary font-light">Starting Bid</span>
                                    <span className="font-medium">{userCurrency === 'GBP' ? '£' : '€'}{auction.convertedStartPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                                </p>

                                {/* <p className="flex w-full justify-between border-b pb-2">
                                    <span className="text-secondary">No. of Bids</span>
                                    <span className="font-medium">{auction.status === 'approved' ? '--' : auction?.bidCount}</span>
                                </p> */}
                            </>
                        )
                    }

                    {
                        auction.allowOffers && (auction.auctionType === 'buy_now' || auction.auctionType === 'giveaway') && (
                            <>
                                <div className="flex flex-col gap-2">
                                    {auction.status === 'sold' || auction.winner ? (
                                        <>
                                            <p className="font-light">Sold For</p>
                                            <p className="flex items-center gap-1 text-3xl sm:text-4xl font-medium">
                                                <span>{userCurrency === 'GBP' ? '£' : '€'}</span>
                                                <span>{auction.convertedFinalPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 }) || auction.convertedCurrentPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                                            </p>
                                        </>
                                    ) : (
                                        // Only show offer starting at if convertedStartPrice > 0
                                        auction.convertedStartPrice > 0 ? (
                                            <>
                                                <p className="font-light">Offer Starting At</p>
                                                <p className="flex items-center gap-1 text-3xl sm:text-4xl font-medium">
                                                    <span>{userCurrency === 'GBP' ? '£' : '€'}</span>
                                                    <span>{auction.convertedStartPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                                                </p>
                                            </>
                                        ) : (
                                            // For items with 0 convertedStartPrice (giveaways/buy now), show make offer prompt
                                            ''
                                        )
                                    )}
                                </div>
                            </>
                        )
                    }

                    {/* {
                        auction.allowOffers && (
                            <p className="flex w-full justify-between border-b pb-2">
                                <span className="text-secondary">No. of Offers</span>
                                <span className="font-medium">{auction.status === 'approved' ? '--' : (auction.offerCount ?? auction?.offers?.length)}</span>
                            </p>
                        )
                    } */}

                    {
                        (auction.auctionType === 'reserve' || auction.auctionType === 'standard') && (
                            <p className="flex w-full justify-between border-b pb-2">
                                <span className="text-secondary font-light">Min. Bid Increment</span>
                                <span className="font-medium">{userCurrency === 'GBP' ? '£' : '€'}{auction?.convertedBidIncrement?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                            </p>
                        )
                    }

                    {/* Buy Now Price Display */}
                    {(auction.auctionType === 'buy_now' && auction.convertedBuyNowPrice) && (
                        <div className="bg-white border border-green-300 rounded-lg p-3 mb-2">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-secondary text-sm">Buy Now Price</p>
                                    <p className="text-2xl font-bold text-green-600">{userCurrency === 'GBP' ? '£' : '€'}{auction.convertedBuyNowPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</p>
                                </div>
                                <Zap className="text-green-500" size={24} />
                            </div>
                        </div>
                    )}

                    {/* Giveaway Display */}
                    {auction.auctionType === 'giveaway' && (
                        <div className="bg-green-50 border border-green-300 rounded-lg p-3 mb-2">
                            <div className="flex justify-between items-center">
                                <div>
                                    {/* <p className="text-secondary text-sm">Giveaway</p> */}
                                    <p className="text-2xl font-bold text-green-600">Giveaway</p>
                                    {auction.winner && (
                                        <p className="text-sm text-green-600 mt-1">
                                            Claimed by: {auction.winner.username}
                                        </p>
                                    )}
                                </div>
                                <span className="text-4xl">🎁</span>
                            </div>
                        </div>
                    )}

                    {/* GIVEAWAY HANDLING - This should be first */}
                    {auction.auctionType === 'giveaway' && auction.status !== 'sold' && countdown?.status === 'always-available' && (
                        <>
                            <button
                                onClick={() => {
                                    if (!user) {
                                        setPendingAction({ type: 'giveaway' });
                                        setIsAuthModalOpen(true);
                                        return;
                                    }
                                    setShowGiveawayModal(true);
                                }}
                                disabled={isClaimingGiveaway}
                                className="flex items-center justify-center gap-2 w-full bg-purple-600 text-white py-3 px-6 cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-700 transition-colors text-lg font-semibold"
                            >
                                {isClaimingGiveaway ? (
                                    <Loader size={20} className="animate-spin-slow" />
                                ) : (
                                    <>
                                        <span>🎁</span>
                                        <span>Enter Giveaway</span>
                                    </>
                                )}
                            </button>

                            <GiveawayClaimModal
                                isOpen={showGiveawayModal}
                                onClose={() => setShowGiveawayModal(false)}
                                onSuccess={handleGiveawayClaimSuccess}
                                auctionId={auction._id}
                            />
                        </>
                    )}

                    {/* Show claimed status for won giveaways */}
                    {auction.auctionType === 'giveaway' && auction.winner && (
                        <div className="text-center py-4 bg-purple-100 rounded-lg border border-purple-200">
                            <p className="font-medium text-purple-700">🎁 Item Claimed</p>
                            <p className="text-sm text-purple-600 mt-1">
                                Claimed by: {auction.winner.username}
                            </p>
                        </div>
                    )}

                    {/* REGULAR AUCTION HANDLING - For non-giveaway auctions */}
                    {auction.auctionType !== 'giveaway' && (
                        <>
                            {/* ACTIVE STATES - Show for both counting-down and always-available */}
                            {(countdown.status === 'counting-down' || countdown.status === 'always-available') && (
                                <>
                                    <p className="bg-blue-100 text-blue-600 py-2 px-4 rounded-md text-sm flex items-center gap-2"><Info size={14} />{auction?.vatIncluded ? 'VAT to be added' : 'No VAT  to be added'}</p>
                                    {/* Bid Form for standard/reserve - only show for timed auctions */}
                                    {(auction.auctionType === 'standard' || auction.auctionType === 'reserve') && (
                                        <form ref={formRef} onSubmit={handleBid} className="flex flex-col gap-4">
                                            <input
                                                type="number"
                                                value={bidAmount}
                                                autoFocus
                                                onChange={(e) => setBidAmount(e.target.value)}
                                                className="py-3 px-5 w-full border-2 border-gray-400 rounded-lg focus:outline-2 focus:outline-primary"
                                                placeholder={`Enter bid amount (${userCurrency === 'GBP' ? '£' : '€'}${auction.bidCount > 0 ? minBidAmount?.toFixed(0) : auction.convertedStartPrice?.toFixed(0)} or higher)`}
                                                min={minBidAmount?.toFixed(0)}
                                            />
                                            <button
                                                type="button"
                                                disabled={bidding}
                                                onClick={() => handleOpenBidModal(bidAmount)}
                                                className="flex items-center justify-center gap-2 w-full bg-[#D19F3E] text-black py-3 px-6 cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#db9a18] transition-colors"
                                            >
                                                {bidding ? (
                                                    <Loader size={16} className="animate-spin-slow" />
                                                ) : (
                                                    <>
                                                        <Gavel />
                                                        <span>Place Bid</span>
                                                    </>
                                                )}
                                            </button>
                                            <p className="text-xs text-gray-500 text-center">
                                                + buyer fee: {buyerFeeShort}.{" "}
                                                <Link to="/payment-refund-policy#buyer-fee" className="underline">Fees &amp; payment</Link>
                                            </p>
                                        </form>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleOpenProxyBidModal}
                                        className="flex items-center justify-center gap-2 w-full border bg-blue-600 border-blue-600 text-white hover:bg-blue-700 py-3 px-6 rounded-lg transition-colors"
                                    >
                                        <Gauge size={18} /> Set a Proxy Bid (Auto-bid)
                                    </button>

                                    {/* Buy Now Button - Show for buy_now auctions */}
                                    {auction.auctionType === 'buy_now' && isBuyNowAvailable && (
                                        <>
                                            <button
                                                onClick={() => setShowBuyNowModal(true)}
                                                disabled={buying || !isBuyNowAvailable}
                                                className="flex items-center justify-center gap-2 w-full bg-green-600 text-white py-3 px-6 cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-700 transition-colors"
                                            >
                                                {buying ? (
                                                    <Loader size={16} className="animate-spin-slow" />
                                                ) : (
                                                    <>
                                                        <Zap />
                                                        <span>Buy Now {userCurrency === 'GBP' ? '£' : '€'}{auction.convertedBuyNowPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                                                    </>
                                                )}
                                            </button>

                                            <BuyNowModal
                                                isOpen={showBuyNowModal}
                                                onClose={() => setShowBuyNowModal(false)}
                                                onConfirm={handleBuyNow}
                                                auction={auction}
                                                loading={buying}
                                            />
                                        </>
                                    )}

                                    {/* Make Offer Button - Show for any auction type that allows offers and is active */}
                                    {/* {isMakeOfferAvailable && (
                                        <button
                                            onClick={handleOpenMakeOfferModal}
                                            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 text-white hover:from-orange-500 hover:via-orange-600 hover:to-orange-700 py-3 px-6 cursor-pointer rounded-lg transition-colors"
                                        >
                                            <Banknote />
                                            <span>Make an Offer</span>
                                        </button>
                                    )} */}

                                    {/* Make Offer Modal */}
                                    <Suspense fallback={null}>
                                        <MakeOfferModal
                                            isOpen={isMakeOfferModalOpen}
                                            onClose={handleCloseMakeOfferModal}
                                            onSubmit={handleMakeOffer}
                                            offerAmount={offerAmount}
                                            setOfferAmount={setOfferAmount}
                                            offerMessage={offerMessage}
                                            setOfferMessage={setOfferMessage}
                                            loading={makingOffer}
                                            auction={auction}
                                        />
                                    </Suspense>
                                </>
                            )}

                            {/* Make Payment Button for sold auctions */}
                            {auction.status === 'sold' && user && (user._id === auction.winner?._id) && (
                                auction?.isManualPaymentRequired ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                                        <p className="font-medium text-amber-800">Awaiting Invoice</p>
                                        <p className="text-sm text-amber-700 mt-1">
                                            Our admin team will be in touch shortly with your invoice and payment link.
                                        </p>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => navigate(`/checkout/${auction?._id}`)}
                                        className="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <CreditCard size={18} /> Pay Now
                                    </button>
                                )
                            )}

                            {/* Review Button for sold auctions */}
                            {/* {auction.status === 'sold' && user && (user._id === auction.seller?._id || user._id === auction.winner?._id) && !userReview && ( */}
                            {auction.status === 'sold' && user && (user._id === auction.winner?._id) && !userReview && (
                                <button
                                    onClick={() => {
                                        setRevieweeId(user._id === auction.seller?._id ? auction.winner?._id : auction.seller?._id);
                                        setShowReviewModal(true);
                                    }}
                                    className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Star size={18} /> Rate {user._id === auction.seller?._id ? "Bidder" : "Seller"}
                                </button>
                            )}

                            <ReviewModal
                                isOpen={showReviewModal}
                                onClose={() => setShowReviewModal(false)}
                                auctionId={auction._id}
                                revieweeId={revieweeId}
                                onSuccess={() => {
                                    setUserReview({});
                                }}
                            />

                            {/* Non-active states for regular auctions */}
                            {countdown.status === 'approved' && (
                                <div className="text-center py-4 bg-blue-100 rounded-lg border border-blue-200">
                                    <p className="font-medium text-blue-700">Auction Not Started</p>
                                    <p className="text-sm text-blue-600 mt-1">Bidding will begin when the auction starts</p>
                                </div>
                            )}

                            {/* Buy It Now after the auction (desktop) */}
                            <div className="hidden lg:block">
                                <LiveBuyNowPanel auction={auction} onPurchased={refreshAuction} />
                                <PostAuctionBinPanel auction={auction} onPurchased={refreshAuction} />
                            </div>

                            {countdown.status === 'ended' && (
                                <div className="text-center py-4 bg-yellow-100 rounded-lg border border-yellow-200">
                                    <p className="font-medium text-yellow-700">Auction Ended</p>
                                    {auction.winner ? (
                                        <p className="text-sm text-yellow-600 mt-1">Winner: {auction.winner.username}</p>
                                    ) : auction.status === 'sold' ? (
                                        <p className="text-sm text-green-600 mt-1">Item Sold</p>
                                    ) : auction.status === 'reserve_not_met' ? (
                                        <p className="text-sm text-yellow-600 mt-1">Reserve Not Met</p>
                                    ) : auction.status === 'sold_buy_now' ? (
                                        <p className="text-sm text-green-600 mt-1">Sold via Buy Now</p>
                                    ) : (
                                        <p className="text-sm text-yellow-600 mt-1">No winning bidder</p>
                                    )}
                                </div>
                            )}

                            {countdown.status === 'cancelled' && (
                                <div className="text-center py-4 bg-yellow-100 rounded-lg border border-yellow-200">
                                    <p className="font-medium text-yellow-700">Auction Cancelled</p>
                                    {auction.winner ? (
                                        <p className="text-sm text-yellow-600 mt-1">Winner: {auction.winner.username}</p>
                                    ) : auction.status === 'sold' ? (
                                        <p className="text-sm text-green-600 mt-1">Item Sold</p>
                                    ) : (
                                        <p className="text-sm text-yellow-600 mt-1">No winning bidder</p>
                                    )}
                                </div>
                            )}

                            {countdown.status === 'draft' && (
                                <div className="text-center py-4 bg-yellow-100 rounded-lg border border-yellow-200">
                                    <p className="font-medium text-yellow-700">Auction Pending</p>
                                    {auction.winner ? (
                                        <p className="text-sm text-yellow-600 mt-1">Winner: {auction.winner.username}</p>
                                    ) : auction.status === 'sold' ? (
                                        <p className="text-sm text-green-600 mt-1">Item Sold</p>
                                    ) : (
                                        <p className="text-sm text-yellow-600 mt-1">Needs Admin Approval</p>
                                    )}
                                </div>
                            )}

                            {countdown.status === 'loading' && (
                                <div className="text-center py-4 bg-gray-100 rounded-lg">
                                    <p className="font-medium text-gray-600">Loading auction status...</p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Set Reminder / Watchlist CTA */}
                    {(countdown.status === 'counting-down' ||
                        countdown.status === 'approved') &&
                        (auction.auctionType === 'standard' ||
                            auction.auctionType === 'reserve') && (
                            <button
                                type="button"
                                onClick={handleSetReminder}
                                className={`flex items-center justify-center gap-2 w-full py-3 px-6 rounded-lg border transition-colors ${user && isWatchlisted
                                    ? 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                                    : 'bg-white border-gray-300 text-primary hover:bg-gray-50'
                                    }`}
                            >
                                <Bell size={18} fill={user && isWatchlisted ? 'currentColor' : 'none'} />
                                <span>
                                    {user && isWatchlisted
                                        ? 'Reminder Set'
                                        : 'Set a Reminder'}
                                </span>
                            </button>
                        )}

                    <button
                        type="button"
                        onClick={() => navigate('/delivery-partner-quote')}
                        className="flex items-center justify-center gap-2 w-full bg-[#000] text-white py-3 px-6 cursor-pointer rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#000]/90 transition-colors"
                    >
                        <>
                            <Truck />
                            <span>Request Delivery Quote</span>
                        </>
                    </button>

                    {auction.status === 'sold' && <Link
                        to="/rate-us"
                        className="w-full bg-blue-700 text-white py-3 px-6 rounded-lg hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
                    >
                        <Stars size={16} className="" />
                        Rate Us
                    </Link>}

                    {/* Watchlist Count */}
                    {/* {auction.watchlistCount > 0 && (
                        <p className="text-center bg-white p-3 text-secondary text-sm flex items-center justify-center gap-2 border border-gray-200 rounded-lg">
                            <Users className="w-4 h-4" />
                            <span>{auction.watchlistCount} user{auction.watchlistCount !== 1 ? 's' : ''} watching</span>
                        </p>
                    )} */}

                    {/* <p className="text-center bg-white p-3 text-secondary text-sm flex items-center justify-center gap-2 border border-gray-200 rounded-lg">
                        <ShieldCheck className="w-4 h-4" />
                        <span>{auction.views} views</span>
                    </p> */}

                    {/* Pending Offers Count */}
                    {(auction.pendingOfferCount ?? 0) > 0 && (
                        <p className="text-center bg-white p-3 text-secondary text-sm flex items-center justify-center gap-2 border border-gray-200 rounded-lg">
                            <Banknote className="w-4 h-4" />
                            <span>{auction.pendingOfferCount} pending offer{auction.pendingOfferCount !== 1 ? 's' : ''}</span>
                        </p>
                    )}
                </div>
            </section>

            <PilotPhaseModal
                isOpen={isPilotModalOpen}
                onClose={handlePilotModalClose}
            />

            <ReminderModal
                isOpen={showReminderModal}
                onClose={() => setShowReminderModal(false)}
                auction={auction}
            />

            <BidConfirmationModal
                isOpen={isBidModalOpen}
                onClose={handleCloseBidModal}
                onConfirm={handleConfirmBid}
                bidAmount={bidAmount}
                auction={auction}
                ref={formRef}
            />

            <PaymentMethodModal
                isOpen={isPaymentModalOpen}
                onClose={handleClosePaymentModal}
                onCardAdded={handleCardAdded}
                trackingContext={{
                    listing_id: auction?._id,
                    auction_type: auction?.auctionType,
                    action: pendingAction?.type || 'bid',
                }}
            />

            <AuthBidModal
                isOpen={isAuthModalOpen}
                onClose={() => {
                    setIsAuthModalOpen(false);
                    setPendingAction(null);
                }}
                onAuthSuccess={handleAuthSuccess}
                pendingAction={pendingAction}
            />

            {showProxyBidModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50"
                    onClick={() => setShowProxyBidModal(false)}>
                    <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center pt-3 px-6">
                            <h2 className="text-lg font-semibold text-gray-900">Set a Proxy Bid</h2>
                            <button onClick={() => setShowProxyBidModal(false)}
                                className="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
                        </div>
                        <div className="px-3 pb-3">
                            <ProxyBidSection
                                auction={auction}
                                userCurrency={userCurrency}
                                onClose={() => {
                                    setShowProxyBidModal(false);
                                    setPendingProxyAmount('');
                                }}
                                onPaymentRequired={handleProxyPaymentRequired}
                                initialMaxAmount={pendingProxyAmount}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* {(countdown?.status === 'counting-down' || countdown?.status === 'always-available') &&
                !auction?.winner &&
                auction?.status === 'active' && (
                    <MobileBidBottomBar
                        auction={auction}
                        onBidClick={() => scrollToBidSection()}
                        userCurrency={userCurrency}
                        countdown={countdown}
                    />
                )} */}
        </Container>
    );
}

export default SingleAuction;