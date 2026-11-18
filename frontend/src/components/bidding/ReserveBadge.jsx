// Reserve badge for reserve lots, worked out by the server (utils/publicAuction.js):
//   met     – reserve met, this lot will sell (shown at any time)
//   close   – within 10% of the reserve in the last 3 hours
//   not_met – otherwise
// Buyers never see a percentage or the reserve itself.
const BADGES = {
    met: { label: "Reserve met · this lot will sell", cls: "bg-green-50 text-green-700 border-green-200" },
    close: { label: "Close to reserve", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    not_met: { label: "Reserve not met", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

export const reserveStatusOf = (auction) => {
    if (!auction || auction.auctionType !== "reserve") return null;
    if (auction.reserveStatus) return auction.reserveStatus;
    if (auction.hasReserve === false) return null;
    return auction.reserveMet ? "met" : "not_met";
};

/** hideNotMet: listing cards only show the met / close badges (the image already says "Reserve"). */
const ReserveBadge = ({ auction, className = "", hideNotMet = false }) => {
    if (!auction || auction.status !== "active") return null;
    const status = reserveStatusOf(auction);
    if (!status || (hideNotMet && status === "not_met")) return null;
    const b = BADGES[status];
    return (
        <span className={`inline-flex w-fit items-center rounded-md border px-3 py-1.5 text-xs font-semibold ${b.cls} ${className}`}>
            {b.label}
        </span>
    );
};

export default ReserveBadge;
