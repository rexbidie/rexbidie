// Accept the highest bid after the reserve isn't met (Nov 2026).
//
// When a reserve lot ends below its reserve, the seller gets a link in the
// "listing ended" email to sell to the top bidder at their top bid. Accepting
// is a binding sale straight away: the normal won / sold / payment process
// follows. Rules:
//   - reserve lots that ended "reserve_not_met", not already sold
//   - the seller has ACCEPT_HOURS after the auction ends
//   - the price is the top bid shown when the auction ended (auction.currentPrice)
//   - only top bids placed on or after ACCEPT_TOP_BID_BIDS_FROM count, because
//     bidders are only bound once the terms say so. Without that setting the
//     feature is off.
//   - accepting cancels a live Last Chance (Buy It Now) window
//   - ACCEPT_TOP_BID=off turns it off everywhere

import jwt from "jsonwebtoken";

export const ACCEPT_HOURS = 24;
const PURPOSE = "accept-top-bid";

const idStr = (v) => (v && typeof v === "object" ? v._id ?? v : v)?.toString?.();

const secret = () => process.env.ACCEPT_BID_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET;

/** Date from which top bids are binding if the seller accepts, or null (feature off). */
export const bindingBidsFrom = () => {
  if (String(process.env.ACCEPT_TOP_BID || "").toLowerCase() === "off") return null;
  const raw = process.env.ACCEPT_TOP_BID_BIDS_FROM;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Latest time the seller can accept. */
export const acceptDeadlineFor = (auction) =>
  new Date(new Date(auction?.endDate || 0).getTime() + ACCEPT_HOURS * 36e5);

/**
 * The top bid as it stood when the auction ended: amount, bidder and when it was placed.
 * Uses currentPrice / currentBidder (what bidders saw), not a proxy maximum.
 */
export const topBidDetails = (auction) => {
  const amount = Number(auction?.currentPrice) || 0;
  const bidderId = idStr(auction?.currentBidder);
  const bids = (auction?.bids || []).filter((b) => !b.isBuyNow);
  if (!amount || !bidderId || bids.length === 0) return null;
  // The bid that set the final price (latest bid by the top bidder at that amount).
  const own = bids
    .filter((b) => idStr(b.bidder) === bidderId && Number(b.amount) === amount)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const placedAt = own[0]?.timestamp ? new Date(own[0].timestamp) : null;
  return { amount, bidderId, placedAt };
};

/**
 * Can the seller accept the top bid on this lot right now?
 * @returns {{ allowed: boolean, reason?: string, amount?: number, bidderId?: string, deadline?: Date }}
 */
export const acceptTopBidState = (auction, now = new Date()) => {
  const from = bindingBidsFrom();
  if (!from) return { allowed: false, reason: "Accepting the highest bid isn't available at the moment." };
  if (!auction || auction.auctionType !== "reserve") {
    return { allowed: false, reason: "Only lots with a reserve can accept the highest bid." };
  }
  if (["sold", "sold_buy_now"].includes(auction.status) || auction.winner) {
    return { allowed: false, reason: "This lot has already been sold." };
  }
  if (auction.status !== "reserve_not_met") {
    return { allowed: false, reason: "The highest bid can only be accepted after an auction ends below its reserve." };
  }
  if (["processing", "sold"].includes(auction.postAuctionBin?.status)) {
    return { allowed: false, reason: "This lot is being bought on Last Chance right now." };
  }
  const top = topBidDetails(auction);
  if (!top) return { allowed: false, reason: "There were no bids on this lot." };
  const deadline = acceptDeadlineFor(auction);
  if (now.getTime() > deadline.getTime()) {
    return {
      allowed: false,
      reason: `The highest bid had to be accepted within ${ACCEPT_HOURS} hours of the auction ending. Contact RexBid if the buyer is still interested, or relist the lot.`,
    };
  }
  if (!top.placedAt || top.placedAt.getTime() < from.getTime()) {
    return { allowed: false, reason: "This bid was placed before top bids became binding, so it can't be accepted automatically. Contact RexBid and we'll ask the bidder." };
  }
  return { allowed: true, amount: top.amount, bidderId: top.bidderId, deadline };
};

/** Signed link token for the seller's email. Expires with the acceptance window. */
export const signAcceptToken = (auction) => {
  const deadline = acceptDeadlineFor(auction);
  const secondsLeft = Math.floor((deadline.getTime() - Date.now()) / 1000);
  if (secondsLeft <= 0 || !secret()) return null;
  return jwt.sign(
    {
      p: PURPOSE,
      a: idStr(auction._id),
      s: idStr(auction.seller),
      amt: Number(auction.currentPrice) || 0,
    },
    secret(),
    { expiresIn: secondsLeft }
  );
};

/**
 * Checks a link token. Returns { auctionId, sellerId, amount } or throws with a
 * message the seller can read.
 */
export const verifyAcceptToken = (token) => {
  let data;
  try {
    data = jwt.verify(String(token || ""), secret());
  } catch (err) {
    const expired = err?.name === "TokenExpiredError";
    throw Object.assign(
      new Error(
        expired
          ? `This link has expired. The highest bid had to be accepted within ${ACCEPT_HOURS} hours of the auction ending.`
          : "This link isn't valid. Please use the button in your email, or contact RexBid."
      ),
      { status: expired ? 410 : 400 }
    );
  }
  if (data?.p !== PURPOSE || !data.a || !data.s) {
    throw Object.assign(new Error("This link isn't valid. Please use the button in your email, or contact RexBid."), { status: 400 });
  }
  return { auctionId: data.a, sellerId: data.s, amount: Number(data.amt) || 0 };
};
