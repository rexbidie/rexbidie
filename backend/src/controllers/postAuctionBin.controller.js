// Last Chance after the auction – API (mounted at /api/v1/buy-it-now).
// Rules: utils/postAuctionBin.js. Starting/buying/ending: services/postAuctionBinService.js.

import mongoose from "mongoose";
import Auction from "../models/auction.model.js";
import { getCachedRates } from "../routes/currency.route.js";
import { publicName } from "../utils/displayName.js";
import { BIN_HOURS, START_WINDOW_HOURS, binIsLive, binPriceError, binStartState, maxBinPrice, startDeadlineFor, topBidOf } from "../utils/postAuctionBin.js";
import User from "../models/user.model.js";
import { renderBinInviteEmail, sendBinInviteEmail } from "../utils/nodemailer.js";
import { buyBin, recentBinSales, startBin, undoBinPurchase } from "../services/postAuctionBinService.js";
import { broadcastAuctionChange } from "../services/realtimeService.js";

const STAFF = new Set(["admin", "staff"]);
const idStr = (v) => (v && typeof v === "object" ? v._id ?? v : v)?.toString?.();
const round2 = (n) => Math.round(n * 100) / 100;

// rates[FROM].rates[TO]
const rateBetween = (from, to) => {
  if (!from || !to || from === to) return 1;
  return getCachedRates()?.[from]?.rates?.[to] || null;
};
const toDisplay = (amount, base, currency) => {
  const r = rateBetween(base, currency);
  return r ? round2(amount * r) : amount;
};
const toBase = (amount, currency, base) => {
  const r = rateBetween(currency || base, base);
  if (!r) throw Object.assign(new Error("Currency conversion isn't available right now. Please try again shortly."), { status: 503 });
  return round2(Number(amount) * r);
};
const displayCurrencyFor = (req, auction) =>
  ["EUR", "GBP"].includes(req.query.currency || req.body?.currency) ? (req.query.currency || req.body?.currency) : auction.baseCurrency || "EUR";

const fail = (res, error, fallback) =>
  res.status(error.status || 500).json({ success: false, message: error.status ? error.message : fallback });

const loadLot = async (id) => (mongoose.isValidObjectId(id) ? Auction.findById(id) : null);
const canManage = (user, auction) => !!user && (idStr(auction.seller) === idStr(user._id) || STAFF.has(user.userType));

// GET /api/v1/buy-it-now?currency=EUR   – everything live on Last Chance
export const listLive = async (req, res) => {
  try {
    const now = new Date();
    const lots = await Auction.find({
      status: "reserve_not_met",
      winner: null,
      "postAuctionBin.status": "live",
      "postAuctionBin.endsAt": { $gt: now },
    })
      .select("title subTitle photos location categories baseCurrency currentPrice bidCount postAuctionBin seller vatIncluded")
      .populate("seller", "firstName companyName username")
      .sort({ "postAuctionBin.endsAt": 1 })
      .limit(200)
      .lean();

    const currency = ["EUR", "GBP"].includes(req.query.currency) ? req.query.currency : null;
    const data = lots.map((a) => {
      const display = currency || a.baseCurrency || "EUR";
      const photo = (a.photos || []).slice().sort((x, y) => (x.order || 0) - (y.order || 0))[0];
      return {
        _id: a._id,
        title: a.title,
        subTitle: a.subTitle,
        location: a.location,
        categories: a.categories,
        photo: photo ? { url: photo.url, thumbUrl: photo.thumbUrl } : null,
        sellerName: publicName(a.seller),
        vatIncluded: a.vatIncluded,
        baseCurrency: a.baseCurrency,
        displayCurrency: display,
        price: toDisplay(a.postAuctionBin.price, a.baseCurrency, display),
        topBid: a.bidCount > 0 ? toDisplay(a.currentPrice, a.baseCurrency, display) : null,
        bidCount: a.bidCount || 0,
        endsAt: a.postAuctionBin.endsAt,
        startedAt: a.postAuctionBin.startedAt,
      };
    });
    res.json({ success: true, data: { lots: data, hours: BIN_HOURS } });
  } catch (error) {
    console.error("List Last Chance error:", error);
    res.status(500).json({ success: false, message: "Could not load Last Chance" });
  }
};

// GET /api/v1/buy-it-now/lot/:id?currency=EUR   – listing panel and seller setup
export const lotStatus = async (req, res) => {
  try {
    const auction = await loadLot(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: "Listing not found" });
    const display = displayCurrencyFor(req, auction);
    const bin = auction.postAuctionBin || {};
    const live = binIsLive(auction);

    const out = {
      live,
      status: bin.status || null,
      displayCurrency: display,
      price: live || bin.status === "sold" ? toDisplay(bin.price, auction.baseCurrency, display) : null,
      priceInBase: live ? bin.price : null,
      endsAt: live ? bin.endsAt : null,
      hours: BIN_HOURS,
    };

    if (canManage(req.user, auction)) {
      const state = binStartState(auction);
      const max = maxBinPrice(auction.reservePrice);
      const top = topBidOf(auction);
      out.manage = {
        canSetup: state.allowed,
        mode: state.mode, // "schedule" (before the end) or "start" (after the end)
        reason: state.reason || null,
        maxPrice: max ? toDisplay(max, auction.baseCurrency, display) : null,
        topBid: top ? toDisplay(top, auction.baseCurrency, display) : null,
        scheduledPrice: bin.status === "scheduled" ? toDisplay(bin.price, auction.baseCurrency, display) : null,
        livePrice: live ? toDisplay(bin.price, auction.baseCurrency, display) : null,
        note: bin.note || null,
        startWindowHours: START_WINDOW_HOURS,
        startDeadline: auction.status === "reserve_not_met" ? startDeadlineFor(auction) : null,
        // Top bid already within 10% of the reserve: Last Chance can't work.
        blockedByTopBid: auction.status === "reserve_not_met" && top > 0 && max <= top,
      };
    }
    res.json({ success: true, data: out });
  } catch (error) {
    console.error("Last Chance status error:", error);
    res.status(500).json({ success: false, message: "Could not load Last Chance" });
  }
};

// POST /api/v1/buy-it-now/lot/:id/setup   { price, currency }
// Before the end: saves the price (starts automatically if the reserve isn't met).
// After the end (reserve not met): starts the 48 hours now.
export const setup = async (req, res) => {
  try {
    const auction = await loadLot(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: "Listing not found" });
    if (!canManage(req.user, auction)) return res.status(403).json({ success: false, message: "Only the seller can set up Last Chance." });

    const state = binStartState(auction);
    if (!state.allowed) return res.status(400).json({ success: false, message: state.reason });

    const price = toBase(req.body?.price, displayCurrencyFor(req, auction), auction.baseCurrency);

    if (state.mode === "schedule") {
      const error = binPriceError(auction, price, { atEnd: false });
      if (error) return res.status(400).json({ success: false, message: error });
      auction.postAuctionBin = { price, status: "scheduled", note: undefined };
      await auction.save();
      return res.json({ success: true, message: "Saved. If the reserve isn't met, the lot goes on Last Chance for 48 hours at this price.", data: { status: "scheduled" } });
    }

    await startBin(auction, price, { startedBy: STAFF.has(req.user.userType) ? "admin" : "seller" });
    res.json({ success: true, message: "Your lot is now on Last Chance for 48 hours.", data: { status: "live", endsAt: auction.postAuctionBin.endsAt } });
  } catch (error) {
    console.error("Last Chance setup error:", error);
    fail(res, error, "Could not set up Last Chance");
  }
};

// PATCH /api/v1/buy-it-now/lot/:id/price   { price, currency }  – lower a live price
export const lowerPrice = async (req, res) => {
  try {
    const auction = await loadLot(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: "Listing not found" });
    if (!canManage(req.user, auction)) return res.status(403).json({ success: false, message: "Only the seller can change the price." });
    if (!binIsLive(auction)) return res.status(400).json({ success: false, message: "This lot isn't on Last Chance." });

    const price = toBase(req.body?.price, displayCurrencyFor(req, auction), auction.baseCurrency);
    if (!(price < auction.postAuctionBin.price)) {
      return res.status(400).json({ success: false, message: "The price can only be lowered while the lot is on Last Chance." });
    }
    const error = binPriceError(auction, price, { atEnd: true });
    if (error) return res.status(400).json({ success: false, message: error });

    const updated = await Auction.findOneAndUpdate(
      { _id: auction._id, "postAuctionBin.status": "live" },
      { $set: { "postAuctionBin.price": price } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ success: false, message: "This lot has just been sold." });
    broadcastAuctionChange(auction._id);
    res.json({ success: true, message: "Price lowered." });
  } catch (error) {
    console.error("Last Chance lower price error:", error);
    fail(res, error, "Could not change the price");
  }
};

// DELETE /api/v1/buy-it-now/lot/:id/setup
// Seller: remove a price set in advance. Staff: also take a live lot off Last Chance.
export const cancel = async (req, res) => {
  try {
    const auction = await loadLot(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: "Listing not found" });
    if (!canManage(req.user, auction)) return res.status(403).json({ success: false, message: "Not allowed." });
    const status = auction.postAuctionBin?.status;

    if (status === "scheduled") {
      auction.postAuctionBin = { status: null };
      await auction.save();
      return res.json({ success: true, message: "Last Chance price removed." });
    }
    if (status === "live" && STAFF.has(req.user.userType)) {
      const updated = await Auction.findOneAndUpdate(
        { _id: auction._id, "postAuctionBin.status": "live" },
        { $set: { "postAuctionBin.status": "cancelled", "postAuctionBin.endedAt": new Date(), "postAuctionBin.note": `Taken off by RexBid${req.body?.reason ? `: ${req.body.reason}` : ""}` } },
        { new: true }
      );
      if (!updated) return res.status(409).json({ success: false, message: "This lot has just been sold." });
      broadcastAuctionChange(auction._id);
      return res.json({ success: true, message: "Taken off Last Chance." });
    }
    if (status === "live") {
      return res.status(400).json({ success: false, message: "Once a lot is on Last Chance it stays for the full 48 hours. Contact RexBid if something has changed." });
    }
    res.status(400).json({ success: false, message: "There's nothing to cancel." });
  } catch (error) {
    console.error("Last Chance cancel error:", error);
    fail(res, error, "Could not cancel");
  }
};

// POST /api/v1/buy-it-now/lot/:id/buy   { expectedPrice, currency }
export const buy = async (req, res) => {
  try {
    const buyer = req.user;
    if (!buyer?.isActive) return res.status(400).json({ success: false, message: "Your account is inactive." });
    if (!buyer?.isVerified) {
      return res.status(400).json({ success: false, message: "Please wait until your account has been verified before buying." });
    }
    if (req.body?.agreed !== true) {
      return res.status(400).json({ success: false, message: "Please confirm you agree to buy at this price." });
    }
    const auction = await loadLot(req.params.id);
    if (!auction) return res.status(404).json({ success: false, message: "Listing not found" });

    const expected = req.body?.expectedPriceInBase != null ? Number(req.body.expectedPriceInBase) : null;
    await buyBin(auction._id, buyer, expected);
    res.json({ success: true, message: "Congratulations, it's yours! We've emailed you the next steps for payment and collection." });
  } catch (error) {
    console.error("Last Chance purchase error:", error);
    fail(res, error, "Could not complete the purchase");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin → Last Chance: invite sellers of unsold reserve lots (e.g. last night's
// sale) to use Last Chance. Nothing is sent until the admin presses Send.
// ─────────────────────────────────────────────────────────────────────────────

const INVITE_WINDOW_HOURS = START_WINDOW_HOURS;

// GET /api/v1/buy-it-now/admin/unsold?hours=36
export const adminUnsold = async (req, res) => {
  try {
    const hours = Math.min(24 * 14, Math.max(1, Number(req.query.hours) || 36));
    const since = new Date(Date.now() - hours * 36e5);
    const lots = await Auction.find({ status: "reserve_not_met", auctionType: "reserve", winner: null, endDate: { $gte: since } })
      .select("title endDate reservePrice startPrice currentPrice bidCount baseCurrency seller postAuctionBin auctionType status")
      .populate("seller", "firstName lastName companyName email userType")
      .sort({ endDate: -1 })
      .lean();
    const now = new Date();
    res.json({
      success: true,
      data: {
        hours,
        lots: lots.map((a) => {
          const state = binStartState(a, now);
          const max = maxBinPrice(a.reservePrice);
          const top = topBidOf(a);
          const blocked = top > 0 && max <= top;
          return {
            _id: a._id,
            title: a.title,
            endDate: a.endDate,
            currency: a.baseCurrency || "EUR",
            reservePrice: a.reservePrice,
            topBid: top || null,
            maxPrice: max,
            binStatus: a.postAuctionBin?.status || null,
            invitedAt: a.postAuctionBin?.invitedAt || null,
            startDeadline: startDeadlineFor(a),
            eligible: state.allowed && !blocked && !a.postAuctionBin?.status,
            reason: blocked ? "Top bid already within 10% of reserve" : a.postAuctionBin?.status ? `Last Chance ${a.postAuctionBin.status}` : state.allowed ? null : state.reason,
            seller: a.seller ? {
              _id: a.seller._id,
              name: [a.seller.firstName, a.seller.lastName].filter(Boolean).join(" "),
              companyName: a.seller.companyName || null,
              email: a.seller.email,
            } : null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Admin unsold lots error:", error);
    res.status(500).json({ success: false, message: "Could not load unsold lots" });
  }
};

// Groups the chosen lots by seller, ready for one email each.
const buildInvites = async (auctionIds) => {
  const ids = (Array.isArray(auctionIds) ? auctionIds : []).filter((id) => mongoose.isValidObjectId(id));
  const lots = await Auction.find({ _id: { $in: ids }, status: "reserve_not_met", auctionType: "reserve", winner: null });
  const bySeller = new Map();
  const deadline = new Date(Date.now() + INVITE_WINDOW_HOURS * 36e5);
  for (const a of lots) {
    const top = topBidOf(a);
    const max = maxBinPrice(a.reservePrice);
    if (a.postAuctionBin?.status || (top > 0 && max <= top)) continue; // not eligible
    const key = String(a.seller);
    if (!bySeller.has(key)) bySeller.set(key, []);
    bySeller.get(key).push(a);
  }
  const sellers = await User.find({ _id: { $in: [...bySeller.keys()] } }).select("firstName companyName email userType").lean();
  return sellers
    .filter((s) => s.email)
    .map((seller) => {
      const auctions = bySeller.get(String(seller._id)) || [];
      const items = auctions.map((a) => ({
        _id: a._id,
        title: a.title,
        currency: a.baseCurrency || "EUR",
        topBid: topBidOf(a) || null,
        maxPrice: maxBinPrice(a.reservePrice),
      }));
      return { seller, auctions, rendered: renderBinInviteEmail(seller, items, { deadline }), deadline };
    })
    .filter((i) => i.auctions.length > 0);
};

// POST /api/v1/buy-it-now/admin/invite/preview  { auctionIds }
export const adminInvitePreview = async (req, res) => {
  try {
    const invites = await buildInvites(req.body?.auctionIds);
    res.json({
      success: true,
      data: {
        sellerCount: invites.length,
        lotCount: invites.reduce((n, i) => n + i.auctions.length, 0),
        recipients: invites.map((i) => ({ email: i.seller.email, name: i.seller.companyName || i.seller.firstName, lots: i.auctions.length })),
        previews: invites.map((i) => ({ to: i.seller.email, subject: i.rendered.subject, html: i.rendered.html })),
      },
    });
  } catch (error) {
    console.error("Invite preview error:", error);
    res.status(500).json({ success: false, message: "Could not build the preview" });
  }
};

// POST /api/v1/buy-it-now/admin/invite/test  { auctionIds }  – first seller's email, to the admin only
export const adminInviteTest = async (req, res) => {
  try {
    const invites = await buildInvites(req.body?.auctionIds);
    if (!invites.length) return res.status(400).json({ success: false, message: "None of the selected lots can be invited." });
    const first = invites[0];
    await sendBinInviteEmail(req.user.email, { ...first.rendered, subject: `[TEST to ${first.seller.email}] ${first.rendered.subject}` });
    res.json({ success: true, message: `Test sent to ${req.user.email}` });
  } catch (error) {
    console.error("Invite test error:", error);
    res.status(500).json({ success: false, message: "Could not send the test email" });
  }
};

// POST /api/v1/buy-it-now/admin/invite/send  { auctionIds, confirm: true }
export const adminInviteSend = async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, message: "Please confirm before sending." });
    const invites = await buildInvites(req.body?.auctionIds);
    let sent = 0;
    const failed = [];
    for (const inv of invites) {
      try {
        await sendBinInviteEmail(inv.seller.email, inv.rendered);
        sent += 1;
        await Auction.updateMany(
          { _id: { $in: inv.auctions.map((a) => a._id) } },
          { $set: { "postAuctionBin.invitedAt": new Date(), "postAuctionBin.startDeadline": inv.deadline } }
        );
      } catch (e) {
        console.error(`Invite to ${inv.seller.email} failed:`, e.message);
        failed.push(inv.seller.email);
      }
    }
    res.json({
      success: true,
      message: `Sent to ${sent} seller${sent === 1 ? "" : "s"}${failed.length ? `, ${failed.length} failed` : ""}.`,
      data: { sent, failed },
    });
  } catch (error) {
    console.error("Invite send error:", error);
    res.status(500).json({ success: false, message: "Could not send the emails" });
  }
};

// GET /api/v1/buy-it-now/admin/sold   – Last Chance sales in the last 14 days
export const adminRecentSales = async (req, res) => {
  try {
    const lots = await recentBinSales(14);
    res.json({
      success: true,
      data: {
        lots: lots.map((a) => ({
          _id: a._id,
          title: a.title,
          currency: a.baseCurrency || "EUR",
          price: a.postAuctionBin.price,
          soldAt: a.postAuctionBin.soldAt,
          endsAt: a.postAuctionBin.endsAt,
          paid: a.paymentStatus === "completed",
          buyer: a.winner ? { name: a.winner.companyName || [a.winner.firstName, a.winner.lastName].filter(Boolean).join(" "), email: a.winner.email } : null,
          seller: a.seller ? { name: a.seller.companyName || [a.seller.firstName, a.seller.lastName].filter(Boolean).join(" "), email: a.seller.email } : null,
        })),
      },
    });
  } catch (error) {
    console.error("Admin recent Last Chance sales error:", error);
    res.status(500).json({ success: false, message: "Could not load Last Chance sales" });
  }
};

// POST /api/v1/buy-it-now/admin/lot/:id/undo   { reason, relist, notifySeller, confirm: true }
export const adminUndo = async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, message: "Please confirm." });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Lot not found" });
    const result = await undoBinPurchase(req.params.id, req.user, {
      reason: req.body?.reason,
      relist: req.body?.relist !== false,
      notifySeller: req.body?.notifySeller !== false,
    });
    res.json({
      success: true,
      message: result.endsAt
        ? `Purchase undone. The lot is back on Last Chance until ${new Date(result.endsAt).toLocaleString("en-IE", { timeZone: "Europe/Dublin", weekday: "short", hour: "numeric", minute: "2-digit" })}.`
        : "Purchase undone. The lot is unsold.",
      data: { endsAt: result.endsAt, saleRemoved: result.saleRemoved },
    });
  } catch (error) {
    console.error("Undo Last Chance error:", error);
    fail(res, error, "Could not undo the purchase");
  }
};
