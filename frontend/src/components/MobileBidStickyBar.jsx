import { Gavel, Zap, Banknote, Clock, Gift, Users, ShieldCheck, Bell, Loader, Truck, Info, CheckSquare, Gauge } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import QuickBid from './bidding/QuickBid';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const MobileBidStickyBar = ({
  currentBid,
  timeRemaining,
  onBidClick,          // still used for "View Auction Details" on non-active
  convertedBuyNowPrice,
  onBuyNowClick,
  onMakeOfferClick,
  allowOffers,
  auctionType,
  status,
  auction,
  userCurrency = 'EUR',
  onSetReminder,
  isWatchlisted,
  watchlistCount,
  views,
  // ✅ NEW PROPS for inline mobile bidding
  bidAmount,
  setBidAmount,
  bidding,
  countdown,
  onProxyBidClick,
  // One-tap bidding
  quickMin,
  quickStep,
  onQuickBid,
  isLeading = false,
}) => {
  const { days, hours, minutes, seconds, status: timeStatus } = timeRemaining;
  const isActive = timeStatus === 'counting-down' || timeStatus === 'always-available';
  const timeRemained = auction?.endDate ? new Date(auction.endDate) - new Date() : 0;

  const [liveTimer, setLiveTimer] = useState({
    days: days || 0,
    hours: hours || 0,
    minutes: minutes || 0,
    seconds: seconds || 0,
  });

  const navigate = useNavigate();
  const { user } = useAuth();

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

  useEffect(() => {
    if (!isActive || timeStatus !== 'counting-down') return;
    const interval = setInterval(() => {
      setLiveTimer(prev => {
        let { days, hours, minutes, seconds } = prev;
        if (seconds > 0) seconds--;
        else {
          seconds = 59;
          if (minutes > 0) minutes--;
          else {
            minutes = 59;
            if (hours > 0) hours--;
            else {
              hours = 23;
              if (days > 0) days--;
            }
          }
        }
        return { days, hours, minutes, seconds };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, timeStatus]);

  useEffect(() => {
    if (isActive && timeStatus === 'counting-down') {
      setLiveTimer({
        days: days || 0,
        hours: hours || 0,
        minutes: minutes || 0,
        seconds: seconds || 0,
      });
    }
  }, [days, hours, minutes, seconds, isActive, timeStatus]);

  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: userCurrency || 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const currencySymbol = userCurrency === 'GBP' ? '£' : '€';

  const showBuyNow = auctionType === 'buy_now' && convertedBuyNowPrice && isActive && !auction?.winner && auction?.status === 'active';
  const showMakeOffer = allowOffers && isActive && !auction?.winner && auction?.status === 'active';
  const showBidForm = (auctionType === 'standard' || auctionType === 'reserve') && isActive && !auction?.winner && auction?.status === 'active';
  const isGiveaway = auctionType === 'giveaway';
  const showGiveawayClaim = isGiveaway && isActive && !auction?.winner && auction?.status === 'active';
  const showProxyBid = showBidForm && auction?.allowProxyBidding;

  const isReserveMet = !!auction?.reserveMet;

  const formatEndDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Keep the bid buttons on screen: when the bid controls in this card scroll
  // out of view (e.g. looking at photos or the description), a slim bar with
  // the price, time left and the same buttons sits above the bottom menu.
  const bidControlsRef = useRef(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [navHeight, setNavHeight] = useState(0);
  useEffect(() => {
    const el = bidControlsRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setControlsVisible(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [showBidForm]);
  useEffect(() => {
    const measure = () => setNavHeight(document.querySelector('.app-bottom-nav')?.offsetHeight || 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const timeLeftShort = (() => {
    const { days: d, hours: h, minutes: m, seconds: sec } = liveTimer;
    const pad = (n) => String(n).padStart(2, '0');
    if (Number(d) > 0) return `${d}d ${pad(h)}h`;
    if (Number(h) > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
    return `${pad(m)}:${pad(sec)}`;
  })();
  const showFixedBar = showBidForm && !controlsVisible && typeof document !== 'undefined';
  useEffect(() => {
    document.body.classList.toggle('has-bid-bar', showFixedBar);
    return () => document.body.classList.remove('has-bid-bar');
  }, [showFixedBar]);

  return (
    <>
    {showFixedBar && createPortal(
      <div
        className="lg:hidden fixed left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_10px_rgba(0,0,0,0.12)] px-3 pt-2 pb-2"
        style={{ bottom: navHeight }}
      >
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-semibold text-gray-900 text-sm">
            {formatCurrency(currentBid)}
            {isLeading && <span className="ml-2 text-green-700 font-medium text-xs">You're winning</span>}
            {userBidStatus === 'outbid' && <span className="ml-2 text-red-600 font-medium text-xs">Outbid</span>}
          </span>
          <span className="flex items-center gap-1 text-gray-700 font-medium tabular-nums">
            <Clock size={13} /> {timeLeftShort}
          </span>
        </div>
        <QuickBid
          compact
          minBid={quickMin}
          step={quickStep}
          symbol={currencySymbol}
          amount={bidAmount}
          setAmount={setBidAmount}
          onBid={onQuickBid}
          bidding={bidding}
          isLeading={isLeading}
        />
      </div>,
      document.body
    )}
    <div className="lg:hidden bg-white border border-gray-200 rounded-lg shadow-sm mb-6 mt-8">
      <div className="p-4">

        {/* Top Row: Price & Timer */}
        <div className="flex justify-between items-start overflow-hidden mb-4 gap-4">
          <div className="flex flex-col flex-1">
            <div className="flex items-start gap-2 text-sm text-gray-600 mb-1">
              <div>
                <p className="text-xs text-black font-semibold mb-1">
                  {isGiveaway ? '' : auctionType === 'buy_now' ? 'Buy Now Price' : auction.status === 'sold' ? 'Final Bid' : auction?.bidCount > 0 ? 'Current Bid' : 'Starting Bid'}
                </p>
                <p className="text-xl font-bold text-gray-900">
                  {isGiveaway ? (
                    <span className="text-green-600">GIVEAWAY 🎁</span>
                  ) : auctionType === 'buy_now' ? (
                    formatCurrency(auction?.convertedBuyNowPrice || convertedBuyNowPrice)
                  ) : auction.status === 'sold' ? (
                    formatCurrency(auction?.convertedFinalPrice || auction?.convertedCurrentPrice)
                  ) : (
                    formatCurrency(currentBid)
                  )}
                </p>
              </div>
              {userBidStatus === "highest" && (
                <span className="text-green-700">
                  <CheckSquare size={20} />
                </span>
              )}
              {userBidStatus === "outbid" && (
                <span className="text-red-700">
                  <Gavel size={20} />
                </span>
              )}
            </div>

            {auction.auctionType === 'reserve' && timeRemained > 0 && timeRemained > 24 * 60 * 60 * 1000 && (
              <div className={`mt-2 inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium w-fit ${isReserveMet
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-orange-50 text-blue-600 border border-blue-200'
                }`}>
                {isReserveMet ? '✓ Reserve Met' : 'Reserve Applies'}
              </div>
            )}

            <p className="mt-2 bg-blue-50 text-blue-600 border border-blue-300 px-2 py-1 rounded font-medium text-xs flex items-center gap-2 w-fit">{auction?.vatIncluded ? 'VAT to be added' : 'No VAT  to be added'}</p>
          </div>

          <div className="flex flex-col items-start flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-gray-700 font-medium mb-1">
              <Clock size={14} />
              <span>
                {timeStatus === 'counting-down' && 'Auction Ends In'}
                {timeStatus === 'always-available' && (auctionType === 'giveaway' ? 'Giveaway Open' : 'Available Now')}
                {timeStatus === 'approved' && 'Auction Starts Soon'}
                {timeStatus === 'ended' && (auction?.status === 'reserve_not_met' ? 'Reserve Not Met' : auction?.status === 'sold' ? 'Auction Sold' : 'Auction Ended')}
                {timeStatus === 'cancelled' && 'Auction Cancelled'}
                {timeStatus === 'draft' && 'Pending Approval'}
                {timeStatus === 'loading' && 'Loading Status...'}
              </span>
            </div>

            {timeStatus === 'counting-down' && (
              <>
                <div className="flex items-end gap-3 text-xl font-bold text-gray-900">
                  <span>{String(liveTimer.days).padStart(2, '0')}</span>
                  <span className="text-gray-500 text-lg">:</span>
                  <span>{String(liveTimer.hours).padStart(2, '0')}</span>
                  <span className="text-gray-500 text-lg">:</span>
                  <span>{String(liveTimer.minutes).padStart(2, '0')}</span>
                  <span className="text-gray-500 text-lg">:</span>
                  <span>{String(liveTimer.seconds).padStart(2, '0')}</span>
                </div>
                <div className="flex justify-between w-full text-[12px] text-gray-500 mt-0.5 gap-2">
                  <span>Days</span>
                  <span>Hours</span>
                  <span>Minutes</span>
                  <span>Seconds</span>
                </div>
                {auction?.endDate && (
                  <p className="text-[12px] text-gray-500 mt-1">Ends: {formatEndDate(auction.endDate)}</p>
                )}
              </>
            )}

            {timeStatus === 'always-available' && (
              <>
                <p className="text-sm font-semibold text-green-600">
                  {auctionType === 'giveaway' ? 'Open for Entry' : 'Ready to Purchase'}
                </p>
                <p className="text-[12px] text-gray-500 mt-1">
                  {auctionType === 'giveaway' ? 'Claim this item anytime' : 'Buy instantly at any time'}
                </p>
              </>
            )}

            {timeStatus === 'approved' && (
              <>
                <p className="text-sm font-semibold text-blue-600">Starting Soon</p>
                {auction?.startDate && (
                  <p className="text-[12px] text-gray-500 mt-1">Starts: {formatEndDate(auction.startDate)}</p>
                )}
              </>
            )}

            {timeStatus === 'ended' && (
              <>
                {auction?.status === 'sold' && <p className="text-sm font-semibold text-green-600">Sold ✓</p>}
                {auction?.status === 'sold_buy_now' && <p className="text-sm font-semibold text-green-600">Sold via Buy Now ✓</p>}
                {auction?.status === 'reserve_not_met' && <p className="text-sm font-semibold text-orange-600">Reserve Not Met</p>}
                {!['sold', 'sold_buy_now', 'reserve_not_met'].includes(auction?.status) && (
                  <p className="text-sm font-semibold text-gray-600">Ended</p>
                )}
                {auction?.endDate && (
                  <p className="text-[12px] text-gray-500 mt-1">
                    {auction?.status === 'sold' || auction?.status === 'sold_buy_now'
                      ? `Sold at: ${formatEndDate(auction.endDate)}`
                      : `Ended: ${formatEndDate(auction.endDate)}`}
                  </p>
                )}
              </>
            )}

            {timeStatus === 'cancelled' && (
              <>
                <p className="text-sm font-semibold text-red-600">Cancelled</p>
                <p className="text-[12px] text-gray-500 mt-1">This auction has been cancelled</p>
              </>
            )}

            {timeStatus === 'draft' && (
              <>
                <p className="text-sm font-semibold text-orange-600">Pending Approval</p>
                <p className="text-[12px] text-gray-500 mt-1">Awaiting admin review</p>
              </>
            )}

            {timeStatus === 'loading' && (
              <p className="text-sm font-semibold text-gray-500">Loading...</p>
            )}
          </div>
        </div>

        {/* Last 24 hours, no bids yet: say a reserve applies (the progress bar below starts with the first bid) */}
        {auction.auctionType === "reserve" &&
          auction.status === "active" &&
          timeStatus === "counting-down" &&
          timeRemained > 0 &&
          timeRemained < 24 * 60 * 60 * 1000 &&
          auction.hasReserve &&
          !(auction.bidCount > 0) && (
            <p className="mt-2 inline-flex text-xs font-medium px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-200">
              Reserve Applies
            </p>
          )}

        {/* ----- RESERVE PROGRESS INDICATOR (only in last 24h) ----- */}
        {auction.auctionType === "reserve" &&
          auction.status === "active" &&
          timeStatus === "counting-down" &&
          timeRemained > 0 && // still active
          timeRemained < 24 * 60 * 60 * 1000 && // last 24 hours
          auction.hasReserve &&
          auction.bidCount > 0 && // only show if there is at least one bid
          (() => {
            // Reserve amount is never sent to the browser; the server provides a
            // rounded progress value and a met/not-met flag instead.
            const reserveProgress = Number(auction.reserveProgress) || 0;
            const reserveMet = !!auction.reserveMet;

            return (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-secondary">
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

        {/* ============ One-tap bidding ============ */}
        {showBidForm && (
          <div ref={bidControlsRef} className="w-full mt-4">
            <QuickBid
              minBid={quickMin}
              step={quickStep}
              symbol={currencySymbol}
              amount={bidAmount}
              setAmount={setBidAmount}
              onBid={onQuickBid}
              bidding={bidding}
              isLeading={isLeading}
            />
          </div>
        )}

        {/* Secondary actions row — proxy bid */}
        {showProxyBid && (
          <div className="mt-2">
            <button
              onClick={onProxyBidClick}
              className="flex items-center justify-center gap-2 w-full border bg-blue-600 border-blue-600 text-white hover:bg-blue-700 py-2.5 px-4 text-sm rounded-md transition-colors"
            >
              <Gauge size={18} />
              <span>Set a Proxy Bid (Auto-bid)</span>
            </button>
          </div>
        )}

        {onSetReminder && isActive && <button
          type="button"
          onClick={onSetReminder}
          className={`mt-2 w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 px-4 rounded-lg border transition-colors ${user && isWatchlisted
            ? 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
            : 'bg-white border-gray-300 text-primary hover:bg-gray-100'
            }`}
        >
          <Bell size={14} fill={user && isWatchlisted ? 'currentColor' : 'none'} />
          <span>
            {user && isWatchlisted
              ? 'Reminder Set'
              : 'Set a Reminder'}
          </span>
        </button>}

        <button
          type="button"
          onClick={() => navigate('/delivery-partner-quote')}
          className="mt-2 w-full bg-[#000] hover:bg-[#000]/90 text-white py-2.5 px-4 rounded-md flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-60 whitespace-nowrap transition-colors"
        >
          <>
            <Truck size={16} />
            <span>Request Delivery Quote</span>
          </>
        </button>

        {/* Middle Row: Other Action Buttons */}
        {(showMakeOffer || showBuyNow || showGiveawayClaim || (!isActive && !auction?.winner)) && (
          <div className="flex gap-2 w-full mt-3">
            {/* {showMakeOffer && (
              <button
                onClick={onMakeOfferClick}
                className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2.5 px-4 rounded-md cursor-pointer flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              >
                <Banknote size={18} />
                <span>Make an Offer</span>
              </button>
            )} */}

            {showBuyNow && (
              <button
                onClick={onBuyNowClick}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 px-4 rounded-md cursor-pointer flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              >
                <Zap size={18} />
                <span>Buy Now</span>
              </button>
            )}

            {showGiveawayClaim && (
              <button
                onClick={onBuyNowClick}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 px-4 rounded-md cursor-pointer flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              >
                <Gift size={18} />
                <span>Enter Giveaway 🎁</span>
              </button>
            )}

            {/* {!isActive && !auction?.winner && (
              <button
                onClick={onBidClick}
                className="flex-1 bg-gray-700 hover:bg-gray-500 text-white py-2.5 px-4 rounded-md cursor-pointer flex items-center justify-center text-sm font-medium transition-colors"
              >
                View Auction Details
              </button>
            )} */}
          </div>
        )}

        {/* Bottom Row: Stats & Reminder */}
        {/* <div className="flex items-center justify-between text-[13px] font-medium text-gray-700 mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Users size={14} />
              {watchlistCount || auction?.watchlistCount || 0} watching
            </span>
          </div>

          {onSetReminder && (
            <button
              onClick={onSetReminder}
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900 font-medium"
            >
              <Bell size={14} fill={isWatchlisted ? 'currentColor' : 'none'} />
              {isWatchlisted ? 'Reminder Set' : 'Set a Reminder'}
            </button>
          )}
        </div> */}

      </div>
    </div>
    </>
  );
};

export default MobileBidStickyBar;