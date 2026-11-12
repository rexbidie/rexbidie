// Server-side <head> tags for shared links.
//
// The website is a client-rendered app: every URL is served the same
// index.html and the real title/description/image are filled in by JavaScript.
// Facebook, WhatsApp, LinkedIn, X and most AI crawlers do not run JavaScript,
// so a shared listing showed only the generic RexBid preview.
//
// These helpers take the site's own index.html and swap in the tags for one
// listing or catalogue, so the very first HTML response already carries the
// right title, description, image and price. The page then loads normally.

import { jpegUrlFor } from "./jpegMedia.js";

const SITE = "https://rexbid.ie";
const DEFAULT_IMAGE = `${SITE}/og-default.jpg`;
const CURRENCY_SYMBOL = { EUR: "€", GBP: "£" };
const SOLD = ["sold", "sold_buy_now"];
const ENDED = ["ended", "reserve_not_met", "cancelled"];

export const escapeHtml = (s = "") =>
    String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

export const toPlainText = (html = "", max = 155) => {
    const text = String(html)
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    return `${sp > 40 ? cut.slice(0, sp) : cut}…`;
};

const money = (amount, currency = "EUR") =>
    amount || amount === 0
        ? `${CURRENCY_SYMBOL[currency] || ""}${Math.round(Number(amount)).toLocaleString("en-IE")}`
        : "";

const cap = (s = "", max = 60) => (s.length <= max ? s : `${s.slice(0, max - 1).trim()}…`);

const firstPhoto = (auction) =>
    (auction.photos || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((p) => p.url)
        .find(Boolean);

/** Tags for a listing. `auction` is a plain object (lean / sanitized). */
export const buildAuctionMeta = (auction) => {
    const url = `${SITE}/auction/${auction._id}`;
    const currency = auction.baseCurrency || "EUR";
    const name = (auction.title || "Machinery").trim();
    const county = (auction.location || "").trim();
    const isSold = SOLD.includes(auction.status);
    const isEnded = ENDED.includes(auction.status);
    const price = isSold ? auction.finalPrice || auction.currentPrice : auction.currentPrice || auction.startPrice;

    const title = isSold
        ? `${cap(name, 40)} – Sold for ${money(price, currency)} | RexBid`
        : `${cap(name, 38)} for Auction${county ? ` – ${cap(county, 18)}` : ""} | RexBid`;

    // Social card title: short and price-led.
    const ogTitle = isSold
        ? `${cap(name, 60)} – Sold for ${money(price, currency)}`
        : isEnded
            ? `${cap(name, 70)} – Auction ended`
            : `${cap(name, 60)} – ${auction.bidCount > 0 ? "Current bid" : "Starting bid"} ${money(price, currency)}`;

    const bits = [];
    if (!isSold && !isEnded && auction.endDate) {
        bits.push(
            `Ends ${new Date(auction.endDate).toLocaleString("en-IE", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "Europe/Dublin",
            })}.`
        );
    }
    if (county) bits.push(`${county}.`);
    bits.push("RexBid online auction.");
    const lead = toPlainText(auction.description, 90);
    const description = toPlainText(`${bits.join(" ")} ${lead}`, 158);

    // JPEG copy: Facebook and WhatsApp previews are unreliable with WebP.
    const image = jpegUrlFor(firstPhoto(auction)) || DEFAULT_IMAGE;
    const specs = auction.specifications || {};
    const brand = specs.brand || specs.Brand || specs.make || specs.Make;

    return {
        title,
        description,
        url,
        image,
        type: "product",
        ogTitle,
        extra: [
            ["property", "product:price:amount", Number(price || 0).toFixed(2)],
            ["property", "product:price:currency", currency],
            ["property", "product:availability", isSold ? "out of stock" : isEnded ? "discontinued" : "in stock"],
            ["property", "product:condition", "used"],
            ...(brand ? [["property", "product:brand", String(brand).trim()]] : []),
        ],
        jsonLd: {
            "@context": "https://schema.org",
            "@type": "Product",
            name,
            description: toPlainText(auction.description, 500) || name,
            url,
            image: [image],
            ...(brand ? { brand: { "@type": "Brand", name: String(brand).trim() } } : {}),
            offers: {
                "@type": "Offer",
                url,
                priceCurrency: currency,
                price: Number(price || 0).toFixed(2),
                availability: isSold
                    ? "https://schema.org/SoldOut"
                    : isEnded
                        ? "https://schema.org/Discontinued"
                        : "https://schema.org/InStock",
            },
        },
    };
};

/** Tags for a catalogue (weekly auction day). */
export const buildCatalogueMeta = (catalogue, total = 0) => {
    const url = `${SITE}/catalogue/${catalogue._id}`;
    const date = catalogue.closingDate ? new Date(catalogue.closingDate) : null;
    const dateText = date
        ? date.toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Dublin" })
        : "";
    const past = date && date < new Date();
    const lots = total ? ` – ${total} Lots` : "";
    const title = past ? `Machinery Auction Results ${dateText}${lots} | RexBid` : `Machinery Auction ${dateText}${lots} | RexBid`;
    return {
        title,
        ogTitle: title.replace(" | RexBid", ""),
        description: past
            ? `Results from the RexBid machinery auction that closed ${dateText}.${total ? ` ${total} lots` : ""} of tractors, plant and farm equipment.`
            : `${total ? `${total} lots` : "Lots"} of tractors, plant and farm machinery closing ${dateText}. Bid online at RexBid.`,
        url,
        image: catalogue.image?.url || DEFAULT_IMAGE,
        type: "website",
        extra: [],
        jsonLd: null,
    };
};

export const notFoundMeta = (what = "Page") => ({
    title: `${what} not found | RexBid`,
    description: "This page doesn't exist on RexBid.",
    noindex: true,
});

// Tags the page template already has that we replace.
const STRIP_PATTERNS = [
    /<title>[\s\S]*?<\/title>\s*/gi,
    /<meta\s+[^>]*name=["']description["'][^>]*>\s*/gi,
    /<meta\s+[^>]*name=["']robots["'][^>]*>\s*/gi,
    /<meta\s+[^>]*property=["'](?:og|product):[^"']+["'][^>]*>\s*/gi,
    /<meta\s+[^>]*name=["']twitter:[^"']+["'][^>]*>\s*/gi,
    /<link\s+[^>]*rel=["']canonical["'][^>]*>\s*/gi,
];

/** Replace the head tags of the site's index.html with `meta`. */
export const injectHead = (templateHtml, meta) => {
    let html = templateHtml;
    for (const re of STRIP_PATTERNS) html = html.replace(re, "");

    const m = (attr, key, content) => `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
    const tags = [`<title>${escapeHtml(meta.title)}</title>`, m("name", "description", meta.description)];

    if (meta.noindex) {
        tags.push(m("name", "robots", "noindex, follow"));
    } else {
        tags.push(
            `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
            m("property", "og:site_name", "RexBid"),
            m("property", "og:locale", "en_IE"),
            m("property", "og:type", meta.type || "website"),
            m("property", "og:title", meta.ogTitle || meta.title),
            m("property", "og:description", meta.description),
            m("property", "og:url", meta.url),
            m("property", "og:image", meta.image || DEFAULT_IMAGE),
            m("name", "twitter:card", "summary_large_image"),
            ...(meta.extra || []).map(([a, k, v]) => m(a, k, v))
        );
        if (meta.jsonLd) {
            // Escape "<" so listing text can never close the script tag.
            tags.push(
                `<script type="application/ld+json" id="share-jsonld">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`
            );
        }
    }

    const block = `\n    ${tags.join("\n    ")}\n`;
    return html.includes("</head>") ? html.replace("</head>", `${block}  </head>`) : block + html;
};
