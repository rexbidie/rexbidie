import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShoppingCart, Zap } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { buyerFeeShort } from "../../utils/fees";
import { CLOSE_CUTOFF_HOURS, LIVE_BIN_CLOSED_REASON } from "../../utils/liveBuyNow";
import { money } from "./binShared";
import { ConfirmModal } from "./PostAuctionBinPanel";

// Listing page panel for Buy It Now while a reserve auction is live.
// The server works out whether it's open (auction.liveBuyNow, see
// backend/src/utils/liveBuyNow.js); this shows the price and the button.

const LiveBuyNowPanel = ({ auction, onPurchased }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const live = auction?.liveBuyNow;

    if (!live || auction.status !== "active") return null;

    const isSeller = user?._id && String(auction.seller?._id || auction.seller) === String(user._id);
    const displayCurrency = live.convertedPrice != null ? (auction.displayCurrency || "EUR") : (auction.baseCurrency || "EUR");
    const price = live.convertedPrice ?? live.price;
    const info = { price, displayCurrency, priceInBase: live.price };
    const closesAt = live.closesAt ? new Date(live.closesAt) : null;
    const closesLabel = closesAt
        ? closesAt.toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : "";

    if (!live.available) {
        // Once closed it doesn't come back; a short note is enough.
        return (
            <p className="my-3 text-sm text-gray-600 flex items-start gap-1.5">
                <Zap size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
                {LIVE_BIN_CLOSED_REASON[live.reason] || "Buy It Now isn't available."}
            </p>
        );
    }

    const start = () => {
        if (!user) return navigate("/login");
        setOpen(true);
    };

    return (
        <div className="my-4 rounded-lg border-2 border-[#edcd1f] bg-white p-4">
            <p className="text-xs uppercase tracking-wide font-semibold text-gray-600">Buy It Now · skip the auction</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
                {money(price, displayCurrency)}
                {auction.vatIncluded && <span className="text-sm font-normal text-gray-500 ml-1">+ VAT</span>}
            </p>
            <p className="text-sm text-gray-700 mt-1">
                Available until bidding gets close to the reserve, or {closesLabel ? `until ${closesLabel}` : `${CLOSE_CUTOFF_HOURS} hours before the end`}, whichever comes first.
            </p>
            {isSeller ? (
                <p className="mt-3 text-sm text-gray-700">This is your Buy It Now price. Buyers can buy outright at this price while it's open.</p>
            ) : (
                <button
                    type="button"
                    onClick={start}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#edcd1f] text-black font-semibold rounded-lg py-3 hover:bg-[#edcd1f]/90"
                >
                    <ShoppingCart size={18} /> Buy It Now
                </button>
            )}
            <p className="text-xs text-gray-500 mt-3 flex items-start gap-1.5">
                <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-green-700" />
                Buying ends the auction straight away. Buyer fee applies ({buyerFeeShort}). Paid and collected through RexBid.
            </p>

            <ConfirmModal
                open={open}
                info={info}
                auction={auction}
                buyUrl={`/api/v1/auctions/${auction._id}/live-buy-now`}
                onClose={(refresh) => { setOpen(false); if (refresh) onPurchased?.(); }}
                onBought={() => { setOpen(false); onPurchased?.(); }}
            />
        </div>
    );
};

export default LiveBuyNowPanel;
