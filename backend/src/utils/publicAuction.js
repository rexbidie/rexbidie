// Public view of an auction.
//
// Auctions are fetched by anonymous visitors (listing pages, catalogue pages,
// the single-listing page and the realtime socket). The raw document contains
// data that must never leave the server for those visitors: the secret reserve
// price, other bidders' maximum proxy bids, private offers, giveaway entrants'
// contact details, payment/commission records and seller contact details.
//
// sanitizeAuctionForViewer() strips that data unless the viewer is the seller,
// an admin, or (for payment fields only) the winner, and replaces it with the
// derived values the public UI actually needs (hasReserve, reserveMet, counts).

import { publicName } from "./displayName.js";
import { contactModeFor } from "./contactPolicy.js";
import { liveBuyNowState } from "./liveBuyNow.js";

const idOf = (v) => (v && typeof v === "object" ? v._id ?? v.id : v)?.toString?.();

// Fields only the seller and admins may see.
const OWNER_ONLY_FIELDS = [
  "reservePrice",
  "convertedReservePrice",
  "featuredPremiumAmount",
  "featuredRequested",
  "notifications",
  "purchaseEventSent",
];

// Fields only the seller, admins and the winning buyer may see.
const PARTY_ONLY_FIELDS = [
  "transactionId",
  "paymentMethod",
  "paymentCollectionPreference",
  "paymentDate",
  "invoice",
  "commissionAmount",
  "sellerCommissionAmount",
  "bidderCommissionAmount",
];

// Contact details never sent to the public on populated users.
const USER_PRIVATE_FIELDS = ["email", "phone", "phoneNumber", "stripeCustomerId"];

const stripUser = (u) => {
  if (!u || typeof u !== "object") return u;
  const out = { ...u };
  for (const f of USER_PRIVATE_FIELDS) delete out[f];
  return out;
};

// The public sees the seller by first name only (company name in full).
// The winner still gets the seller's full name (they need it to collect).
const isPopulatedUser = (u) =>
  !!u && typeof u === "object" && ("firstName" in u || "companyName" in u || "username" in u);

const publicSeller = (u, { keepFullName = false } = {}) => {
  if (!isPopulatedUser(u)) return stripUser(u);
  const out = stripUser(u);
  out.displayName = publicName(u);
  if (!keepFullName) {
    delete out.lastName;
    delete out.username;
  }
  return out;
};

const reserveSummary = (a) => {
  const reserve = Number(a.reservePrice) || 0;
  const start = Number(a.startPrice) || 0;
  const current = Number(a.currentPrice) || 0;
  const hasReserve = reserve > 0 && reserve > start;
  const reserveMet = !hasReserve || current >= reserve;
  // Rounded down to the nearest 10% so the exact reserve cannot be derived.
  const reserveProgress = hasReserve
    ? Math.min(100, Math.floor(((current / reserve) * 100) / 10) * 10)
    : 100;
  return { hasReserve, reserveMet, reserveProgress };
};

/**
 * @param {object} auction  plain object (toObject()/lean()), prices already converted is fine
 * @param {object|null} viewer  req.user or null
 * @returns {object} a new object safe to send to this viewer
 */
export const sanitizeAuctionForViewer = (auction, viewer = null) => {
  if (!auction) return auction;
  const a = { ...auction };

  const viewerId = viewer?._id?.toString?.();
  const isAdmin = viewer?.userType === "admin";
  const isSeller = !!viewerId && idOf(a.seller) === viewerId;
  const isWinner = !!viewerId && idOf(a.winner) === viewerId;

  const summary = reserveSummary(a);

  // Buy It Now during the auction: worked out before the reserve is removed.
  // The public sees the price, whether it's open and why not; never the buyer.
  const live = liveBuyNowState(a);
  if (live.offered) {
    summary.liveBuyNow = {
      price: live.price,
      convertedPrice: a.convertedLiveBuyNowPrice ?? null,
      available: live.available,
      reason: live.reason,
      closesAt: live.closesAt,
    };
  } else {
    summary.liveBuyNow = undefined;
  }
  const offers = Array.isArray(a.offers) ? a.offers : [];
  const participants = Array.isArray(a.participants) ? a.participants : [];
  const counts = {
    offerCount: offers.length,
    pendingOfferCount: offers.filter((o) => o?.status === "pending").length,
    participantCount: participants.length,
  };

  // "phone" or "questions": how buyers contact the seller (utils/contactPolicy.js).
  const contactMode = contactModeFor(a);
  const sellerDisplayName = isPopulatedUser(a.seller) ? publicName(a.seller) : undefined;

  if (isAdmin || isSeller) {
    return { ...a, ...summary, ...counts, contactMode, sellerDisplayName };
  }

  for (const f of OWNER_ONLY_FIELDS) delete a[f];

  // Buy It Now after the auction: the public sees the live price and end time only
  // (a price set in advance would hint at the reserve, and the buyer is private).
  if (a.postAuctionBin) {
    const bin = a.postAuctionBin;
    a.postAuctionBin = ["live", "processing", "sold", "expired"].includes(bin.status)
      ? { status: bin.status === "processing" ? "live" : bin.status, price: bin.price, endsAt: bin.endsAt, startedAt: bin.startedAt }
      : undefined;
  }
  if (!isWinner) for (const f of PARTY_ONLY_FIELDS) delete a[f];

  // Only the viewer's own proxy bid / offers / giveaway entry.
  a.proxyBids = viewerId
    ? (a.proxyBids || []).filter((p) => idOf(p.bidder) === viewerId)
    : [];
  a.offers = viewerId ? offers.filter((o) => idOf(o.buyer) === viewerId) : [];
  a.participants = viewerId
    ? participants
        .filter((p) => idOf(p.user) === viewerId)
        .map(({ email, phoneNumber, ...rest }) => rest)
    : [];

  a.seller = publicSeller(a.seller, { keepFullName: isWinner });
  if (sellerDisplayName) a.sellerUsername = sellerDisplayName;
  a.winner = stripUser(a.winner);
  a.currentBidder = stripUser(a.currentBidder);
  if (Array.isArray(a.bids)) {
    a.bids = a.bids.map((b) => (b && typeof b === "object" ? { ...b, bidder: stripUser(b.bidder) } : b));
  }

  return { ...a, ...summary, ...counts, contactMode, sellerDisplayName };
};

export const sanitizeAuctionsForViewer = (list, viewer = null) =>
  Array.isArray(list) ? list.map((a) => sanitizeAuctionForViewer(a, viewer)) : list;
