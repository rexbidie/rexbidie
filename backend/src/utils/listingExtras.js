// Paid listing extras. Prices are defined in EUR; sterling prices are
// derived LIVE from the cached exchange rates and rounded to the nearest £1.
// No VAT — RexBid is not VAT registered.

import { getCachedRates } from "../routes/currency.route.js";

export const FEATURED_FEE_EUR = 30;
export const META_BOOST_PRICES_EUR = { boost: 10, plus: 20, max: 40 };

// Fail-safe only — used if rates are momentarily unavailable (cold start).
const FALLBACK_EUR_TO_GBP = 0.8;

const roundToWholeUnit = (amount) => Math.round(amount);

/**
 * Convert an EUR price to the target currency using live cached rates.
 * Rounded to the nearest whole unit (£1 / €1).
 */
const toSellerCurrency = (amountEur, currency = "EUR") => {
    if (currency === "EUR") return amountEur;

    const rates = getCachedRates();
    const rate = rates?.EUR?.rates?.[currency];

    if (!rate || typeof rate !== "number") {
        // Rates not ready — fall back to old business rate to avoid
        // charging an unbounded or zero amount.
        console.warn(
            `[listingExtras] FX rate EUR→${currency} unavailable; using fallback ${FALLBACK_EUR_TO_GBP}`
        );
        return roundToWholeUnit(amountEur * FALLBACK_EUR_TO_GBP);
    }

    return roundToWholeUnit(amountEur * rate);
};

export const calculateListingExtras = ({
    featuredRequested,
    metaBoostPackage,
    currency = "EUR",
}) => {
    const lineItems = [];
    let total = 0;

    const featured = { requested: !!featuredRequested, amount: 0 };
    if (featuredRequested) {
        const amount = toSellerCurrency(FEATURED_FEE_EUR, currency);
        featured.amount = amount;
        total += amount;
        lineItems.push({ id: "featured", label: "Featured listing", amount });
    }

    const metaBoost = { package: null, amount: 0 };
    if (metaBoostPackage && META_BOOST_PRICES_EUR[metaBoostPackage]) {
        const amount = toSellerCurrency(
            META_BOOST_PRICES_EUR[metaBoostPackage],
            currency
        );
        metaBoost.package = metaBoostPackage;
        metaBoost.amount = amount;
        total += amount;
        lineItems.push({
            id: `meta_${metaBoostPackage}`,
            label: `Meta Boost (${metaBoostPackage})`,
            amount,
        });
    }

    return {
        currency,
        featured,
        metaBoost,
        total: roundToWholeUnit(total),
        lineItems,
    };
};

/**
 * Just the pricing menu (no auction context). Used by the GET endpoint
 * that the create-listing form calls to display current prices.
 */
export const getExtrasPricingMenu = (currency = "EUR") => {
    return {
        currency,
        featured: toSellerCurrency(FEATURED_FEE_EUR, currency),
        boost: toSellerCurrency(META_BOOST_PRICES_EUR.boost, currency),
        plus: toSellerCurrency(META_BOOST_PRICES_EUR.plus, currency),
        max: toSellerCurrency(META_BOOST_PRICES_EUR.max, currency),
    };
};