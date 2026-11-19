// Buyer Terms agreement before bidding (Nov 2026).
//
// A bidder ticks "I agree to the Buyer Terms" before bidding; after that they
// can bid with one tap for 30 minutes (BUYER_TERMS_EVERY_MINUTES). They're
// never asked while the lot they're bidding on is in its last 10 minutes
// (BUYER_TERMS_QUIET_MINUTES): they just bid. Set BUYER_TERMS_EVERY_NIGHT=false
// to ask only once per account.
//
// The agreement is recorded on the user (time, lot, IP, browser) as evidence.
// Bids are NOT refused server-side without it, so older app versions keep
// working; the website and app ask before the first bid.


const HISTORY_LIMIT = 200;

const everyNight = () => String(process.env.BUYER_TERMS_EVERY_NIGHT ?? "true").toLowerCase() !== "false";
const minutesSetting = (name, d) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : d;
};
export const termsEveryMinutes = () => minutesSetting("BUYER_TERMS_EVERY_MINUTES", 30);
export const termsQuietMinutes = () => minutesSetting("BUYER_TERMS_QUIET_MINUTES", 10);

/**
 * Has this user agreed to the Buyer Terms recently enough to bid without
 * asking again? lotEndsAt: the lot they're bidding on; inside its last 10
 * minutes they're never asked (if they've agreed before at all).
 */
export const buyerTermsCurrent = (user, now = new Date(), { lotEndsAt = null } = {}) => {
  const at = user?.buyerTerms?.acceptedAt ? new Date(user.buyerTerms.acceptedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return false;
  if (!everyNight()) return true;
  if (now - at < termsEveryMinutes() * 60000) return true;
  const ends = lotEndsAt ? new Date(lotEndsAt) : null;
  if (ends && !Number.isNaN(ends.getTime()) && ends - now > 0 && ends - now <= termsQuietMinutes() * 60000) return true;
  return false;
};

/** Builds the $set / $push update that records an agreement. */
export const buyerTermsUpdate = ({ now = new Date(), auctionId = null, ip = "", userAgent = "" } = {}) => ({
  $set: { "buyerTerms.acceptedAt": now },
  $push: {
    "buyerTerms.history": {
      $each: [{ at: now, auction: auctionId || undefined, ip: String(ip || "").slice(0, 64), userAgent: String(userAgent || "").slice(0, 300) }],
      $slice: -HISTORY_LIMIT,
    },
  },
});
