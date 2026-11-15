// Paid-but-unused listing extras payments.
//
// The listing form takes the Featured / Meta Boost card payment first and then
// submits the listing. If that submit fails and the seller reloads the page
// (or starts the form again), the form forgets it already took the money, so
// before this a second attempt charged the seller again. Now, before taking a
// new payment, we look for one the seller has already paid for the same extras
// and that no listing has used yet, and use that instead.
//
// The same lookup lists unused payments for admins, so nothing paid goes
// unnoticed.

export const PREPAID_TYPE = "listing_extras_prepaid";
const REUSE_WINDOW_DAYS = 30;

const chargeOf = (pi) => (pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null);

/** True when this payment intent was a listing-extras payment that went through and hasn't been refunded. */
export const isPaidPrepaidExtras = (pi) => {
  if (!pi || pi.status !== "succeeded" || pi.metadata?.type !== PREPAID_TYPE) return false;
  const charge = chargeOf(pi);
  if (charge && (charge.refunded || (charge.amount_refunded || 0) > 0)) return false;
  return true;
};

/**
 * Picks the newest paid, unused, unrefunded prepaid payment that matches the
 * seller, amount and currency. `usedIds` is a Set of payment intent ids
 * already attached to listings.
 */
export const pickReusablePayment = (intents, { sellerId, amountCents, currency, usedIds = new Set(), now = Date.now() }) => {
  const oldest = Math.floor(now / 1000) - REUSE_WINDOW_DAYS * 24 * 60 * 60;
  return (
    (intents || [])
      .filter((pi) =>
        isPaidPrepaidExtras(pi) &&
        pi.metadata?.sellerId === String(sellerId) &&
        pi.amount === amountCents &&
        String(pi.currency).toUpperCase() === String(currency).toUpperCase() &&
        (pi.created || 0) >= oldest &&
        !usedIds.has(pi.id)
      )
      .sort((a, b) => (b.created || 0) - (a.created || 0))[0] || null
  );
};

/** Payment intent ids from `ids` that are already attached to a listing. */
export const usedPaymentIds = async (AuctionModel, ids) => {
  if (!ids.length) return new Set();
  const rows = await AuctionModel.find({ "extrasPayment.paymentIntentId": { $in: ids } })
    .select("extrasPayment.paymentIntentId")
    .lean();
  return new Set(rows.map((r) => r.extrasPayment?.paymentIntentId).filter(Boolean));
};

/** The seller's paid, unused prepaid payment for exactly these extras, or null. */
export const findReusablePrepaidPayment = async ({ stripe, AuctionModel, customerId, sellerId, amountCents, currency }) => {
  if (!customerId || !(amountCents > 0)) return null;
  const { data } = await stripe.paymentIntents.list({ customer: customerId, limit: 100, expand: ["data.latest_charge"] });
  const candidates = (data || []).filter((pi) => isPaidPrepaidExtras(pi));
  const used = await usedPaymentIds(AuctionModel, candidates.map((pi) => pi.id));
  return pickReusablePayment(candidates, { sellerId, amountCents, currency, usedIds: used });
};

/**
 * Admin list: prepaid extras payments that went through but aren't attached to
 * any listing and haven't been refunded (older than `minAgeMinutes`, so a
 * listing that is still uploading isn't flagged).
 */
export const listUnusedPrepaidPayments = async ({ stripe, AuctionModel, days = 60, minAgeMinutes = 60 }) => {
  const now = Math.floor(Date.now() / 1000);
  const found = [];
  let startingAfter;
  for (let page = 0; page < 10; page++) {
    const res = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: now - days * 24 * 60 * 60 },
      expand: ["data.latest_charge"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    found.push(...(res.data || []).filter((pi) => isPaidPrepaidExtras(pi) && pi.created <= now - minAgeMinutes * 60));
    if (!res.has_more || !res.data?.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  const used = await usedPaymentIds(AuctionModel, found.map((pi) => pi.id));
  return found
    .filter((pi) => !used.has(pi.id))
    .map((pi) => ({
      paymentIntentId: pi.id,
      amount: pi.amount / 100,
      currency: String(pi.currency).toUpperCase(),
      description: pi.description || "",
      sellerId: pi.metadata?.sellerId || null,
      customerId: typeof pi.customer === "string" ? pi.customer : pi.customer?.id || null,
      createdAt: new Date(pi.created * 1000).toISOString(),
    }));
};
