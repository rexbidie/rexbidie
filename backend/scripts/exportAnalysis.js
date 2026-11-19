#!/usr/bin/env node
/**
 * Anonymised, READ-ONLY export for the conversion analysis.
 *
 * Writes four CSV files (lots, bids, users, sales) plus a README with row counts.
 * No names, emails, phone numbers, usernames, street addresses, card or bank
 * details leave the database. Every person and lot gets a random pseudonymous
 * ID (salted hash, new salt each run), so the files can be shared safely and
 * joined to each other, but not back to a real person.
 *
 * The script only ever runs find() queries: it never writes to the database.
 *
 * Usage (from backend/):
 *   node scripts/exportAnalysis.js                          # since 2026-08-01, into ./analysis-export
 *   node scripts/exportAnalysis.js --from 2026-08-01 --out /tmp/rexbid-export
 *
 * Connection: uses MONGODB_URI from .env, exactly like the app (db "planevault").
 * Use a read-only database user if you have one: MONGODB_URI=... node scripts/exportAnalysis.js
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TZ = "Europe/Dublin";
const STAFF_TYPES = new Set(["admin", "cashier", "staff"]);

// ---------- helpers ----------

export function makeAnonymiser(salt = crypto.randomBytes(16).toString("hex")) {
    const cache = new Map();
    return (prefix, id) => {
        if (id === null || id === undefined || id === "") return "";
        const key = `${prefix}:${String(id)}`;
        if (!cache.has(key)) {
            const h = crypto.createHash("sha256").update(`${salt}|${key}`).digest("hex").slice(0, 12);
            cache.set(key, `${prefix}_${h}`);
        }
        return cache.get(key);
    };
}

const iso = (d) => (d ? new Date(d).toISOString() : "");

function dublinParts(d) {
    if (!d) return { weekday: "", hour: "" };
    const parts = new Intl.DateTimeFormat("en-IE", {
        timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(d));
    const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
    return { weekday: get("weekday"), hour: get("hour") };
}

const round = (n, dp = 2) => (Number.isFinite(n) ? Number(n.toFixed(dp)) : "");

// Free text can contain contact details: strip emails, phone numbers and URLs.
export function redactText(s, max = 200) {
    if (!s) return "";
    return String(s)
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
        .replace(/https?:\/\/\S+/g, "[link]")
        .replace(/(\+?\d[\d\s().-]{6,}\d)/g, "[phone]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

const normTitle = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function toCsv(rows, columns) {
    const esc = (v) => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

// ---------- the export (pure: easy to test without a database) ----------

export const LOT_COLUMNS = [
    "lot_id", "category", "subcategory", "auction_type", "status", "currency",
    "created_at", "start_date", "end_date", "end_weekday", "end_hour_dublin", "duration_days",
    "start_price", "reserve_price", "buy_now_price", "top_bid", "final_price",
    "reserve_met", "reserve_gap_pct", "start_to_reserve_pct",
    "bid_count", "unique_bidders", "proxy_bidders", "first_bid_at", "last_bid_at",
    "bids_last_hour", "bids_last_24h", "retracted_bidders",
    "views", "watchlist_count", "featured", "meta_boost_package", "extras_paid",
    "allow_offers", "offers_count", "offers_accepted",
    "post_auction_bin_status", "accepted_top_bid_status", "live_buy_now_status",
    "has_winner", "seller_id", "seller_type", "seller_county", "seller_lot_number",
    "relist_of", "location",
];

export const BID_COLUMNS = [
    "lot_id", "bidder_id", "amount", "currency", "timestamp", "weekday_dublin", "hour_dublin",
    "minutes_before_end", "is_proxy", "is_buy_now", "bid_number_on_lot", "bidder_type",
];

export const USER_COLUMNS = [
    "user_id", "user_type", "created_at", "country_code", "county", "currency",
    "payment_verified", "email_verified", "identity_status", "deleted", "has_ga_client_id",
    "first_bid_at", "bids", "lots_bid_on", "lots_won", "first_win_at", "lots_listed",
];

export const SALE_COLUMNS = [
    "lot_id", "sale_date", "status", "currency", "historical", "item_price", "buyer_fee", "seller_fee",
    "vat_amount", "total", "payment_due_at", "paid_at", "payment_method", "days_to_pay",
    "card_checkout_available", "failed_at", "failure_reason", "buyer_collected_at", "seller_collected_at",
    "payout_paid_at", "buyer_region", "buyer_id", "seller_id",
];

export function buildExport({ auctions, users, sales }, { from, anon = makeAnonymiser() } = {}) {
    const fromDate = from ? new Date(from) : null;
    const usersById = new Map(users.map((u) => [String(u._id), u]));
    const typeOf = (id) => usersById.get(String(id))?.userType || "";

    const inRange = (a) =>
        !fromDate ||
        (a.createdAt && new Date(a.createdAt) >= fromDate) ||
        (a.endDate && new Date(a.endDate) >= fromDate);

    // Oldest first so "seller_lot_number" and "relist_of" make sense.
    const lotsAll = [...auctions].sort((x, y) => new Date(x.createdAt || 0) - new Date(y.createdAt || 0));
    const sellerCounter = new Map();
    const seenTitles = new Map(); // seller|title → earliest lot id
    const lots = [];
    const bids = [];
    const perUser = new Map();
    const stat = (id) => {
        const k = String(id);
        if (!perUser.has(k)) perUser.set(k, { bids: 0, lots: new Set(), firstBid: null, won: 0, firstWin: null, listed: 0 });
        return perUser.get(k);
    };

    for (const a of lotsAll) {
        const sellerKey = String(a.seller || "");
        const n = (sellerCounter.get(sellerKey) || 0) + 1;
        sellerCounter.set(sellerKey, n);
        const titleKey = `${sellerKey}|${normTitle(a.title)}`;
        const relistOf = seenTitles.get(titleKey);
        if (!relistOf) seenTitles.set(titleKey, a._id);
        if (a.seller) stat(a.seller).listed += 1;

        const realBids = (a.bids || []).filter((b) => !b.isBuyNow).sort((x, y) => new Date(x.timestamp) - new Date(y.timestamp));
        const allBids = (a.bids || []).slice().sort((x, y) => new Date(x.timestamp) - new Date(y.timestamp));
        const end = a.endDate ? new Date(a.endDate) : null;
        const topBid = realBids.reduce((m, b) => Math.max(m, Number(b.amount) || 0), 0);
        const reserve = Number(a.reservePrice) || 0;
        const won = Boolean(a.winner);

        allBids.forEach((b, i) => {
            const s = stat(b.bidder);
            s.bids += 1;
            s.lots.add(String(a._id));
            if (!s.firstBid || new Date(b.timestamp) < s.firstBid) s.firstBid = new Date(b.timestamp);
        });
        if (won) {
            const s = stat(a.winner);
            s.won += 1;
            const at = a.endDate ? new Date(a.endDate) : null;
            if (at && (!s.firstWin || at < s.firstWin)) s.firstWin = at;
        }

        if (!inRange(a)) continue;
        const lotId = anon("lot", a._id);
        const seller = usersById.get(sellerKey);
        const endParts = dublinParts(end);
        const offers = a.offers || [];

        lots.push({
            lot_id: lotId,
            category: a.categories?.[0] || "",
            subcategory: a.categories?.[1] || "",
            auction_type: a.auctionType || "",
            status: a.status || "",
            currency: a.baseCurrency || "EUR",
            created_at: iso(a.createdAt),
            start_date: iso(a.startDate),
            end_date: iso(a.endDate),
            end_weekday: endParts.weekday,
            end_hour_dublin: endParts.hour,
            duration_days: a.startDate && end ? round((end - new Date(a.startDate)) / 864e5, 1) : "",
            start_price: a.startPrice ?? "",
            reserve_price: reserve || "",
            buy_now_price: a.buyNowPrice ?? "",
            top_bid: topBid || "",
            final_price: a.finalPrice ?? "",
            reserve_met: reserve ? topBid >= reserve : "",
            reserve_gap_pct: reserve && topBid ? round(((topBid - reserve) / reserve) * 100, 1) : "",
            start_to_reserve_pct: reserve && a.startPrice ? round((a.startPrice / reserve) * 100, 1) : "",
            bid_count: realBids.length,
            unique_bidders: new Set(realBids.map((b) => String(b.bidder))).size,
            proxy_bidders: new Set((a.proxyBids || []).map((p) => String(p.bidder))).size,
            first_bid_at: iso(realBids[0]?.timestamp),
            last_bid_at: iso(realBids.at(-1)?.timestamp),
            bids_last_hour: end ? realBids.filter((b) => end - new Date(b.timestamp) <= 36e5).length : "",
            bids_last_24h: end ? realBids.filter((b) => end - new Date(b.timestamp) <= 864e5).length : "",
            retracted_bidders: (a.retractedBids || []).length,
            views: a.views ?? "",
            watchlist_count: a.watchlistCount ?? "",
            featured: Boolean(a.isFeatured),
            meta_boost_package: a.metaBoostPackage || "",
            extras_paid: a.extrasPayment?.status === "completed" ? a.extrasPayment.amount || 0 : 0,
            allow_offers: Boolean(a.allowOffers),
            offers_count: offers.length,
            offers_accepted: offers.filter((o) => o.status === "accepted").length,
            post_auction_bin_status: a.postAuctionBin?.status || "",
            accepted_top_bid_status: a.acceptedTopBid?.status || "",
            live_buy_now_status: a.liveBuyNow?.status || "",
            has_winner: won,
            seller_id: anon("user", a.seller),
            seller_type: seller?.userType || "",
            seller_county: seller?.address?.county || "",
            seller_lot_number: n,
            relist_of: relistOf ? anon("lot", relistOf) : "",
            location: redactText(a.location, 60),
        });

        allBids.forEach((b, i) => {
            const p = dublinParts(b.timestamp);
            bids.push({
                lot_id: lotId,
                bidder_id: anon("user", b.bidder),
                amount: b.amount ?? "",
                currency: a.baseCurrency || "EUR",
                timestamp: iso(b.timestamp),
                weekday_dublin: p.weekday,
                hour_dublin: p.hour,
                minutes_before_end: end ? round((end - new Date(b.timestamp)) / 6e4, 1) : "",
                is_proxy: Boolean(b.isProxyBid),
                is_buy_now: Boolean(b.isBuyNow),
                bid_number_on_lot: i + 1,
                bidder_type: typeOf(b.bidder),
            });
        });
    }

    const userRows = users.map((u) => {
        const s = perUser.get(String(u._id));
        return {
            user_id: anon("user", u._id),
            user_type: u.userType || "",
            created_at: iso(u.createdAt),
            country_code: u.countryCode || u.address?.country || "",
            county: u.address?.county || "",
            currency: u.currency || "",
            payment_verified: Boolean(u.isPaymentVerified),
            email_verified: Boolean(u.isEmailVerified || u.emailVerifiedAt),
            identity_status: u.identificationStatus || "",
            deleted: Boolean(u.deletedAt),
            has_ga_client_id: Boolean(u.gaClientId),
            first_bid_at: iso(s?.firstBid),
            bids: s?.bids || 0,
            lots_bid_on: s?.lots.size || 0,
            lots_won: s?.won || 0,
            first_win_at: iso(s?.firstWin),
            lots_listed: s?.listed || 0,
        };
    });

    const saleRows = sales
        .filter((s) => !fromDate || !s.saleDate || new Date(s.saleDate) >= fromDate)
        .map((s) => ({
            lot_id: anon("lot", s.auction),
            sale_date: iso(s.saleDate),
            status: s.status || "",
            currency: s.currency || "EUR",
            historical: Boolean(s.historical),
            item_price: s.itemPrice ?? "",
            buyer_fee: s.buyerFee ?? "",
            seller_fee: s.sellerFee ?? "",
            vat_amount: s.vat?.amount ?? "",
            total: s.total ?? "",
            payment_due_at: iso(s.payment?.dueAt),
            paid_at: iso(s.payment?.paidAt),
            payment_method: s.payment?.method || "",
            days_to_pay: s.payment?.paidAt && s.saleDate ? round((new Date(s.payment.paidAt) - new Date(s.saleDate)) / 864e5, 1) : "",
            card_checkout_available: Boolean(s.payment?.cardCheckoutAvailable),
            failed_at: iso(s.failure?.at),
            failure_reason: redactText(s.failure?.reason),
            buyer_collected_at: iso(s.collection?.buyerConfirmedAt),
            seller_collected_at: iso(s.collection?.sellerConfirmedAt),
            payout_paid_at: iso(s.payout?.paidAt),
            buyer_region: s.buyer?.region || "",
            buyer_id: anon("user", s.buyer?.user),
            seller_id: anon("user", s.seller?.user),
        }));

    // Staff accounts stay in (flagged by user_type) so totals reconcile; filter them in analysis.
    return { lots, bids, users: userRows, sales: saleRows, staffTypes: [...STAFF_TYPES] };
}

// ---------- CLI ----------

const AUCTION_FIELDS = {
    title: 1, categories: 1, auctionType: 1, status: 1, baseCurrency: 1, createdAt: 1, startDate: 1, endDate: 1,
    startPrice: 1, reservePrice: 1, buyNowPrice: 1, finalPrice: 1, winner: 1, seller: 1, location: 1,
    "bids.bidder": 1, "bids.amount": 1, "bids.timestamp": 1, "bids.isProxyBid": 1, "bids.isBuyNow": 1,
    "proxyBids.bidder": 1, "retractedBids.bidder": 1, views: 1, watchlistCount: 1, isFeatured: 1,
    metaBoostPackage: 1, "extrasPayment.status": 1, "extrasPayment.amount": 1, allowOffers: 1, "offers.status": 1,
    "postAuctionBin.status": 1, "acceptedTopBid.status": 1, "liveBuyNow.status": 1,
};
// Deliberately NOT selected: names, email, phone, username, address lines, postcode, card, bank, tokens.
const USER_FIELDS = {
    userType: 1, createdAt: 1, countryCode: 1, "address.county": 1, "address.country": 1, currency: 1,
    isPaymentVerified: 1, isEmailVerified: 1, emailVerifiedAt: 1, identificationStatus: 1, deletedAt: 1, gaClientId: 1,
};
const SALE_FIELDS = {
    auction: 1, saleDate: 1, status: 1, currency: 1, historical: 1, itemPrice: 1, buyerFee: 1, sellerFee: 1,
    "vat.amount": 1, total: 1, "payment.dueAt": 1, "payment.paidAt": 1, "payment.method": 1,
    "payment.cardCheckoutAvailable": 1, "failure.at": 1, "failure.reason": 1, "collection.buyerConfirmedAt": 1,
    "collection.sellerConfirmedAt": 1, "payout.paidAt": 1, "buyer.region": 1, "buyer.user": 1, "seller.user": 1,
};

function parseArgs(argv) {
    const out = { from: "2026-08-01", out: path.resolve("analysis-export") };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--from") out.from = argv[++i];
        else if (argv[i] === "--out") out.out = path.resolve(argv[++i]);
    }
    if (Number.isNaN(new Date(out.from).getTime())) throw new Error(`Bad --from date: ${out.from}`);
    return out;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    await import("dotenv/config");
    const { default: mongoose } = await import("mongoose");
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (backend/.env).");

    await mongoose.connect(`${process.env.MONGODB_URI}/planevault`, { readPreference: "secondaryPreferred" });
    const db = mongoose.connection.db;
    try {
        const [auctions, users, sales] = await Promise.all([
            db.collection("auctions").find({}, { projection: AUCTION_FIELDS }).toArray(),
            db.collection("users").find({}, { projection: USER_FIELDS }).toArray(),
            db.collection("sales").find({}, { projection: SALE_FIELDS }).toArray(),
        ]);
        const result = buildExport({ auctions, users, sales }, { from: args.from });

        fs.mkdirSync(args.out, { recursive: true });
        fs.writeFileSync(path.join(args.out, "lots.csv"), toCsv(result.lots, LOT_COLUMNS));
        fs.writeFileSync(path.join(args.out, "bids.csv"), toCsv(result.bids, BID_COLUMNS));
        fs.writeFileSync(path.join(args.out, "users.csv"), toCsv(result.users, USER_COLUMNS));
        fs.writeFileSync(path.join(args.out, "sales.csv"), toCsv(result.sales, SALE_COLUMNS));
        const readme = [
            `RexBid analysis export, generated ${new Date().toISOString()}`,
            `Lots created or ending since ${args.from}. Amounts are in each row's currency (EUR or GBP).`,
            `IDs are random pseudonyms (new salt each run): they join across files but not to real people.`,
            `Staff accounts (${result.staffTypes.join(", ")}) are included; filter on user_type / bidder_type.`,
            "",
            `lots.csv  ${result.lots.length} rows`,
            `bids.csv  ${result.bids.length} rows`,
            `users.csv ${result.users.length} rows`,
            `sales.csv ${result.sales.length} rows`,
        ].join("\n");
        fs.writeFileSync(path.join(args.out, "README.txt"), readme + "\n");
        console.log(readme);
        console.log(`\nWritten to ${args.out}`);
    } finally {
        await mongoose.disconnect();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
}
