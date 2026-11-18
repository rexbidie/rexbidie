import { Gavel, Heart, MapPin, Eye, Users, Shield, Clock, Zap, File, Gauge, Settings, ShoppingCart, HandHelping, HandGrab, Star } from "lucide-react";
import ReserveBadge from "./bidding/ReserveBadge";
import { heroImg } from "../assets";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuctionCountdown from "../hooks/useAuctionCountDown";
import { useWatchlist } from "../hooks/useWatchlist";
import { useAuth } from "../contexts/AuthContext";
import { liveBinDisplayPrice } from "../utils/liveBuyNow";

function AuctionCard({ auction }) {
    const navigate = useNavigate();
    const [tilt, setTilt] = useState({ x: 0, y: 0 });
    const [isLiked, setIsLiked] = useState(false);

    const { user } = useAuth();
    const userCurrency = user?.currency || 'EUR';

    const threshold = 5;

    const handleMove = (e) => {
        const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - left) / width - 0.5;
        const y = (e.clientY - top) / height - 0.5;
        setTilt({ x: y * -threshold, y: x * threshold });
    };

    const [auctionEndDate] = useState(() => new Date(auction.endDate));
    const auctionTime = useAuctionCountdown(auction);
    const { isWatchlisted, watchlistCount, loading, toggleWatchlist } = useWatchlist(auction._id);

    const handleWatchlist = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleWatchlist();
    };

    // Check if reserve is met
    const isReserveMet = !!auction.reserveMet;
    const isAuctionActive = auction.status === 'active' && !auctionTime.completed;

    // Calculate status badges
    const getStatusBadges = () => {
        const badges = [];

        if (auction.status === 'active') {
            badges.push({
                label: 'Live',
                icon: Clock,
                color: 'bg-green-100 text-green-700 border-green-200'
            });
        }

        if (auction.status === 'approved') {
            badges.push({
                label: 'Starting Soon',
                icon: Clock,
                color: 'bg-orange-100 text-orange-700 border-orange-200'
            });
        }

        if (auction.status === 'ended') {
            badges.push({
                label: 'Ended',
                icon: Clock,
                color: 'bg-red-100 text-red-700 border-red-200'
            });
        }

        if (auction.status === 'sold') {
            badges.push({
                label: 'Sold',
                icon: Clock,
                color: 'bg-green-100 text-green-700 border-green-200'
            });
        }

        if (auction.auctionType === 'reserve' && isReserveMet) {
            badges.push({
                label: 'Reserve Met',
                icon: Shield,
                color: 'bg-green-100 text-green-700 border-green-200'
            });
        } else if (auction.auctionType === 'reserve') {
            badges.push({
                label: 'Reserve',
                icon: Shield,
                color: 'bg-orange-100 text-orange-700 border-orange-200'
            });
        }

        if (auction.auctionType === 'standard') {
            badges.push({
                label: 'No Reserve',
                icon: Shield,
                color: 'bg-green-100 text-green-700 border-green-200'
            });
        }

        if (auction.auctionType === 'buy_now') {
            badges.push({
                label: 'Buy Now',
                icon: ShoppingCart,
                color: 'bg-blue-100 text-blue-700 border-blue-200'
            });
        }

        if (auction.auctionType === 'giveaway') {
            badges.push({
                label: 'Giveaway',
                icon: HandHelping,
                color: 'bg-blue-100 text-blue-700 border-blue-200'
            });
        }

        // if (auction.autoExtend) {
        //     badges.push({
        //         label: 'Auto Extend',
        //         icon: Zap,
        //         color: 'bg-blue-100 text-blue-700 border-blue-200'
        //     });
        // }

        return badges;
    };

    const statusBadges = getStatusBadges();

    // Inside AuctionCard or a shared utils file
    const formatDateTime = (date) => {
        if (!date) return '';
        return date.toLocaleString('en-GB', {
            weekday: 'short',    // e.g., "Mon"
            day: 'numeric',
            month: 'short',      // e.g., "Dec"
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    const handleAuctionClick = () => {
        sessionStorage.setItem("returnToAuction", auction._id);
        sessionStorage.setItem(
            "returnToAuctionScrollY",
            window.scrollY.toString()
        );
        sessionStorage.setItem(
            "returnToAuctionLoadedCount",
            document.querySelectorAll("[id^='auction-']").length.toString()
        );
    };

    if (!auctionTime) return (
        <div className="border border-gray-200 p-4 h-full bg-white rounded-xl shadow-lg animate-pulse">
            <div className="w-full h-56 bg-gray-200 rounded-tr-3xl rounded-bl-3xl mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="flex gap-2">
                <div className="h-6 bg-gray-200 rounded w-16"></div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
            </div>
        </div>
    );

    return (
        <div
            className="border border-gray-200 p-4 h-full bg-white rounded-xl shadow-lg transition-all duration-200 ease-out flex flex-col hover:shadow-xl group"
            onMouseMove={handleMove}
            onMouseLeave={() => setTilt({ x: 0, y: 0 })}
            style={{ transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        >
            {/* Image Section */}
            <Link to={`/auction/${auction._id}`} onClick={handleAuctionClick} className="relative overflow-hidden rounded-tr-3xl rounded-bl-3xl">
                <img
                    src={auction.photos?.[0]?.thumbUrl || auction.photos?.[0]?.url || heroImg}
                    alt={auction.title}
                    width={auction.photos?.[0]?.thumbWidth || undefined}
                    height={auction.photos?.[0]?.thumbHeight || undefined}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-56 object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* Status Badges */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    <div>
                        {auction.isFeatured && (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full inline-flex font-medium">
                                <Star size={12} className="mr-1" /> Featured
                            </span>
                        )}
                    </div>
                    {statusBadges.map((badge, index) => {
                        const IconComponent = badge.icon;
                        return (
                            <span
                                key={index}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.color}`}
                            >
                                <IconComponent size={12} />
                                {badge.label}
                            </span>
                        );
                    })}
                </div>

                {/* Countdown Timer & Date */}
                {auction.auctionType !== 'buy_now' && auction.auctionType !== 'giveaway' && (
                    <div className="absolute bottom-3 left-3 right-3 bg-white/90 rounded-lg px-3 py-2">
                        {/* Timer row */}
                        <div className="flex items-center justify-center gap-1 text-sm">
                            <Clock size={14} className="flex-shrink-0" />
                            {!auctionTime.completed ? (
                                <>
                                    <span>{auctionTime.days}D</span>
                                    <span>:</span>
                                    <span>{auctionTime.hours}H</span>
                                    <span>:</span>
                                    <span>{auctionTime.minutes}M</span>
                                    <span>:</span>
                                    <span>{auctionTime.seconds}S</span>
                                </>
                            ) : (
                                <span className="font-medium text-red-600">Auction Ended</span>
                            )}
                        </div>

                        {/* Start / End date line */}
                        <div className="text-[12px] text-gray-600 text-center mt-0.5 leading-tight">
                            {auction.status === 'approved' && auction.startDate && (
                                <>Starts: {formatDateTime(new Date(auction.startDate))}</>
                            )}
                            {auction.status === 'active' && auction.endDate && (
                                <>Ends: {formatDateTime(new Date(auction.endDate))}</>
                            )}
                            {auction.status === 'ended' && auction.endDate && (
                                <>Ended: {formatDateTime(new Date(auction.endDate))}</>
                            )}
                        </div>
                    </div>
                )}

                {/* Views Counter */}
                {/* <div className="absolute top-3 right-3 bg-black/70 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                    <Eye size={12} />
                    {auction.views?.toLocaleString() || 0}
                </div> */}
            </Link>

            {/* Content Section */}
            <div className="mt-4 flex flex-col flex-1">
                {/* Title */}
                <Link
                    to={`/auction/${auction._id}`}
                    onClick={handleAuctionClick}
                    className="font-semibold text-lg leading-tight mb-2 line-clamp-2 hover:text-primary transition-colors"
                >
                    {auction.title}
                </Link>

                {/* Location */}
                <div className="flex items-center gap-1 text-sm text-gray-600 mb-3">
                    <MapPin size={14} />
                    <span className="truncate">{auction.location}</span>
                </div>

                {/* Auction Info Grid For Non Giveaway */}
                {auction?.auctionType !== 'giveaway' &&
                    <>
                        <div className="grid grid-cols-2 gap-3 mb-4">

                            <div className="text-center p-2 bg-gray-50 rounded-lg">
                                <div className="text-xs text-gray-600 mb-1">{auction.status === 'sold' ? 'Final Bid' : auction.bidCount > 0 ? 'Current Bid' : 'Starting Bid'}</div>
                                <div className="font-bold text-lg text-green-600">
                                    {userCurrency === 'GBP' ? '£' : '€'}{(auction.status === 'sold' ? auction.convertedFinalPrice : auction.bidCount > 0 ? auction.convertedCurrentPrice : auction.convertedStartPrice)?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                                </div>
                            </div>

                            {/* {
                                auction.auctionType !== 'buy_now' && (
                                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                                        <div className="text-xs text-gray-600 mb-1">Bids</div>
                                        <div className="font-bold text-lg text-primary flex items-center justify-center gap-1">
                                            <Users size={16} />
                                            {auction.status === 'approved' ? '--' : (auction.bidCount || 0)}
                                        </div>
                                    </div>
                                )
                            } */}

                            {
                                auction.auctionType !== 'buy_now' && (
                                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                                        <div className="text-xs text-gray-600 mb-1">Bid increment</div>
                                        <div className="font-bold text-lg text-primary flex items-center justify-center gap-1">
                                            {/* <Users size={16} /> */}
                                            {userCurrency === 'GBP' ? '£' : '€'}{auction.convertedBidIncrement?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                                        </div>
                                    </div>
                                )
                            }

                            {
                                (auction.auctionType === 'buy_now') && (
                                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                                        <div className="text-xs text-gray-600 mb-1">Buy Now</div>
                                        <div className="font-bold text-lg text-primary flex items-center justify-center gap-1">
                                            {userCurrency === 'GBP' ? '£' : '€'}{auction?.convertedBuyNowPrice?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                                        </div>
                                    </div>
                                )
                            }
                        </div>

                        {/* Reserve progress, last 24 hours before closing */}
                        <ReserveBadge auction={auction} hideNotMet className="-mt-2 mb-3" />

                        <div className="text-xs text-gray-500 text-center flex items-center justify-around">
                            {/* <div>
                                Bid increment: {userCurrency === 'GBP' ? '£' : '€'}{auction.convertedBidIncrement?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                            </div> */}
                            {/* <div className="text-xs text-gray-500 text-center">
                                {auction.watchlistCount || 0} user{auction.watchlistCount !== 1 ? 's' : ''} watching
                            </div> */}

                            {/* <div className="text-xs text-gray-500 text-center">
                                Starting @ {userCurrency === 'GBP' ? '£' : '€'}{(auction.convertedCurrentPrice || auction.convertedStartPrice)?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                            </div> */}

                            {/* <div className="text-center p-2 bg-gray-50 rounded-lg">
                                <div className="text-xs text-gray-600 mb-1">{auction.status === 'sold' ? 'Final Bid' : auction.bidCount > 0 ? 'Current Bid' : 'Starting Bid'}</div>
                                <div className="font-bold text-lg text-green-600">
                                    {userCurrency === 'GBP' ? '£' : '€'}{(auction.convertedCurrentPrice || auction.convertedStartPrice)?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                                </div>
                            </div> */}
                        </div>
                    </>
                }

                {/* Auction Info Grid For Giveaway */}
                {auction?.auctionType === 'giveaway' &&
                    <>
                        <div className="grid grid-cols-2 gap-3 mb-4">

                            <div className="text-center p-2 bg-gray-50 rounded-lg">
                                <div className="text-xs text-gray-600 mb-1">{auction.status === 'sold' ? 'Final Price' : auction.bidCount > 0 ? 'Starting Price' : 'Starting Price'}</div>
                                <div className="font-bold text-lg text-green-600">
                                    FREE
                                </div>
                            </div>

                            <div className="text-center p-2 bg-gray-50 rounded-lg">
                                <div className="text-xs text-gray-600 mb-1">Participants</div>
                                <div className="font-bold text-lg text-primary flex items-center justify-center gap-1">
                                    <Users size={16} />
                                    {auction?.participantCount ?? auction?.participants?.length ?? 0}
                                </div>
                            </div>
                        </div>

                        <div className="text-xs text-gray-500 text-center flex items-center justify-around">
                            <div className="text-xs text-gray-500 text-center">
                                {auction.watchlistCount || 0} user{auction.watchlistCount !== 1 ? 's' : ''} watching
                            </div>
                        </div>
                    </>
                }
            </div>

            {/* Button Section */}
            <div className="flex gap-2 items-center mt-auto pt-3 border-t border-gray-100">
                <Link
                    // disabled={!isAuctionActive}
                    to={`/auction/${auction._id}`}
                    onClick={handleAuctionClick}
                    className={`flex-1 py-3 px-4 cursor-pointer text-white rounded-lg flex gap-2 items-center justify-center transition-all ${isAuctionActive
                        ? 'bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] bg-[#E8B86B]/90 shadow-md hover:shadow-lg'
                        : 'bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] hover:from-[#D19F3E]/90 hover:to-[#E8B86B]/90 shadow-md hover:shadow-lg'
                        }`}
                >
                    {
                        auction.auctionType === 'buy_now' ? <ShoppingCart size={18} className="text-white" /> : auction.auctionType === 'giveaway' ? <HandGrab size={18} className="text-white flex-shrink-0" /> : <Gavel size={18} className="text-white" />
                    }
                    <span className="font-medium text-white">
                        {!isAuctionActive ? 'View Auction' : auction?.auctionType === 'buy_now' ? 'Buy Now' : auction?.auctionType === 'giveaway' ? 'Enter Now' : 'Place Bid'}
                    </span>
                </Link>

                {/* Watchlist Button */}
                <button
                    onClick={handleWatchlist}
                    className={`p-3 rounded-lg cursor-pointer transition-all relative ${isWatchlisted
                        ? 'bg-red-50 text-red-500 border border-red-200 shadow-md hover:bg-red-100'
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                        }`}
                    title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                    <Heart
                        size={20}
                        fill={isWatchlisted ? 'currentColor' : 'none'}
                    />
                </button>

            </div>

            {/* Buy It Now during the auction (backend utils/liveBuyNow.js) */}
            {auction?.liveBuyNow?.available && (
                <Link
                    to={`/auction/${auction._id}?buy=1`}
                    onClick={handleAuctionClick}
                    className="mt-2 flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-[#D19F3E] bg-[#FFF7EA] px-4 py-2 font-semibold text-[#072342] transition hover:bg-[#FDF2DD]"
                >
                    <ShoppingCart size={18} />
                    Buy It Now {userCurrency === 'GBP' ? '£' : '€'}{liveBinDisplayPrice(auction)?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                </Link>
            )}

            {/* Watchlist Count */}
            {/* {auction.watchlistCount > 0 && (
                <div className="text-xs text-gray-500 text-center mt-2">
                    {auction.watchlistCount} user{auction.watchlistCount !== 1 ? 's' : ''} watching
                </div>
            )} */}
        </div>
    );
}

export default AuctionCard;