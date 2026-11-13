// Minimum prices for auction listings (set by RexBid, Nov 2026).
//   Reserve auctions:     reserve price must be at least €500
//   No-reserve auctions:  starting bid must be at least €400
// Sterling listings use the equivalent amount at the current exchange rate,
// rounded up to the nearest £10 so the rule is easy to state.

import { getCachedRates } from "../routes/currency.route.js";

export const MIN_RESERVE_EUR = 500;
export const MIN_NO_RESERVE_START_EUR = 400;

const SYMBOL = { EUR: "€", GBP: "£" };

/** Minimum amount in the listing's currency. `rates` is injectable for tests. */
export const minimumIn = (amountEur, currency = "EUR", rates = getCachedRates()) => {
    if (!currency || currency === "EUR") return amountEur;
    const rate = rates?.EUR?.rates?.[currency];
    if (!rate || typeof rate !== "number") return amountEur; // fail safe: same number
    return Math.ceil((amountEur * rate) / 10) * 10;
};

/**
 * Returns an error message if the listing's prices are below the minimums,
 * otherwise null. Only applies to timed auctions (standard / reserve).
 */
export const minimumPriceError = ({ auctionType, startPrice, reservePrice, currency = "EUR" }, rates) => {
    const sym = SYMBOL[currency] || "";
    if (auctionType === "reserve") {
        const min = minimumIn(MIN_RESERVE_EUR, currency, rates);
        if (!(parseFloat(reservePrice) >= min)) {
            return `The minimum reserve price is ${sym}${min.toLocaleString("en-IE")}.`;
        }
    }
    if (auctionType === "standard") {
        const min = minimumIn(MIN_NO_RESERVE_START_EUR, currency, rates);
        if (!(parseFloat(startPrice) >= min)) {
            return `The minimum starting bid for a no-reserve auction is ${sym}${min.toLocaleString("en-IE")}.`;
        }
    }
    return null;
};

// Minimum bid increments (Nov 2026), set by the current bid (the start price
// before the first bid). Same numbers in € and £. The increment on a lot is
// never below the minimum for its current bid: it rises automatically as
// bidding moves into a higher band. Sellers can lower it down to the minimum
// at any time, and raise it only before the first bid.
export const INCREMENT_BANDS = [
    { below: 1000, min: 25 },
    { below: 5000, min: 50 },
    { below: 15000, min: 100 },
    { below: 30000, min: 150 },
    { below: 60000, min: 250 },
    { below: 100000, min: 500 },
    { below: Infinity, min: 1000 },
];

/** Minimum increment for a current bid (or start price). */
export const minIncrementFor = (price) => {
    const p = Number(price) || 0;
    return INCREMENT_BANDS.find((b) => p < b.below).min;
};

/** The price the minimum is based on: current bid once bidding starts, else the start price. */
export const incrementBasis = (auction) =>
    Number(auction?.bidCount) > 0 ? Number(auction.currentPrice) || 0 : Number(auction?.startPrice) || 0;

/**
 * Error message for a seller changing the increment, or null.
 * @param {object} auction  bidCount, currentPrice, startPrice, bidIncrement, baseCurrency
 */
export const incrementChangeError = (auction, newIncrement) => {
    const inc = Number(newIncrement);
    if (!Number.isFinite(inc) || inc <= 0 || Math.round(inc) !== inc) return "Enter the increment as a whole amount.";
    const sym = SYMBOL[auction?.baseCurrency] || "€";
    const min = minIncrementFor(incrementBasis(auction));
    if (inc < min) {
        return `The minimum increment at ${Number(auction.bidCount) > 0 ? "the current bid" : "this start price"} is ${sym}${min.toLocaleString("en-IE")}.`;
    }
    if (Number(auction?.bidCount) > 0 && inc > Number(auction.bidIncrement)) {
        return "The increment can't be raised once bidding has started. You can lower it.";
    }
    return null;
};
