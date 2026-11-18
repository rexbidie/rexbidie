import { getServerNow } from "../../utils/serverClock";

// Reserve progress for listing cards (All Listings, Catalogue). Shown only in
// the last 3 hours before a reserve lot closes, like on the listing page.
// The reserve itself is never sent to the browser: the server sends a progress
// figure rounded down to 10% and a met / not-met flag.
// Matches RESERVE_PROGRESS_WINDOW_MS on the server, which only sends the figure then.
export const RESERVE_PROGRESS_WINDOW_MS = 3 * 60 * 60 * 1000;

const showReserveProgress = (auction, now = getServerNow()) => {
    if (!auction || auction.auctionType !== "reserve" || auction.status !== "active" || !auction.hasReserve) return false;
    const left = new Date(auction.endDate).getTime() - now;
    return left > 0 && left < RESERVE_PROGRESS_WINDOW_MS;
};

const ReserveProgress = ({ auction, className = "" }) => {
    if (!showReserveProgress(auction)) return null;

    if (!(auction.bidCount > 0)) {
        return (
            <div className={`flex items-center justify-between text-xs ${className}`}>
                <span className="text-gray-600">Reserve</span>
                <span className="font-medium text-blue-600">Reserve applies · no bids yet</span>
            </div>
        );
    }

    const met = !!auction.reserveMet;
    // Loaded before the last 3 hours: no figure yet, so no bar until the next update.
    if (!met && auction.reserveProgress == null) return null;
    const progress = met ? 100 : Math.max(0, Math.min(100, Number(auction.reserveProgress) || 0));

    return (
        <div className={className}>
            <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-gray-600">Reserve progress</span>
                <span className={`font-medium ${met ? "text-green-600" : "text-gray-600"}`}>
                    {met ? "✅ Reserve met" : "⏳ Not met yet"}
                </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                    className={`h-2 rounded-full transition-all duration-500 ${met ? "bg-green-500" : "bg-orange-400"}`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
};

export default ReserveProgress;
