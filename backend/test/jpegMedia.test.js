import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { isAllowedKey, jpegUrlFor, instagramCrop, toJpeg, jpegHandler } from "../src/utils/jpegMedia.js";

test("only public photo folders are allowed", () => {
    assert.ok(isAllowedKey("auction-photos/image-1794252088493.webp"));
    assert.ok(isAllowedKey("catalogue-images/x.png"));
    assert.ok(!isAllowedKey("identification-documents/passport.jpg"));
    assert.ok(!isAllowedKey("auction-documents/a.pdf"));
    assert.ok(!isAllowedKey("auction-photos/../identification-documents/a.jpg"));
    assert.ok(!isAllowedKey("auction-photos/sub/a.webp"));
    assert.ok(!isAllowedKey("a.webp"));
});

test("jpegUrlFor rewrites media.rexbid.ie photos only", () => {
    assert.equal(
        jpegUrlFor("https://media.rexbid.ie/auction-photos/image-1.webp"),
        "https://rexbid-backend.onrender.com/media/jpeg/auction-photos/image-1.webp"
    );
    assert.equal(
        jpegUrlFor("https://media.rexbid.ie/auction-photos/image-1.webp", { instagram: true }),
        "https://rexbid-backend.onrender.com/media/jpeg/auction-photos/image-1.webp?fit=instagram"
    );
    assert.equal(jpegUrlFor("https://example.com/a.webp"), "https://example.com/a.webp");
    assert.equal(jpegUrlFor("https://media.rexbid.ie/a.webp"), "https://media.rexbid.ie/a.webp");
    assert.equal(jpegUrlFor(undefined), undefined);
});

test("instagram crop keeps 4:5 to 1.91:1", () => {
    assert.equal(instagramCrop(1200, 900), null);
    assert.deepEqual(instagramCrop(900, 1600), { left: 0, top: 237, width: 900, height: 1125 });
    assert.deepEqual(instagramCrop(3000, 1000), { left: 545, top: 0, width: 1910, height: 1000 });
});

test("toJpeg converts WebP to a JPEG no wider than 1440px", async () => {
    const webp = await sharp({ create: { width: 2000, height: 3000, channels: 3, background: "#4a7" } }).webp().toBuffer();
    const out = await toJpeg(webp, { instagram: true });
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "jpeg");
    assert.ok(meta.width <= 1440);
    const ratio = meta.width / meta.height;
    assert.ok(ratio >= 0.8 && ratio <= 1.91, `ratio ${ratio}`);
});

test("handler refuses folders that aren't public photos", async () => {
    let status;
    const res = { status: (s) => ((status = s), res), send: () => res, set: () => res };
    await jpegHandler({ params: ["identification-documents/a.jpg"], query: {} }, res);
    assert.equal(status, 404);
});
