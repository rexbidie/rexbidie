// Branded photo collages for Facebook / Instagram posts.
//
// GET /media/collage.jpg?kind=sold&lots=<id>,<id>,...[&names=A|B|...][&places=X|Y|...]
//   kind=sold     "SOLD" header, sale price on each tile (sold lots only)
//   kind=closing  "BID NOW" header for catalogue / full-list posts
// Up to 9 lots. Prices, photos and dates always come from the database;
// names and counties can be overridden (the listing titles are often terse)
// but are length-limited and escaped.
//
// Layout (1080x1350, 4:5, shows full height on Facebook and Instagram):
// cream background, RexBid logo, gold header, white label boxes, navy footer.
// Tiles are taller than wide because most listing photos are upright phone
// photos; each photo is centre-cropped so the machine stays in view.

import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import sharp from "sharp";
import Auction from "../models/auction.model.js";
import { MEDIA_ORIGIN } from "./jpegMedia.js";

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets");
const FONT = (f) => path.join(ASSETS, "fonts", f);
const LOGO = path.join(ASSETS, "rexbid-logo.webp");

export const NAVY = "#13243F";
export const GOLD = "#E5A41B";
export const CREAM = "#FAF6EC";
const GREY = "#6b7280";

const W = 1080;
const H = 1350;
const HEAD = 180;
const FOOT = 110;
const GAP = 12;
export const MAX_LOTS = 9;
const TZ = "Europe/Dublin";
// Until the auction close times change, posts say "from 7.30PM".
const CLOSING_TIME = process.env.SOCIAL_CLOSING_TIME_TEXT || "from 7.30PM";

const COUNTIES = [
    "Antrim", "Armagh", "Carlow", "Cavan", "Clare", "Cork", "Derry", "Donegal", "Down", "Dublin",
    "Fermanagh", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford",
    "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Tyrone",
    "Waterford", "Westmeath", "Wexford", "Wicklow",
];
const TOWN_COUNTY = {
    ballaghaderreen: "Roscommon", castlerea: "Roscommon", boyle: "Roscommon", enniscrone: "Sligo",
    ballinasloe: "Galway", kerrykeel: "Donegal", rathmullan: "Donegal", letterkenny: "Donegal",
    dundalk: "Louth", slane: "Meath", navan: "Meath", tullow: "Carlow", portadown: "Armagh",
    ballinrobe: "Mayo", crossmolina: "Mayo", newbliss: "Monaghan", "newcastle west": "Limerick",
    kenmare: "Kerry", tralee: "Kerry", naas: "Kildare", portlaoise: "Laois", ballacolla: "Laois",
};

/** Best guess at the county from a free-text location ("Tullow, Carlow", "Co. Cavan", "H12 FR84"). */
export function countyFrom(location = "") {
    const s = String(location).trim();
    if (!s) return "";
    for (const c of COUNTIES) {
        if (new RegExp(`\\b${c}\\b`, "i").test(s)) return c;
    }
    const lower = s.toLowerCase();
    for (const [town, county] of Object.entries(TOWN_COUNTY)) {
        if (lower.includes(town)) return county;
    }
    // Eircodes and anything else we can't place: leave blank rather than guess.
    return /\d/.test(s) ? "" : s.replace(/^co\.?\s+/i, "").slice(0, 24);
}

export const layoutFor = (n) => (n <= 4 ? { cols: 2, rows: 2 } : n <= 6 ? { cols: 3, rows: 2 } : { cols: 3, rows: 3 });

/** Split a name into at most 2 lines of ~maxChars, adding "…" if it's cut. */
export function wrapName(name, maxChars) {
    const words = String(name).trim().split(/\s+/);
    const lines = [""];
    for (const w of words) {
        const cur = lines[lines.length - 1];
        if (cur && (cur + " " + w).length > maxChars) lines.push(w);
        else lines[lines.length - 1] = (cur + " " + w).trim();
    }
    if (lines.length > 2) {
        lines[1] = `${lines.slice(1).join(" ").slice(0, maxChars - 1).trimEnd()}…`;
    }
    return lines.slice(0, 2);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const FONTS = {
    medium: ["Inter Medium", "Inter-Medium.otf"],
    bold: ["Inter Bold", "Inter-Bold.otf"],
    black: ["Inter Black", "Inter-Black.otf"],
    blackItalic: ["Inter Black Italic", "Inter-BlackItalic.otf"],
};

async function text(str, { weight = "bold", size = 24, color = NAVY }) {
    const [family, file] = FONTS[weight];
    const { data, info } = await sharp({
        text: {
            text: `<span foreground="${color}">${esc(str)}</span>`,
            font: `${family} ${size}`,
            fontfile: FONT(file),
            rgba: true,
            dpi: 72,
        },
    })
        .png()
        .toBuffer({ resolveWithObject: true });
    return { input: data, width: info.width, height: info.height };
}

const ordinal = (d) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
const parts = (date) => {
    const p = Object.fromEntries(
        new Intl.DateTimeFormat("en-IE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })
            .formatToParts(date)
            .map((x) => [x.type, x.value])
    );
    return { weekday: p.weekday, day: Number(p.day), month: p.month };
};
const dayKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);

/** "Tue 17th & Thu 19th Nov" from the upcoming closing dates (first two days). */
export function nextAuctionsText(endDates, now = new Date()) {
    const days = [];
    for (const d of endDates.map((x) => new Date(x)).filter((d) => d > now).sort((a, b) => a - b)) {
        if (!days.some((x) => dayKey(x) === dayKey(d))) days.push(d);
        if (days.length === 2) break;
    }
    if (!days.length) return "";
    const fmt = (d, withMonth) => {
        const p = parts(d);
        return `${p.weekday.slice(0, 3)} ${ordinal(p.day)}${withMonth ? ` ${p.month.slice(0, 3)}` : ""}`;
    };
    if (days.length === 1) return `Next auction closes ${fmt(days[0], true)} ${CLOSING_TIME}`;
    const sameMonth = parts(days[0]).month === parts(days[1]).month;
    return `Next auctions close ${fmt(days[0], !sameMonth)} & ${fmt(days[1], true)} ${CLOSING_TIME}`;
}

export const auctionDayText = (date) => {
    const p = parts(new Date(date));
    return { weekday: p.weekday, long: `${p.weekday} ${p.day} ${p.month}` };
};

/**
 * Draw the collage. items: [{ name, place, right, photo: Buffer|null }].
 * Pure apart from the bundled font/logo files, so it can be tested offline.
 */
export async function buildCollage({ header, sub, items, footer1, footer2 }) {
    const n = Math.min(items.length, MAX_LOTS);
    const { cols, rows } = layoutFor(n);
    const tileW = Math.floor((W - GAP * (cols + 1)) / cols);
    const tileH = Math.floor((H - HEAD - FOOT - GAP * (rows + 1)) / rows);
    const LBL = cols === 2 ? 118 : rows === 3 ? 112 : 128;
    const PH = tileH - LBL;
    const nameSize = cols === 2 ? 26 : 22;
    const nameChars = Math.floor((tileW - 32) / (nameSize * 0.56));

    const comps = [];
    comps.push({ input: await sharp(LOGO).resize({ height: 112 }).png().toBuffer(), left: 24, top: 34 });
    const h = await text(header, { weight: "blackItalic", size: 96, color: GOLD });
    comps.push({ input: h.input, left: W - 36 - h.width, top: 22 });
    if (sub) {
        const s = await text(sub, { weight: "bold", size: 30, color: NAVY });
        comps.push({ input: s.input, left: Math.max(24, W - 36 - s.width), top: 124 });
    }

    for (let i = 0; i < n; i++) {
        const it = items[i];
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = GAP + c * (tileW + GAP);
        const y = HEAD + GAP + r * (tileH + GAP);
        const photo = it.photo
            ? await sharp(it.photo).rotate().resize(tileW, PH, { fit: "cover", position: "centre" }).toBuffer()
            : await sharp({ create: { width: tileW, height: PH, channels: 3, background: "#e7e2d6" } }).png().toBuffer();
        comps.push({ input: photo, left: x, top: y });
        comps.push({
            input: await sharp({ create: { width: tileW, height: LBL, channels: 3, background: "#ffffff" } }).png().toBuffer(),
            left: x,
            top: y + PH,
        });
        comps.push({
            input: await sharp({ create: { width: tileW, height: 6, channels: 3, background: GOLD } }).png().toBuffer(),
            left: x,
            top: y + PH,
        });
        const lines = wrapName(it.name || "", nameChars);
        for (let k = 0; k < lines.length; k++) {
            const t = await text(lines[k], { weight: "bold", size: nameSize, color: NAVY });
            comps.push({ input: t.input, left: x + 16, top: y + PH + 16 + k * (nameSize + 6) });
        }
        if (it.place) {
            const size = cols === 2 ? 23 : 21;
            const t = await text(it.place, { weight: "medium", size, color: GREY });
            // Fixed line box so counties with and without descenders line up.
            comps.push({ input: t.input, left: x + 16, top: y + tileH - 14 - Math.round(size * 1.25) });
        }
        if (it.right) {
            const t = await text(it.right, { weight: "black", size: cols === 2 ? 40 : 34, color: NAVY });
            comps.push({ input: t.input, left: x + tileW - 14 - t.width, top: y + tileH - 12 - t.height });
        }
    }

    comps.push({
        input: await sharp({ create: { width: W, height: FOOT, channels: 3, background: NAVY } }).png().toBuffer(),
        left: 0,
        top: H - FOOT,
    });
    if (footer1) {
        const t = await text(footer1, { weight: "bold", size: 31, color: "#ffffff" });
        comps.push({ input: t.input, left: Math.max(12, Math.round((W - t.width) / 2)), top: H - FOOT + 16 });
    }
    if (footer2) {
        const t = await text(footer2, { weight: "black", size: 29, color: GOLD });
        comps.push({ input: t.input, left: Math.max(12, Math.round((W - t.width) / 2)), top: H - FOOT + 60 });
    }

    return sharp({ create: { width: W, height: H, channels: 3, background: CREAM } })
        .composite(comps)
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
}

const CURRENCY = { EUR: "€", GBP: "£" };
const money = (amount, currency = "EUR") =>
    `${CURRENCY[currency] || "€"}${Math.round(Number(amount)).toLocaleString("en-IE")}`;

const firstPhotoUrl = (a) =>
    (a.photos || [])
        .slice()
        .sort((p, q) => (p.order ?? 0) - (q.order ?? 0))
        .map((p) => (typeof p === "string" ? p : p.url))
        .find(Boolean);

async function fetchPhoto(url) {
    if (typeof url !== "string" || !url.startsWith(`${MEDIA_ORIGIN}/`)) return null;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok || !(res.headers.get("content-type") || "").startsWith("image/")) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length > 15 * 1024 * 1024 ? null : buf;
    } catch {
        return null;
    }
}

const SOLD = ["sold", "sold_buy_now"];
const LIVE = ["active", "approved"];
const cleanList = (v, max) =>
    String(v || "")
        .split("|")
        .map((s) => s.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max));

/** Validate the query string. Returns { error } or { kind, ids, names, places }. */
export function parseCollageQuery(q = {}) {
    const kind = q.kind === "closing" ? "closing" : q.kind === "sold" ? "sold" : null;
    if (!kind) return { error: "kind must be sold or closing" };
    const ids = String(q.lots || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (!ids.length || ids.length > MAX_LOTS || !ids.every((id) => mongoose.isValidObjectId(id))) {
        return { error: `lots must be 1-${MAX_LOTS} listing ids` };
    }
    return { kind, ids, names: cleanList(q.names, 40), places: cleanList(q.places, 24) };
}

const cache = new Map();
const CACHE_MAX = 20;

export async function collageHandler(req, res) {
    const parsed = parseCollageQuery(req.query);
    if (parsed.error) return res.status(400).send(parsed.error);
    const { kind, ids, names, places } = parsed;

    const cacheKey = JSON.stringify(parsed);
    if (cache.has(cacheKey)) {
        res.set("Content-Type", "image/jpeg").set("Cache-Control", "public, max-age=600");
        return res.send(cache.get(cacheKey));
    }

    try {
        const docs = await Auction.find({ _id: { $in: ids } })
            .select("title location status finalPrice currentPrice baseCurrency photos endDate")
            .lean();
        const byId = new Map(docs.map((d) => [String(d._id), d]));
        const lots = ids.map((id) => byId.get(id));
        const allowed = kind === "sold" ? SOLD : [...LIVE, ...SOLD];
        if (lots.some((a) => !a || !allowed.includes(a.status))) {
            return res.status(404).send(kind === "sold" ? "Every lot must exist and be sold" : "Every lot must be live");
        }

        const items = await Promise.all(
            lots.map(async (a, i) => ({
                name: names[i] || (a.title || "").trim(),
                place: places[i] || countyFrom(a.location),
                right: kind === "sold" ? money(a.finalPrice || a.currentPrice, a.baseCurrency) : "",
                photo: await fetchPhoto(firstPhotoUrl(a)),
            }))
        );

        const latest = new Date(Math.max(...lots.map((a) => new Date(a.endDate).getTime())));
        const day = auctionDayText(latest);
        let footer1;
        if (kind === "sold") {
            const upcoming = await Auction.find({ status: { $in: LIVE }, endDate: { $gt: new Date() } })
                .select("endDate")
                .lean();
            footer1 = nextAuctionsText(upcoming.map((u) => u.endDate)) || "New lots every week";
        } else {
            footer1 = "Free to register · View the full ads and bid online";
        }
        const footer2 = Date.now() < Date.UTC(2027, 0, 1) ? "rexbid.ie · No seller fees before 2027" : "rexbid.ie";

        const jpg = await buildCollage({
            header: kind === "sold" ? "SOLD" : "BID NOW",
            sub: kind === "sold" ? `${day.weekday}'s auction on RexBid` : `Closing ${day.long} ${CLOSING_TIME}`,
            items,
            footer1,
            footer2,
        });
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, jpg);
        res.set("Content-Type", "image/jpeg").set("Cache-Control", "public, max-age=600");
        return res.send(jpg);
    } catch (err) {
        console.error("[collage]", err?.message);
        return res.status(500).send("Could not build the image");
    }
}
