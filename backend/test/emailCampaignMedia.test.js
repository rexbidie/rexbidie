import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareEmailImage, isHeic } from "../src/utils/emailImage.js";
import { toEmailHtml, alignClassesToStyles, buttonsToEmailHtml } from "../src/utils/emailHtml.js";

const photo = (w, h, format = "webp", alpha = false) =>
    sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : "#336699" } })
        [format]()
        .toBuffer();

test("email images come out as JPEG, sized for email", async () => {
    const out = await prepareEmailImage(await photo(4000, 3000, "webp"));
    assert.equal(out.contentType, "image/jpeg");
    assert.equal(out.ext, "jpg");
    assert.equal(out.width, 1200);
    assert.equal((await sharp(out.buffer).metadata()).format, "jpeg");
});

test("small images aren't enlarged; transparent PNGs stay PNG", async () => {
    const small = await prepareEmailImage(await photo(400, 300, "png"));
    assert.equal(small.width, 400);
    assert.equal(small.contentType, "image/jpeg");
    const logo = await prepareEmailImage(await photo(300, 100, "png", true));
    assert.equal(logo.contentType, "image/png");
});

test("HEIC is recognised by type or file name", async () => {
    const buf = await photo(10, 10, "jpeg");
    assert.equal(await isHeic(buf, "image/heic"), true);
    assert.equal(await isHeic(buf, "", "IMG_0001.HEIC"), true);
    assert.equal(await isHeic(buf, "image/jpeg", "a.jpg"), false);
});

test("bad image data is rejected", async () => {
    await assert.rejects(prepareEmailImage(Buffer.from("not an image")));
});

test("editor alignment becomes inline style", () => {
    assert.equal(
        alignClassesToStyles('<p class="ql-align-center">Hi</p><p>x</p>'),
        '<p class="ql-align-center" style="text-align:center;">Hi</p><p>x</p>'
    );
    assert.equal(
        alignClassesToStyles('<h2 style="color:red" class="ql-align-right">T</h2>'),
        '<h2 class="ql-align-right" style="text-align:right;color:red">T</h2>'
    );
});

test("editor buttons become an Outlook-safe table button", () => {
    const html = buttonsToEmailHtml(
        '<p>Before</p><div class="rb-email-btn" style="text-align:center"><a href="https://rexbid.ie/?a=1&amp;b=2" rel="noopener noreferrer" style="x">View lots</a></div><p>After</p>'
    );
    assert.match(html, /<table role="presentation"/);
    assert.match(html, /bgcolor="#D19F3E"/);
    assert.match(html, /href="https:\/\/rexbid\.ie\/\?a=1&amp;b=2"/);
    assert.match(html, />View lots<\/a>/);
    assert.match(html, /^<p>Before<\/p>/);
    assert.match(html, /<p>After<\/p>$/);
    assert.ok(!html.includes("rb-email-btn"));
});

test("plain links and text are left alone", () => {
    const html = '<p>See <a href="https://rexbid.ie">here</a></p>';
    assert.equal(toEmailHtml(html), html);
});
