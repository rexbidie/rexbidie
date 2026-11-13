import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
    countyFrom,
    layoutFor,
    wrapName,
    nextAuctionsText,
    parseCollageQuery,
    buildCollage,
    collageHandler,
} from "../src/utils/collage.js";

test("county is taken from messy locations", () => {
    assert.equal(countyFrom("Tullow, Carlow"), "Carlow");
    assert.equal(countyFrom("Co. Cavan"), "Cavan");
    assert.equal(countyFrom("Enniscrone Co. Sligo"), "Sligo");
    assert.equal(countyFrom("Ballaghaderreen"), "Roscommon");
    assert.equal(countyFrom("Newcastle West"), "Limerick");
    assert.equal(countyFrom("H12 FR84"), "");
    assert.equal(countyFrom(""), "");
});

test("grid size follows the number of lots", () => {
    assert.deepEqual(layoutFor(4), { cols: 2, rows: 2 });
    assert.deepEqual(layoutFor(6), { cols: 3, rows: 2 });
    assert.deepEqual(layoutFor(9), { cols: 3, rows: 3 });
});

test("names wrap onto at most two lines", () => {
    assert.deepEqual(wrapName("2020 Kubota K008-3 mini digger", 22), ["2020 Kubota K008-3", "mini digger"]);
    const long = wrapName("A very long machine name that goes on and on and on", 15);
    assert.equal(long.length, 2);
    assert.ok(long[1].endsWith("…"));
});

test("next auctions text uses the next two closing days", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    const dates = ["2026-11-17T19:30:00Z", "2026-11-17T23:00:00Z", "2026-11-19T19:30:00Z", "2026-11-24T19:30:00Z", "2026-11-10T19:30:00Z"];
    assert.equal(nextAuctionsText(dates, now), "Next auctions close Tue 17th & Thu 19th Nov from 7.30PM");
    assert.equal(nextAuctionsText(["2026-11-17T19:30:00Z"], now), "Next auction closes Tue 17th Nov from 7.30PM");
    assert.equal(nextAuctionsText([], now), "");
});

test("query must name a kind and 1-9 valid listing ids", () => {
    assert.ok(parseCollageQuery({ kind: "x", lots: "6af21d3de76fac469a545c26" }).error);
    assert.ok(parseCollageQuery({ kind: "sold", lots: "" }).error);
    assert.ok(parseCollageQuery({ kind: "sold", lots: "nope" }).error);
    assert.ok(parseCollageQuery({ kind: "sold", lots: Array(10).fill("6af21d3de76fac469a545c26").join(",") }).error);
    const ok = parseCollageQuery({ kind: "sold", lots: "6af21d3de76fac469a545c26", names: "A&B <x>|C", places: "Cavan" });
    assert.equal(ok.kind, "sold");
    assert.deepEqual(ok.names, ["A&B <x>", "C"]);
});

test("handler refuses bad queries before touching the database", async () => {
    let status;
    const res = { status: (s) => ((status = s), res), send: () => res, set: () => res };
    await collageHandler({ query: { kind: "sold", lots: "not-an-id" } }, res);
    assert.equal(status, 400);
});

test("collage renders a 1080x1350 JPEG, with and without photos", async () => {
    const photo = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#c55" } }).jpeg().toBuffer();
    const items = [
        { name: "2020 Kubota K008-3 mini digger", place: "Longford", right: "€6,600", photo },
        { name: "Ifor Williams TA510", place: "Laois", right: "€4,150", photo },
        { name: "A+ 7 ton low loader", place: "Roscommon", right: "€3,400", photo: null },
        { name: "Names with <tags> & ampersands", place: "Sligo", right: "€3,350", photo },
        { name: "1987 Honda C70 Supercub", place: "Donegal", right: "€2,250", photo },
    ];
    const jpg = await buildCollage({
        header: "SOLD",
        sub: "Tuesday's auction on RexBid",
        items,
        footer1: "Next auctions close Tue 17th & Thu 19th Nov from 7.30PM",
        footer2: "rexbid.ie",
    });
    const meta = await sharp(jpg).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
});
