import { Heart, Eye, Clock, Shield, Zap, File, Gauge, Settings, MapPin, Users, Gavel, ShoppingCart, HandHelping, HandGrab } from "lucide-react";
import { heroImg } from "../assets";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuctionCountdown from "../hooks/useAuctionCountDown";
import { useWatchlist } from "../hooks/useWatchlist";
import { liveBinDisplayPrice } from "../utils/liveBuyNow";

function AuctionListItem({ auction }) {
    const navigate = useNavigate();
    const [isLiked, setIsLiked] = useState(false);

    const auctionTime = useAuctionCountdown(auction);
    const { isWatchlisted, watchlistCount, loading, toggleWatchlist } = useWatchlist(auction._id);

    const handleWatchlist = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await toggleWatchlist();
    };

    // Check if reserve is met
    const isReserveMet = auction.reserveMet ?? (auction.currentPrice >= auction.reservePrice);
    const isAuctionActive = auction.status === 'active' && auctionTime?.status === 'counting-down';

    // Calculate status badges
    const getStatusBadges = () => {
        const badges = [];

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

        return badges;
    };

    const statusBadges = getStatusBadges();

    // Format auction time remaining
    const formatTimeRemaining = () => {
        if (!auctionTime) return 'Loading...';
        
        if (auction.auctionType === 'buy_now' || auction.auctionType === 'giveaway') {
            return auction.winner ? 'Claimed' : 'Available';
        }
        
        if (auctionTime.status === 'ended' || auction.status === 'ended' || auction.status === 'sold') {
            return 'Ended';
        }
        
        if (auctionTime.status === 'approved') {
            return 'Starting Soon';
        }
        
        if (auctionTime.status === 'draft') {
            return 'Pending';
        }
        
        if (auctionTime.status === 'counting-down') {
            if (auctionTime.days > 0) {
                return `${auctionTime.days}d ${auctionTime.hours}h`;
            } else if (auctionTime.hours > 0) {
                return `${auctionTime.hours}h ${auctionTime.minutes}m`;
            } else {
                return `${auctionTime.minutes}m ${auctionTime.seconds}s`;
            }
        }
        
        return 'Ended';
    };

    // Calculate pending offers
    const pendingOffers = auction?.pendingOfferCount ?? auction?.offers?.filter(o => o.status === 'pending').length ?? 0;

    if (!auctionTime) return null;

    // Determine button text based on auction type
    const getButtonText = () => {
        if (!isAuctionActive) return 'View Details';
        if (auction.auctionType === 'buy_now') return 'Buy Now';
        if (auction.auctionType === 'giveaway') return 'Claim Now';
        return 'Place Bid';
    };

    // Determine button icon
    const getButtonIcon = () => {
        if (auction.auctionType === 'buy_now') return <ShoppingCart size={16} className="text-white" />;
        if (auction.auctionType === 'giveaway') return <HandGrab size={16} className="text-white" />;
        return <Gavel size={16} className="text-white" />;
    };

    return (
        <div
            className="bg-white border border-gray-200 p-3 hover:bg-gray-50 transition-colors duration-150 cursor-pointer group"
            onClick={() => navigate(`/auction/${auction._id}`)}
        >
            {/* Mobile: Stack, Desktop: Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Image - Mobile: larger, Desktop: compact */}
                <div className="sm:w-20 sm:h-16 w-full h-40 sm:flex-shrink-0 relative">
                    <img
                        src={auction.photos?.[0]?.url || heroImg}
                        alt={auction.title}
                        className="w-full h-full object-cover rounded sm:rounded"
                    />
                    
                    {/* Status Badges - Only show first 2 on mobile */}
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1 sm:hidden">
                        {statusBadges.slice(0, 2).map((badge, index) => {
                            const IconComponent = badge.icon;
                            return (
                                <span
                                    key={index}
                                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${badge.color}`}
                                >
                                    <IconComponent size={8} />
                                    <span className="truncate max-w-[60px]">{badge.label}</span>
                                </span>
                            );
                        })}
                        {statusBadges.length > 2 && (
                            <span className="bg-gray-800/70 text-white px-1.5 py-0.5 rounded-full text-[10px]">
                                +{statusBadges.length - 2}
                            </span>
                        )}
                    </div>
                    
                    {/* Views counter */}
                    {/* <div className="absolute bottom-2 right-2 bg-black/70 text-white px-1.5 py-0.5 rounded-full text-[10px] flex items-center gap-1 sm:hidden">
                        <Eye size={10} />
                        {auction.views?.toLocaleString() || 0}
                    </div> */}
                </div>

                {/* Content - Mobile: full width, Desktop: flex-1 */}
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                    {/* Title and Category */}
                    <div className="mb-2 sm:mb-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <Link
                                to={`/auction/${auction._id}`}
                                className="font-semibold text-base sm:text-sm text-gray-900 hover:text-primary truncate"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {auction.title}
                            </Link>
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded inline-block w-fit">
                                {auction.categories?.[1] || auction.categories?.[0] || 'General'}
                            </span>
                        </div>
                    </div>

                    {/* Info Grid - Desktop: inline, Mobile: grid */}
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-4 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                            <MapPin size={12} />
                            <span className="truncate">{auction.location || 'Location N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <File size={12} />
                            <span className="truncate">{auction?.specifications?.registration || auction?.specifications?.year || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Gauge size={12} />
                            <span>{auction?.specifications?.miles || auction?.specifications?.mileage || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1 col-span-2 sm:col-auto">
                            <Users size={12} />
                            <span>
                                {auction.auctionType === 'buy_now' || auction.auctionType === 'giveaway' 
                                    ? `${pendingOffers} offers` 
                                    : `${auction.bidCount || 0} bids`} • {auction.watchlistCount || 0} watching
                            </span>
                        </div>
                    </div>
                    
                    {/* Desktop-only badges */}
                    <div className="hidden sm:flex items-center gap-2 mt-2">
                        {statusBadges.slice(0, 3).map((badge, index) => {
                            const IconComponent = badge.icon;
                            return (
                                <span
                                    key={index}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}
                                >
                                    <IconComponent size={12} />
                                    {badge.label}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* Mobile: Right side info - stack below, Desktop: inline */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:gap-1 w-full sm:w-auto">
                    {/* Price */}
                    <div className="text-sm font-bold text-green-600">
                        {(auction.auctionType === 'buy_now' && auction.buyNowPrice) 
                            ? auction.buyNowPrice.toLocaleString() 
                            : (auction.currentPrice || auction.startPrice)?.toLocaleString()} kr
                        {auction.auctionType === 'buy_now' && auction.buyNowPrice && 
                            <span className="text-xs font-normal text-gray-500 ml-1">Buy Now</span>
                        }
                    </div>
                    
                    {/* Timer/Status */}
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock size={12} />
                        <span className={auctionTime?.status === 'ended' ? 'text-red-500' : ''}>
                            {formatTimeRemaining()}
                        </span>
                    </div>
                    
                    {/* Views - Desktop only */}
                    {/* <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
                        <Eye size={12} />
                        <span>{auction.views?.toLocaleString() || 0} views</span>
                    </div> */}
                </div>

                {/* Actions */}
                <div className="flex sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/auction/${auction._id}`);
                        }}
                        className="px-4 py-2 sm:px-3 sm:py-1.5 bg-gradient-to-r from-[#D19F3E] to-[#E8B86B] text-white text-sm sm:text-xs font-medium rounded hover:from-[#D19F3E]/90 hover:to-[#E8B86B]/90 flex-1 sm:flex-none flex items-center justify-center gap-1"
                    >
                        {getButtonIcon()}
                        {getButtonText()}
                    </button>
                    {auction?.liveBuyNow?.available && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/auction/${auction._id}?buy=1`);
                            }}
                            className="px-4 py-2 sm:px-3 sm:py-1.5 border-2 border-[#D19F3E] bg-[#FFF7EA] text-[#072342] text-sm sm:text-xs font-semibold rounded flex-1 sm:flex-none flex items-center justify-center gap-1"
                        >
                            <ShoppingCart size={14} />
                            Buy It Now {(auction.displayCurrency || 'EUR') === 'GBP' ? '£' : '€'}{liveBinDisplayPrice(auction)?.toLocaleString('en-IE', { maximumFractionDigits: 0 })}
                        </button>
                    )}
                    <button
                        onClick={handleWatchlist}
                        className={`p-2 sm:p-1.5 rounded transition-colors ${
                            isWatchlisted
                                ? 'text-red-500 bg-red-50 hover:bg-red-100'
                                : 'text-gray-500 hover:text-red-500 hover:bg-red-50'
                        }`}
                        title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
                    >
                        <Heart size={20} className="sm:w-4 sm:h-4" fill={isWatchlisted ? 'currentColor' : 'none'} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AuctionListItem;