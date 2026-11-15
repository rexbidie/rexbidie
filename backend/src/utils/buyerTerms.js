// Buyer Terms agreement before bidding (Nov 2026).
//
// A bidder ticks "I agree to the Buyer Terms" before their first bid of an
// auction night; after that they can bid with one tap until the next night.
// "Night" = the same Irish calendar day. Set BUYER_TERMS_EVERY_NIGHT=false to
// ask only once per account.
//
// The agreement is recorded on the user (time, lot, IP, browser) as evidence.
// Bids are NOT refused server-side without it, so older app versions keep
// working; the website and app ask before the first bid.

import { dublinDayKey } from "./closingSlots.js";

const HISTORY_LIMIT = 200;

const everyNight = () => String(process.env.BUYER_TERMS_EVERY_NIGHT ?? "true").toLowerCase() !== "false";

/** Has this user agreed to the Buyer Terms recently enough to bid without asking again? */
export const buyerTermsCurrent = (user, now = new Date()) => {
  const at = user?.buyerTerms?.acceptedAt ? new Date(user.buyerTerms.acceptedAt) : null;
  if (!at || Number.isNaN(at.getTime())) return false;
  if (!everyNight()) return true;
  return dublinDayKey(at) === dublinDayKey(now);
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
