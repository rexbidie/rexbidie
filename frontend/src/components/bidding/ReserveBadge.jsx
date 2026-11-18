// Reserve badge for reserve lots: "Reserve Applies" until the reserve is met,
// then "Reserve Met". Buyers never see a percentage or the reserve itself.
export const reserveIsMet = (auction) => auction?.reserveStatus === "met" || (!auction?.reserveStatus && !!auction?.reserveMet);

/** hideNotMet: listing cards only add "Reserve Met" (the photo already says "Reserve"). */
const ReserveBadge = ({ auction, className = "", hideNotMet = false }) => {
    if (!auction || auction.auctionType !== "reserve" || auction.status !== "active" || auction.hasReserve === false) return null;
    const met = reserveIsMet(auction);
    if (!met && hideNotMet) return null;
    return (
        <span
            className={`inline-flex w-fit items-center rounded-md border px-3 py-1.5 text-xs font-semibold ${met
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-blue-50 text-blue-600 border-blue-200"} ${className}`}
        >
            {met ? "Reserve Met" : "Reserve Applies"}
        </span>
    );
};

export default ReserveBadge;
