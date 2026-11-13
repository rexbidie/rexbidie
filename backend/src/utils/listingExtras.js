// Paid listing extras. Prices are fixed in both currencies: sterling is
// set at £8 = €10 (not a live exchange rate), so £24 Featured and
// £8 / £16 / £32 Meta Boost, matching frontend/src/utils/fees.js.
// No VAT — RexBid is not VAT registered.

export const FEATURED_FEE_EUR = 30;
export const META_BOOST_PRICES_EUR = { boost: 10, plus: 20, max: 40 };
export const GBP_PER_EUR_EXTRAS = 0.8;

/** Price of an extra in the seller's currency (EUR or fixed GBP). */
const toSellerCurrency = (amountEur, currency = "EUR") =>
    currency === "GBP" ? Math.round(amountEur * GBP_PER_EUR_EXTRAS) : amountEur;

const roundToWholeUnit = (amount) => Math.round(amount);

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