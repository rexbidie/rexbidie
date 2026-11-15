// Admin → Sale Night Times (Nov 2026).
//
// Lets an admin re-time the lots closing on a sale day in one go, e.g. lots
// approved before the closing-slot menu existed. Two steps:
//   GET  /api/v1/admin/sale-times?day=YYYY-MM-DD          lots closing that day (Irish time)
//   POST /api/v1/admin/sale-times  { day, changes, apply } check (apply=false) or apply
// Several lots may close at the same minute (e.g. different categories).
// All changes are checked first; nothing is changed unless every line is valid.

import mongoose from "mongoose";
import Auction from "../models/auction.model.js";
import agendaService from "../services/agendaService.js";
import { broadcastAuctionChange } from "../services/realtimeService.js";
import { dublinDayKey, dublinHHMM, dublinTime, isValidHHMM } from "../utils/closingSlots.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RETIMABLE = ["approved", "active"];
// Lots closing this soon are left alone, and new times must be at least this far away.
export const SAFETY_MINUTES = 30;

const dayRange = (day) => {
  // Irish midnight to midnight (handles the clock change).
  const start = dublinTime(day, "00:00");
  const next = new Date(start.getTime() + 36 * 36e5);
  const end = dublinTime(dublinDayKey(next), "00:00");
  return { start, end };
};

const lotRow = (a) => ({
  id: String(a._id),
  title: a.title,
  status: a.status,
  auctionType: a.auctionType,
  hasReserve: a.auctionType === "reserve" && Number(a.reservePrice) > Number(a.startPrice || 0),
  bidCount: a.bidCount || 0,
  categories: a.categories || [],
  endDate: a.endDate,
  time: dublinHHMM(a.endDate),
});

export const listSaleTimes = async (req, res) => {
  try {
    const day = String(req.query.day || "");
    if (!DAY.test(day)) return res.status(400).json({ success: false, message: "Choose a day (YYYY-MM-DD)" });
    const { start, end } = dayRange(day);
    const lots = await Auction.find({ endDate: { $gte: start, $lt: end }, status: { $in: [...RETIMABLE, "ended", "sold", "reserve_not_met"] } })
      .select("title status auctionType reservePrice startPrice bidCount categories endDate")
      .sort({ endDate: 1, title: 1 })
      .lean();
    res.json({ success: true, data: { day, lots: lots.map(lotRow) } });
  } catch (error) {
    console.error("List sale times error:", error);
    res.status(500).json({ success: false, message: "Couldn't load the lots for that day" });
  }
};

/**
 * Pure check of a set of changes against the lots as they are now.
 * @returns {{ errors: string[], updates: { id, title, from: Date, to: Date }[] }}
 */
export const checkChanges = ({ day, changes, lots, now = new Date() }) => {
  const errors = [];
  const updates = [];
  const byId = new Map(lots.map((l) => [String(l._id), l]));
  const seen = new Set();
  const minTime = now.getTime() + SAFETY_MINUTES * 60000;

  for (const [i, c] of (changes || []).entries()) {
    const line = `Line ${i + 1}`;
    const id = String(c?.id || "").trim();
    const time = String(c?.time || "").trim();
    if (!mongoose.isValidObjectId(id)) { errors.push(`${line}: "${id}" isn't a listing ID`); continue; }
    if (seen.has(id)) { errors.push(`${line}: this listing appears twice`); continue; }
    seen.add(id);
    if (!isValidHHMM(time)) { errors.push(`${line}: "${time}" isn't a time like 19:30`); continue; }
    const lot = byId.get(id);
    if (!lot) { errors.push(`${line}: listing ${id} isn't closing on ${day}`); continue; }
    if (!RETIMABLE.includes(lot.status)) { errors.push(`${line}: "${lot.title}" has already closed (${lot.status.replace(/_/g, " ")})`); continue; }
    if (new Date(lot.endDate).getTime() < minTime) {
      errors.push(`${line}: "${lot.title}" closes within ${SAFETY_MINUTES} minutes, so it can't be moved now`);
      continue;
    }
    const to = dublinTime(day, time);
    if (to.getTime() < minTime) { errors.push(`${line}: ${time} is less than ${SAFETY_MINUTES} minutes away`); continue; }
    if (to.getTime() === new Date(lot.endDate).getTime()) continue; // unchanged
    updates.push({ id, title: lot.title, from: new Date(lot.endDate), to });
  }
  return { errors, updates };
};

export const saveSaleTimes = async (req, res) => {
  try {
    const { day, changes, apply = false } = req.body || {};
    if (!DAY.test(String(day || ""))) return res.status(400).json({ success: false, message: "Choose a day (YYYY-MM-DD)" });
    if (!Array.isArray(changes) || changes.length === 0) return res.status(400).json({ success: false, message: "No times to change" });
    if (changes.length > 500) return res.status(400).json({ success: false, message: "Too many lines" });

    const { start, end } = dayRange(day);
    const lots = await Auction.find({ endDate: { $gte: start, $lt: end } }).select("title status endDate").lean();
    const { errors, updates } = checkChanges({ day, changes, lots });

    const summary = updates.map((u) => ({ id: u.id, title: u.title, from: dublinHHMM(u.from), to: dublinHHMM(u.to) }));
    if (errors.length) return res.status(400).json({ success: false, message: "Nothing was changed. Fix these lines first.", errors, data: { updates: summary } });
    if (!apply) return res.json({ success: true, message: `${updates.length} lot(s) will change`, data: { updates: summary } });

    let applied = 0;
    const skipped = [];
    for (const u of updates) {
      // Only if the lot hasn't changed since the check (e.g. a late bid extended it).
      const r = await Auction.updateOne(
        { _id: u.id, status: { $in: RETIMABLE }, endDate: u.from },
        { $set: { endDate: u.to } }
      );
      if (r.modifiedCount !== 1) { skipped.push(u.title); continue; }
      try {
        const oid = new mongoose.Types.ObjectId(u.id);
        await agendaService.agenda.cancel({ name: "end auction", "data.auctionId": { $in: [u.id, oid] } });
        await agendaService.scheduleAuctionEnd(oid, u.to);
      } catch (err) {
        // The end job re-checks the closing time when it runs, but log loudly.
        console.error(`Sale times: could not reschedule closing job for ${u.id}:`, err);
      }
      broadcastAuctionChange(u.id);
      applied += 1;
    }
    console.log(`Sale times: ${req.user?._id} re-timed ${applied} lot(s) on ${day}`);
    res.json({
      success: true,
      message: `${applied} lot(s) re-timed${skipped.length ? `; ${skipped.length} skipped because they changed meanwhile` : ""}`,
      data: { applied, skipped, updates: summary },
    });
  } catch (error) {
    console.error("Save sale times error:", error);
    res.status(500).json({ success: false, message: "Couldn't change the times" });
  }
};
