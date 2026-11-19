import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildExport, makeAnonymiser, redactText, toCsv,
    LOT_COLUMNS, BID_COLUMNS, USER_COLUMNS, SALE_COLUMNS,
} from "../scripts/exportAnalysis.js";

const seller = { _id: "s1", userType: "company", createdAt: "2026-07-01T10:00:00Z", firstName: "Sean", email: "sean@example.com", phone: "0871234567", address: { county: "Mayo", line1: "1 Main St" } };
const bidderA = { _id: "b1", userType: "bidder", createdAt: "2026-08-02T10:00:00Z", isPaymentVerified: true, email: "a@example.com", address: { county: "Cork" } };
const bidderB = { _id: "b2", userType: "bidder", createdAt: "2026-08-03T10:00:00Z", isPaymentVerified: false, address: { county: "Kerry" } };

const end = "2026-11-10T20:00:00Z"; // 20:00 Dublin (GMT in November)
const auctions = [
    { _id: "old", seller: "s1", title: "MF 135 Tractor", createdAt: "2026-07-01T00:00:00Z", endDate: "2026-07-10T20:00:00Z", status: "reserve_not_met", bids: [] },
    {
        _id: "a1", seller: "s1", title: "MF 135 tractor!", categories: ["Tractors", "Vintage"], auctionType: "reserve",
        status: "reserve_not_met", baseCurrency: "EUR", createdAt: "2026-11-01T09:00:00Z",
        startDate: "2026-11-03T20:00:00Z", endDate: end, startPrice: 2000, reservePrice: 8000,
        location: "Ballinrobe, call 087 123 4567",
        bids: [
            { bidder: "b1", amount: 2500, timestamp: "2026-11-05T12:00:00Z" },
            { bidder: "b2", amount: 3000, timestamp: "2026-11-10T19:30:00Z", isProxyBid: true },
            { bidder: "b1", amount: 6000, timestamp: "2026-11-10T19:55:00Z" },
        ],
        proxyBids: [{ bidder: "b2" }], views: 400, watchlistCount: 12,
    },
    {
        _id: "a2", seller: "s1", title: "Trailer", categories: ["Trailers"], status: "sold", createdAt: "2026-11-02T09:00:00Z",
        startDate: "2026-11-03T20:00:00Z", endDate: end, startPrice: 500, reservePrice: 1000, finalPrice: 1200, winner: "b2",
        bids: [{ bidder: "b2", amount: 1200, timestamp: "2026-11-10T19:59:00Z" }],
    },
];
const sales = [{
    auction: "a2", saleDate: end, status: "paid", itemPrice: 1200, buyerFee: 72, total: 1272,
    payment: { paidAt: "2026-11-12T20:00:00Z", method: "bank_transfer" },
    failure: { reason: "Buyer emailed joe@x.ie, ring 0861112223" },
    buyer: { user: "b2", region: "ROI", name: "Should not appear" }, seller: { user: "s1" },
}];

const run = () => buildExport({ auctions, users: [seller, bidderA, bidderB], sales }, { from: "2026-08-01", anon: makeAnonymiser("fixed") });

test("lots: date filter, reserve gap, bidder depth, timing, relist detection", () => {
    const { lots } = run();
    assert.equal(lots.length, 2, "July lot is outside the range");
    const a1 = lots.find((l) => l.category === "Tractors");
    assert.equal(a1.top_bid, 6000);
    assert.equal(a1.reserve_met, false);
    assert.equal(a1.reserve_gap_pct, -25);
    assert.equal(a1.start_to_reserve_pct, 25);
    assert.equal(a1.bid_count, 3);
    assert.equal(a1.unique_bidders, 2);
    assert.equal(a1.proxy_bidders, 1);
    assert.equal(a1.bids_last_hour, 2);
    assert.equal(a1.end_weekday, "Tue");
    assert.equal(a1.end_hour_dublin, "20");
    assert.equal(a1.duration_days, 7);
    assert.equal(a1.seller_type, "company");
    assert.equal(a1.seller_county, "Mayo");
    assert.equal(a1.seller_lot_number, 2);
    assert.ok(a1.relist_of.startsWith("lot_"), "same seller + same title earlier = relist");
    assert.equal(a1.location, "Ballinrobe, call [phone]");
    const a2 = lots.find((l) => l.category === "Trailers");
    assert.equal(a2.has_winner, true);
    assert.equal(a2.relist_of, "");
});

test("bids and users: per-person stats with pseudonymous ids", () => {
    const { bids, users } = run();
    assert.equal(bids.length, 4);
    const last = bids.find((b) => b.amount === 6000);
    assert.equal(last.minutes_before_end, 5);
    assert.equal(last.bid_number_on_lot, 3);
    assert.match(last.bidder_id, /^user_[0-9a-f]{12}$/);
    const b2 = users.find((u) => u.county === "Kerry");
    assert.equal(b2.bids, 2);
    assert.equal(b2.lots_bid_on, 2);
    assert.equal(b2.lots_won, 1);
    const s = users.find((u) => u.user_type === "company");
    assert.equal(s.lots_listed, 3);
    // ids join across files
    assert.equal(bids.find((b) => b.amount === 1200).bidder_id, b2.user_id);
});

test("sales: days to pay and redacted failure text", () => {
    const { sales: rows } = run();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].days_to_pay, 2);
    assert.equal(rows[0].failure_reason, "Buyer emailed [email], ring [phone]");
});

test("no personal data in any CSV", () => {
    const r = run();
    const csv = [toCsv(r.lots, LOT_COLUMNS), toCsv(r.bids, BID_COLUMNS), toCsv(r.users, USER_COLUMNS), toCsv(r.sales, SALE_COLUMNS)].join("\n");
    for (const secret of ["Sean", "sean@example.com", "0871234567", "1 Main St", "a@example.com", "Should not appear", "joe@x.ie", "b1", "s1"]) {
        assert.ok(!csv.includes(secret), `leaked: ${secret}`);
    }
});

test("csv escaping and redaction helpers", () => {
    assert.equal(toCsv([{ a: 'x,"y"', b: true }], ["a", "b"]), 'a,b\n"x,""y""",true\n');
    assert.equal(redactText("see https://x.ie/a now"), "see [link] now");
});
