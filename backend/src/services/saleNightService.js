import Auction from "../models/auction.model.js";
import { dublinDayKey } from "../utils/closingSlots.js";

/**
 * Sale night flow (Nov 2026).
 *
 * 1. Anti-sniping ripple: when a bid extends a lot, any later lot that night
 *    that would now close too soon after it is pushed back, keeping its
 *    original gap (up to 2 minutes) to the lot before. Lots that already
 *    have room aren't touched, so the ripple stops at the first gap.
 *    Turn off with ANTI_SNIPE_CASCADE=off on Render (only the bid lot extends,
 *    as before). Gap: ANTI_SNIPE_GAP_SECONDS (default 120).
 *
 * 2. Next lot: the lot that closes next on the same night, for the listing
 *    page's "next lot in 5…" move.
 */

const TIMED = ["standard", "reserve"];
const LIVE = ["active", "approved"];

export const cascadeEnabled = () => String(process.env.ANTI_SNIPE_CASCADE ?? "on").toLowerCase() !== "off";
export const cascadeGapMs = () => {
    const s = Number(process.env.ANTI_SNIPE_GAP_SECONDS);
    return (Number.isFinite(s) && s >= 0 ? s : 120) * 1000;
};

/**
 * Works out which later lots move, and to when. Plain data, for testing.
 * laterLots: lots after the extended one that night, any order.
 */
export const planCascade = ({ oldEnd, newEnd, laterLots, gapMs = cascadeGapMs() }) => {
    const from = new Date(oldEnd).getTime();
    let prevOld = from;
    let prevNew = new Date(newEnd).getTime();
    if (!(prevNew > prevOld)) return [];
    const sorted = laterLots
        .map((l) => ({ id: l._id, end: new Date(l.endDate).getTime() }))
        .filter((l) => l.end > from)
        .sort((a, b) => a.end - b.end || String(a.id).localeCompare(String(b.id)));
    const moves = [];
    for (const lot of sorted) {
        const required = prevNew + Math.min(gapMs, Math.max(0, lot.end - prevOld));
        if (lot.end >= required) break; // room already: nothing after it needs to move
        moves.push({ id: lot.id, from: new Date(lot.end), to: new Date(required) });
        prevOld = lot.end;
        prevNew = required;
    }
    return moves;
};

// One ripple at a time (the server runs as a single process).
let queue = Promise.resolve();

/**
 * After a lot is extended from oldEnd to newEnd, push back later lots that
 * night as needed. Runs in the background; never throws into the bid.
 */
export const rippleAfterExtension = (auctionId, oldEnd, newEnd) => {
    if (!cascadeEnabled()) return Promise.resolve([]);
    const run = async () => {
        const start = new Date(oldEnd);
        const night = dublinDayKey(start);
        const candidates = await Auction.find(
            {
                _id: { $ne: auctionId },
                status: { $in: LIVE },
                auctionType: { $in: TIMED },
                endDate: { $gt: start, $lt: new Date(start.getTime() + 12 * 3600 * 1000) },
            },
            "_id endDate",
        ).lean();
        const sameNight = candidates.filter((l) => dublinDayKey(l.endDate) === night);
        const moves = planCascade({ oldEnd, newEnd, laterLots: sameNight });
        if (!moves.length) return [];

        const { default: agendaService } = await import("./agendaService.js");
        const { broadcastAuctionChange } = await import("./realtimeService.js");
        const done = [];
        for (const m of moves) {
            // Only move it if it's still where we expect (and never earlier).
            const res = await Auction.updateOne(
                { _id: m.id, status: { $in: LIVE }, endDate: { $lt: m.to } },
                { $set: { endDate: m.to } },
            );
            if (!res.modifiedCount) continue;
            await agendaService.rescheduleAuctionEnd(m.id, m.to);
            broadcastAuctionChange(m.id);
            done.push(m);
        }
        if (done.length) {
            console.log(`⏩ Anti-sniping: lot ${auctionId} extended to ${new Date(newEnd).toISOString()}; moved ${done.length} later lot(s) back (last now ${done.at(-1).to.toISOString()})`);
        }
        return done;
    };
    const p = queue.then(run, run).catch((err) => {
        console.error("Anti-sniping ripple failed:", err);
        return [];
    });
    queue = p;
    return p;
};

/**
 * The lot that closes next on the same night as this one, for moving the
 * listing page on. closed: whether this lot has actually finished (its time
 * may have been pushed back by a late bid).
 */
export const nextLotAfter = async (auctionId, now = new Date()) => {
    const lot = await Auction.findById(auctionId, "endDate status auctionType").lean();
    if (!lot) return null;
    const end = new Date(lot.endDate);
    const closed = lot.status !== "active" || end <= now;
    const night = dublinDayKey(end);
    const later = await Auction.find(
        {
            _id: { $ne: lot._id },
            status: "active",
            auctionType: { $in: TIMED },
            endDate: { $gt: now, $lt: new Date(end.getTime() + 12 * 3600 * 1000) },
        },
        "_id title endDate photos currentPrice baseCurrency",
    )
        .sort({ endDate: 1, _id: 1 })
        .limit(20)
        .lean();
    const next = later.find((l) => dublinDayKey(l.endDate) === night && new Date(l.endDate) >= end) || null;
    return {
        closed,
        endDate: end.toISOString(),
        next: next
            ? {
                _id: String(next._id),
                title: next.title,
                endDate: next.endDate,
                photo: next.photos?.[0]?.thumbUrl || next.photos?.[0]?.url || null,
            }
            : null,
    };
};
