// Remembers, for a short while, that a bidder's card and Stripe customer were
// checked with Stripe and found valid, so rapid bids on sale night don't wait
// on two Stripe calls each time. Only successful checks are remembered, and a
// change of card or customer is a different key. In-memory: a restart just
// means the next bid checks Stripe again.

export const PAYMENT_CHECK_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5000;

const cache = new Map(); // key -> expiry (ms)

const keyFor = (user) =>
  user?._id && user?.paymentMethodId && user?.stripeCustomerId
    ? `${user._id}:${user.paymentMethodId}:${user.stripeCustomerId}`
    : null;

/** True if this bidder's current card was checked successfully in the last 10 minutes. */
export const paymentRecentlyVerified = (user, now = Date.now()) => {
  const key = keyFor(user);
  if (!key) return false;
  const expiry = cache.get(key);
  if (!expiry) return false;
  if (expiry <= now) {
    cache.delete(key);
    return false;
  }
  return true;
};

/** Record a successful Stripe check. */
export const rememberPaymentVerified = (user, now = Date.now()) => {
  const key = keyFor(user);
  if (!key) return;
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, exp] of cache) if (exp <= now) cache.delete(k);
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  }
  cache.set(key, now + PAYMENT_CHECK_TTL_MS);
};

/** Forget a bidder (e.g. their card failed). */
export const forgetPaymentVerified = (user) => {
  const key = keyFor(user);
  if (key) cache.delete(key);
};
