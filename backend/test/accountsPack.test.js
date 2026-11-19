// Monthly accounts spreadsheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "zlib";
import { buildPackSheets, monthRange } from "../src/services/accountsService.js";
import { buildLedger } from "../src/services/commissionLedgerService.js";
import { buildXlsx } from "../src/utils/xlsx.js";

const unix = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const ch = (id, amount, txn, o = {}) => ({ id, status: "succeeded", paid: true, amount, amount_refunded: 0, created: unix("2026-11-15T20:00:00Z"), balance_transaction: txn, metadata: {}, ...o });
const bt = (id, amount, fee) => ({ id, amount, fee, net: amount - fee, available_on: unix("2026-11-18T00:00:00Z") });

const sample = () => {
    const charges = [
        ch("ch_sale", 63600, "t1", { payment_intent: "pi_sale" }),
        ch("ch_feat", 3000, "t2", { metadata: { type: "listing_promotion" } }),
        ch("ch_oct", 10000, "t3", { created: unix("2026-10-30T12:00:00Z"), metadata: { type: "listing_extras" } }), // last month
    ];
    const balanceTxns = [bt("t1", 63600, 1000), bt("t2", 3000, 70), bt("t3", 10000, 150)];
    const sales = [{ _id: "S1", reference: "WOO-1", title: "Woods", status: "paid", currency: "EUR", itemPrice: 600, vat: { amount: 0 }, sellerFee: 30, buyerFee: 36, total: 636, payment: { transactionId: "pi_sale" } }];
    const transfers = [{ kind: "payout", payoutId: "po_1", items: [{ chargeId: "ch_sale", amount: 51.66 }, { chargeId: "ch_feat", amount: 29.3 }] }];
    const ledger = buildLedger({ charges, balanceTxns, sales, transfers, now: new Date("2026-11-30T12:00:00Z") });
    const { start, end } = monthRange("2026-11");
    return buildPackSheets({
        month: "2026-11", start, end, ledger, sales, transfers,
        payouts: [
            { id: "po_1", amount: 8096, created: unix("2026-11-19T10:00:00Z"), arrival_date: unix("2026-11-20T00:00:00Z"), status: "paid", description: "RexBid commission" },
            { id: "po_old", amount: 15000, created: unix("2026-11-05T10:00:00Z"), arrival_date: unix("2026-11-06T00:00:00Z"), status: "paid" },
        ],
        stripeFees: [{ created: unix("2026-11-01T09:00:00Z"), description: "Connect (2026-10): Account Volume Billing", amount: -4859, fee: 1118, net: -5977 }],
        refunds: [{ id: "re_1", created: unix("2026-11-18T21:00:00Z"), amount: 245100, currency: "eur", status: "pending", metadata: { reference: "200-1" } }],
        sellerTransfers: [{ id: "tr_1", created: unix("2026-11-19T09:00:00Z"), amount: 57000, amount_reversed: 0, transfer_group: "WOO-1", description: "WOO-1 Woods" }],
    });
};

test("the month runs on Irish time", () => {
    const { start, end } = monthRange("2026-07");
    assert.equal(start.toISOString(), "2026-06-30T23:00:00.000Z"); // summer: Irish midnight is 23:00 UTC
    assert.equal(end.toISOString(), "2026-07-31T23:00:00.000Z");
    assert.throws(() => monthRange("2026-13"), /month/);
});

test("pack: income split, BOI payouts itemised, fees, refunds, seller payouts", () => {
    const sheets = sample();
    const by = Object.fromEntries(sheets.map((s) => [s.name, s.rows]));
    assert.deepEqual(Object.keys(by), ["Summary", "Income", "BOI payouts", "BOI payout lines", "Stripe fees", "Refunds", "Seller payouts"]);
    assert.equal(by.Income.length, 3); // header + 2 November payments (October's left out)
    const sale = by.Income.find((r) => r[1] === "WOO-1");
    assert.deepEqual([sale[4], sale[7], sale[9], sale[10], sale[13], sale[14], sale[15]], [636, 570, 36, 30, 51.66, 51.66, "po_1"]);
    assert.equal(by["BOI payouts"][1][6], "No (made outside RexBid)");
    assert.equal(by["BOI payouts"][2][6], "Yes");
    assert.equal(by["BOI payout lines"].length, 3);
    const summary = Object.fromEntries(by.Summary.filter((r) => typeof r[0] === "string").map((r) => [r[0], r[1]]));
    assert.equal(summary["Buyer commission"], 36);
    assert.equal(summary["Featured / Meta Boost fees"], 30);
    assert.equal(summary["Stripe monthly charges billed (ex VAT)"], 48.59);
    assert.equal(summary["VAT on Stripe monthly charges"], 11.18);
    assert.equal(summary["Refunds to buyers"], 2451);
    assert.equal(summary["Paid to sellers through Stripe"], 570);
    assert.equal(summary["Total arriving in BOI this month"], 230.96);
    assert.equal(summary["  of which made outside RexBid (not itemised)"], 150);
});

test("xlsx: a valid zip with one sheet file per sheet", () => {
    const buf = buildXlsx(sample());
    assert.equal(buf.subarray(0, 4).toString("hex"), "504b0304");
    const names = [];
    for (let i = 0; i < buf.length - 4; i++) {
        if (buf.readUInt32LE(i) === 0x02014b50) names.push(buf.subarray(i + 46, i + 46 + buf.readUInt16LE(i + 28)).toString());
    }
    assert.ok(names.includes("xl/workbook.xml"));
    assert.equal(names.filter((n) => n.startsWith("xl/worksheets/")).length, 7);
    assert.ok(zlib.crc32); // Node 22+
});
