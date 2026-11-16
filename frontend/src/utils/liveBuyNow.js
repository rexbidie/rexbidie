// Buy It Now while a reserve auction is live. Mirrors backend/src/utils/liveBuyNow.js.

export const MIN_ABOVE_RESERVE = 0.15;
export const CLOSE_CUTOFF_HOURS = 12;

/** Lowest Buy It Now price allowed for a reserve: 15% above, rounded up to a whole unit. */
export const minLivePrice = (reservePrice) =>
    Math.ceil((Number(reservePrice) || 0) * (1 + MIN_ABOVE_RESERVE) - 1e-9);

/** Why Buy It Now isn't open, in words for buyers. */
export const LIVE_BIN_CLOSED_REASON = {
    sold: 'Bought on Buy It Now.',
    not_live: 'Available once the auction is live.',
    processing: 'Someone is buying this lot right now.',
    closing_soon: `Buy It Now has closed (it closes ${CLOSE_CUTOFF_HOURS} hours before the end). You can still bid.`,
    bidding_close_to_reserve: 'Buy It Now has closed because bidding is close to the reserve. You can still bid.',
};

/**
 * Buy It Now price in the viewer's currency for listing cards. Listing and
 * catalogue results don't include a converted Buy It Now price, so use the
 * listing's own conversion (converted start price / start price).
 */
export const liveBinDisplayPrice = (auction) => {
    const lb = auction?.liveBuyNow;
    if (!lb?.price) return null;
    if (lb.convertedPrice != null) return lb.convertedPrice;
    const start = Number(auction.startPrice);
    const converted = Number(auction.convertedStartPrice);
    return start > 0 && converted > 0 ? Math.round(lb.price * (converted / start)) : lb.price;
};
