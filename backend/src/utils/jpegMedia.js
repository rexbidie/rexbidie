// JPEG copies of listing photos.
//
// Photos are stored on media.rexbid.ie as WebP. Instagram only accepts JPEG,
// and Facebook/WhatsApp link previews are more reliable with JPEG, so
// GET /media/jpeg/<folder>/<file> fetches the stored photo and returns it as
// a JPEG (max 1440px wide). Add ?fit=instagram to crop very tall or very wide
// photos into the 4:5 – 1.91:1 range Instagram allows.
//
// Only public photo folders are allowed, never ID documents or uploads
// that aren't meant to be public.

import sharp from "sharp";

export const MEDIA_ORIGIN = (process.env.R2_PUBLIC_URL || "https://media.rexbid.ie").replace(/\/+$/, "");
export const PUBLIC_BACKEND = (process.env.PUBLIC_BACKEND_URL || "https://rexbid-backend.onrender.com").replace(/\/+$/, "");

const ALLOWED_FOLDERS = ["auction-photos", "catalogue-images", "category-images"];
const KEY_RE = new RegExp(`^(${ALLOWED_FOLDERS.join("|")})/[A-Za-z0-9._-]{1,200}\\.(webp|png|jpe?g|avif)$`, "i");
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_WIDTH = 1440;

export const isAllowedKey = (key) => typeof key === "string" && KEY_RE.test(key) && !key.includes("..");

/** Public JPEG URL for a media.rexbid.ie photo URL; other URLs are returned unchanged. */
export const jpegUrlFor = (url, { instagram = false } = {}) => {
    if (typeof url !== "string" || !url.startsWith(`${MEDIA_ORIGIN}/`)) return url;
    const key = url.slice(MEDIA_ORIGIN.length + 1).split(/[?#]/)[0];
    if (!isAllowedKey(key)) return url;
    return `${PUBLIC_BACKEND}/media/jpeg/${key}${instagram ? "?fit=instagram" : ""}`;
};

/** Crop box (or null) that brings width/height into Instagram's 4:5 – 1.91:1 range. */
export const instagramCrop = (width, height) => {
    if (!width || !height) return null;
    const ratio = width / height;
    if (ratio < 0.8) {
        const h = Math.floor(width / 0.8);
        return { left: 0, top: Math.floor((height - h) / 2), width, height: h };
    }
    if (ratio > 1.91) {
        const w = Math.floor(height * 1.91);
        return { left: Math.floor((width - w) / 2), top: 0, width: w, height };
    }
    return null;
};

export async function toJpeg(input, { instagram = false } = {}) {
    let img = sharp(input, { failOn: "none" }).rotate();
    if (instagram) {
        const { data, info } = await img.toBuffer({ resolveWithObject: true });
        img = sharp(data);
        const box = instagramCrop(info.width, info.height);
        if (box) img = img.extract(box);
    }
    return img
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
}

// Small in-memory cache so repeated requests (Instagram/Facebook fetch the
// same image more than once) don't re-convert.
const cache = new Map();
const CACHE_MAX = 40;
const remember = (k, v) => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(k, v);
};

// Convert one photo at a time. Facebook and Instagram fetch many photos at
// once, and converting them all together ran the server out of memory.
let queue = Promise.resolve();
const oneAtATime = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
};

export async function jpegHandler(req, res) {
    const key = req.params[0];
    const instagram = req.query.fit === "instagram";
    if (!isAllowedKey(key)) return res.status(404).send("Not found");

    const cacheKey = `${key}|${instagram ? "ig" : ""}`;
    let body = cache.get(cacheKey);
    if (!body) {
        try {
            body = await oneAtATime(async () => {
                const cached = cache.get(cacheKey); // converted while this request waited
                if (cached) return cached;
                const upstream = await fetch(`${MEDIA_ORIGIN}/${key}`, { signal: AbortSignal.timeout(10_000) });
                if (upstream.status === 404) return { status: 404, text: "Not found" };
                if (!upstream.ok) return { status: 502, text: "Image unavailable" };
                const type = upstream.headers.get("content-type") || "";
                const length = Number(upstream.headers.get("content-length") || 0);
                if (!type.startsWith("image/") || length > MAX_BYTES) return { status: 415, text: "Not an image" };
                const buf = Buffer.from(await upstream.arrayBuffer());
                if (buf.length > MAX_BYTES) return { status: 415, text: "Too large" };
                const jpeg = await toJpeg(buf, { instagram });
                remember(cacheKey, jpeg);
                return jpeg;
            });
            if (!Buffer.isBuffer(body)) return res.status(body.status).send(body.text);
        } catch (err) {
            console.error("[jpegMedia]", err?.message);
            return res.status(502).send("Image unavailable");
        }
    }
    res.set("Content-Type", "image/jpeg");
    // Photo file names are unique, so the JPEG never changes.
    res.set("Cache-Control", "public, max-age=604800, immutable");
    return res.send(body);
}
