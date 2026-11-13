// RexBid listing minimums (mirrors backend/src/utils/listingRules.js).
// Sterling listings are checked by the server at the current exchange rate.
export const MIN_RESERVE_EUR = 500;
export const MIN_NO_RESERVE_START_EUR = 400;

/** react-hook-form validator for the start price. */
export const validateMinStart = (value, auctionType, currency) => {
    if (auctionType !== "standard" || currency === "GBP") return true;
    return parseFloat(value) >= MIN_NO_RESERVE_START_EUR || `The minimum starting bid for a no-reserve auction is €${MIN_NO_RESERVE_START_EUR}`;
};

/** react-hook-form validator for the reserve price. */
export const validateMinReserve = (value, currency) => {
    if (currency === "GBP") return true;
    return parseFloat(value) >= MIN_RESERVE_EUR || `The minimum reserve price is €${MIN_RESERVE_EUR}`;
};

export const minimumsHint = (currency) =>
    currency === "GBP"
        ? "Minimums: €500 reserve, or €400 starting bid for no-reserve auctions (sterling equivalent)."
        : "Minimums: €500 reserve, or €400 starting bid for no-reserve auctions.";

/**
 * Suggested bid increment for a listing, based on the price it's expected
 * to reach (reserve if set, otherwise the starting bid). The seller decides;
 * this is only a suggestion.
 *   under 5,000: 100 · 5,000 to 20,000: 250 · above 20,000: 500
 */
export const suggestedIncrement = (expectedPrice) => {
    const p = Number(expectedPrice) || 0;
    if (p <= 0) return null;
    if (p < 5000) return 100;
    if (p <= 20000) return 250;
    return 500;
};

// Minimum bid increments by current bid (start price before the first bid).
// Same numbers in € and £. Mirrors backend/src/utils/listingRules.js.
export const INCREMENT_BANDS = [
    { below: 1000, min: 25, label: 'Under 1,000' },
    { below: 5000, min: 50, label: '1,000 – 4,999' },
    { below: 15000, min: 100, label: '5,000 – 14,999' },
    { below: 30000, min: 150, label: '15,000 – 29,999' },
    { below: 60000, min: 250, label: '30,000 – 59,999' },
    { below: 100000, min: 500, label: '60,000 – 99,999' },
    { below: Infinity, min: 1000, label: '100,000 and over' },
];

/** Minimum increment for a current bid (or start price). */
export const minIncrementFor = (price) => {
    const p = Number(price) || 0;
    return INCREMENT_BANDS.find((b) => p < b.below).min;
};
