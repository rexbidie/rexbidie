import { test } from "node:test";
import assert from "node:assert/strict";
import { regionForUser, regionForItem } from "../src/utils/region.js";
import { calculateVat } from "../src/utils/vat.js";
import { renderPaymentRequestPdf } from "../src/utils/documents/pdf.js";
import {
    buildSale,
    makeReference,
    applyVat,
    paymentRequestSnapshot,
    instructionsFromPaymentIntent,
    instructionsFromFunding,
    isCardCheckoutAvailable,
    cardCheckoutUrl,
} from "../src/services/saleService.js";

// ─── Regions ───────────────────────────────────────────────

test("region: Eircode means ROI", () => {
    assert.equal(regionForUser({ address: { line1: "Rathcormick", postCode: "C15 Y684", country: "Ireland" } }), "ROI");
});

test("region: BT postcode means NI even when country says United Kingdom or Ireland", () => {
    assert.equal(regionForUser({ address: { postCode: "BT71 4AB", country: "United Kingdom" } }), "NI");
    assert.equal(regionForUser({ address: { postCode: "BT1 1AA", country: "Ireland" } }), "NI");
});

test("region: NI county beats a vague country", () => {
    assert.equal(regionForUser({ address: { county: "Co. Tyrone", country: "United Kingdom" } }), "NI");
});

test("region: GB postcode", () => {
    assert.equal(regionForUser({ address: { postCode: "SW1A 1AA", country: "United Kingdom" } }), "GB");
});

test("region: unknown when there is nothing to go on", () => {
    assert.equal(regionForUser({ address: {} }), null);
});

test("region: item uses listing location, then seller address", () => {
    assert.equal(regionForItem({ location: "Cork, Ireland" }, null), "ROI");
    assert.equal(regionForItem({ location: "Dungannon, Co. Tyrone" }, null), "NI");
    assert.equal(regionForItem({ location: "" }, { address: { postCode: "BT60 1AA" } }), "NI");
});

// ─── VAT ───────────────────────────────────────────────────

test("vat: not applicable when listing is not VAT applicable", () => {
    const v = calculateVat({ vatApplicable: false, itemPrice: 10000, itemRegion: "ROI", buyerRegion: "NI" });
    assert.equal(v.amount, 0);
    assert.equal(v.treatment, "not_applicable");
    assert.equal(v.reviewRequired, false);
});

test("vat: ROI 23%, NI 20%", () => {
    assert.equal(calculateVat({ vatApplicable: true, itemPrice: 15000, itemRegion: "ROI", buyerRegion: "ROI" }).amount, 3450);
    assert.equal(calculateVat({ vatApplicable: true, itemPrice: 10000, itemRegion: "NI", buyerRegion: "NI" }).amount, 2000);
});

test("vat: cross-border sale is flagged but still charged until an admin decides", () => {
    const v = calculateVat({ vatApplicable: true, itemPrice: 10000, itemRegion: "ROI", buyerRegion: "NI", buyerVatNumber: "XI123" });
    assert.equal(v.reviewRequired, true);
    assert.equal(v.amount, 2300);
    assert.match(v.reviewReasons[0], /Cross-border/);
});

test("vat: admin zero-rating removes VAT and clears the flag", () => {
    const v = calculateVat({
        vatApplicable: true, itemPrice: 10000, itemRegion: "ROI", buyerRegion: "NI",
        override: { treatment: "zero_rated" },
    });
    assert.equal(v.amount, 0);
    assert.equal(v.treatment, "zero_rated");
    assert.equal(v.reviewRequired, false);
});

test("vat: unknown item location is flagged", () => {
    const v = calculateVat({ vatApplicable: true, itemPrice: 1000, itemRegion: null, buyerRegion: "ROI" });
    assert.equal(v.reviewRequired, true);
});

// ─── Sale records ──────────────────────────────────────────

const AUCTION = {
    _id: "6a64b8a710e65a25f01ede06",
    title: "JCB Fastrac 1125",
    finalPrice: 15000,
    bidderCommissionAmount: 500,
    sellerCommissionAmount: 0,
    baseCurrency: "EUR",
    vatIncluded: false,
    location: "Co. Meath",
    endDate: new Date("2026-11-06T20:00:00Z"),
    paymentStatus: "pending",
};
const BUYER = {
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb", firstName: "Test", lastName: "Buyer", email: "buyer@example.com",
    address: { line1: "1 Main St", county: "Co. Meath", postCode: "C15 Y684", country: "Ireland" },
};
const SELLER = { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", companyName: "Example Transport", address: { country: "Ireland" } };

test("sale: total is item + VAT + buyer fee; no VAT on the fee", () => {
    const s = buildSale({ ...AUCTION, vatIncluded: true }, BUYER, SELLER);
    assert.equal(s.vat.amount, 3450);
    assert.equal(s.total, 15000 + 3450 + 500);
    assert.equal(s.status, "sold");
    assert.deepEqual(s.buyer.addressLines, ["1 Main St", "Co. Meath, C15 Y684", "Ireland"]);
});

test("sale: already-paid auctions start as paid", () => {
    assert.equal(buildSale({ ...AUCTION, paymentStatus: "completed" }, BUYER, SELLER).status, "paid");
});

test("sale: zero-rating recalculates the total", () => {
    const s = buildSale({ ...AUCTION, vatIncluded: true, location: "Newry, Co. Down" }, BUYER, SELLER);
    assert.equal(s.vat.reviewRequired, true);
    s.vat.override = { treatment: "zero_rated" };
    applyVat(s);
    assert.equal(s.total, 15500);
});

test("sale: reference is short and readable", () => {
    assert.equal(makeReference("JCB Fastrac 1125", "6a64b8a710e65a25f01ede06"), "JCB-1EDE06");
    assert.equal(makeReference("", "6a64b8a710e65a25f01ede06"), "RB-1EDE06");
});

// ─── Stripe and PDF ────────────────────────────────────────

test("stripe: bank details are read from the PaymentIntent", () => {
    const b = instructionsFromPaymentIntent({
        next_action: {
            display_bank_transfer_instructions: {
                type: "eu_bank_transfer",
                reference: "ABCD1234",
                financial_addresses: [{ type: "iban", iban: { iban: "IE00TEST", bic: "TESTIE2X", country: "IE", account_holder_name: "RexBid" } }],
            },
        },
    });
    assert.deepEqual(
        { iban: b.iban, bic: b.bic, ref: b.reference, holder: b.accountHolderName },
        { iban: "IE00TEST", bic: "TESTIE2X", ref: "ABCD1234", holder: "RexBid" },
    );
});

test("pdf: payment request renders", async () => {
    const s = buildSale({ ...AUCTION, vatIncluded: true }, BUYER, SELLER);
    s.stripe = { bankTransfer: { iban: "IE00TEST", bic: "TESTIE2X", accountHolderName: "RexBid", reference: "ABCD1234" } };
    const pdf = await renderPaymentRequestPdf(paymentRequestSnapshot(s, new Date("2026-11-09T10:00:00Z")));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 2000);
});

test("stripe: IBAN is read from customer funding instructions", () => {
    const b = instructionsFromFunding({
        bank_transfer: {
            type: "eu_bank_transfer",
            financial_addresses: [{ type: "iban", iban: { iban: "IE11CITI0001", bic: "CITIIE2X", country: "IE", account_holder_name: "RexBid" } }],
        },
    });
    assert.equal(b.iban, "IE11CITI0001");
    assert.equal(b.reference, undefined);
    assert.equal(instructionsFromFunding({ bank_transfer: { financial_addresses: [] } }), null);
});

test("card: sales under €1,000 can also be paid by card; €1,000 and over cannot", () => {
    assert.equal(isCardCheckoutAvailable(999, "EUR"), true);
    assert.equal(isCardCheckoutAvailable(1000, "EUR"), false);
    const small = buildSale({ ...AUCTION, finalPrice: 700, bidderCommissionAmount: 42 }, BUYER, SELLER);
    assert.equal(small.payment.cardCheckoutAvailable, true);
    assert.equal(buildSale(AUCTION, BUYER, SELLER).payment.cardCheckoutAvailable, false);
    assert.equal(cardCheckoutUrl("abc"), "https://rexbid.ie/checkout/abc");
});

test("card: a sale already paid by card is recorded with method and amount", () => {
    const s = buildSale({ ...AUCTION, finalPrice: 600, bidderCommissionAmount: 36, paymentStatus: "completed", paymentMethod: "credit_card", transactionId: "pi_x" }, BUYER, SELLER);
    assert.equal(s.status, "paid");
    assert.equal(s.payment.method, "credit_card");
    assert.equal(s.payment.amount, 636);
});

// ─── Receipts and statements ───────────────────────────────

import { addWorkingDays } from "../src/utils/workingDays.js";
import { statementSnapshot, receiptSnapshot } from "../src/services/saleLifecycleService.js";
import { renderBuyerReceiptPdf, renderSellerStatementPdf } from "../src/utils/documents/pdf.js";

test("collection: 3 working days skips weekends", () => {
    // Wednesday 11 Nov 2026 -> Monday 16 Nov
    assert.equal(addWorkingDays(new Date("2026-11-11T10:00:00Z"), 3).toISOString().slice(0, 10), "2026-11-16");
    // Friday 13 Nov -> Wednesday 18 Nov
    assert.equal(addWorkingDays(new Date("2026-11-13T10:00:00Z"), 3).toISOString().slice(0, 10), "2026-11-18");
});

test("statement: VAT goes to the seller, seller fee comes off, buyer fee is not involved", () => {
    const s = buildSale({ ...AUCTION, vatIncluded: true, sellerCommissionAmount: 450 }, BUYER, SELLER);
    const st = statementSnapshot(s, { payoutAccount: "Example, IBAN IE64 •••• 5678" });
    assert.equal(st.grossForSeller, 18450);
    assert.equal(st.sellerFee, 450);
    assert.equal(st.netPayout, 18000);
});

test("statement: no seller fee while seller commission is off", () => {
    const st = statementSnapshot(buildSale(AUCTION, BUYER, SELLER));
    assert.equal(st.netPayout, 15000);
    assert.match(st.sellerFeeDescription, /none charged/);
});

test("pdf: receipt and statement render on one page each", async () => {
    const s = buildSale({ ...AUCTION, vatIncluded: true, paymentStatus: "completed", paymentMethod: "bank_transfer", paymentDate: new Date() }, BUYER, { ...SELLER, phone: "087 000 0000" });
    for (const pdf of [await renderBuyerReceiptPdf(receiptSnapshot(s)), await renderSellerStatementPdf(statementSnapshot(s))]) {
        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
        assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length, 1);
    }
});

// ─── Reminders and payouts ─────────────────────────────────

import { dueReminder, withinSendingHours } from "../src/services/reminderService.js";
import { netPayout } from "../src/services/payoutService.js";

const H = 3600e3;
const reqSale = (dueAt, extra = {}) => ({
    status: "request_sent",
    payment: { dueAt },
    documents: [{ type: "payment_request" }],
    reminders: {},
    collection: {},
    ...extra,
});

test("reminders: payment due soon, then overdue, each once", () => {
    const due = new Date("2026-11-13T10:00:00Z");
    assert.equal(dueReminder(reqSale(due), new Date(due - 30 * H)), null);
    assert.equal(dueReminder(reqSale(due), new Date(due - 12 * H)), "payment_due_soon");
    assert.equal(dueReminder(reqSale(due, { reminders: { paymentDueSoonAt: new Date() } }), new Date(due - 6 * H)), null);
    assert.equal(dueReminder(reqSale(due), new Date(+due + H)), "payment_overdue");
    assert.equal(dueReminder(reqSale(due, { reminders: { paymentOverdueAt: new Date() } }), new Date(+due + 5 * H)), null);
});

test("reminders: none without a payment request, none for earlier sales", () => {
    const due = new Date("2026-11-13T10:00:00Z");
    assert.equal(dueReminder(reqSale(due, { documents: [] }), new Date(+due + H)), null);
    assert.equal(dueReminder(reqSale(due, { historical: true }), new Date(+due + H)), null);
});

test("reminders: collection stops once either side confirms", () => {
    const dueBy = new Date("2026-11-16T17:00:00Z");
    const paid = (c = {}) => ({ status: "paid", documents: [{ type: "buyer_receipt" }], reminders: {}, collection: { dueBy, ...c } });
    assert.equal(dueReminder(paid(), new Date(dueBy - 10 * H)), "collection_due_soon");
    assert.equal(dueReminder(paid(), new Date(+dueBy + H)), "collection_overdue");
    assert.equal(dueReminder(paid({ buyerConfirmedAt: new Date() }), new Date(+dueBy + H)), null);
});

test("reminders: only sent 08:00-20:00 Irish time", () => {
    assert.equal(withinSendingHours(new Date("2026-11-12T12:00:00Z")), true);
    assert.equal(withinSendingHours(new Date("2026-11-12T22:00:00Z")), false);
    assert.equal(withinSendingHours(new Date("2026-07-12T19:30:00Z")), false); // 20:30 IST in summer
});

test("payout: seller gets price + VAT - seller fee", () => {
    assert.equal(netPayout({ itemPrice: 15000, vat: { amount: 3450 }, sellerFee: 450 }), 18000);
    assert.equal(netPayout({ itemPrice: 700, vat: { amount: 0 }, sellerFee: 0 }), 700);
});

// ─── Stripe payout accounts ────────────────────────────────

import { prefillFor } from "../src/services/connectService.js";

test("connect: payout accounts are always set up as individuals", () => {
    const company = prefillFor({ firstName: "Pat", lastName: "Byrne", companyName: "Byrne Plant Ltd", email: "p@example.com" });
    assert.equal(company.business_type, "individual");
    assert.deepEqual(company.individual, { first_name: "Pat", last_name: "Byrne", email: "p@example.com" });
    assert.equal(company.business_profile.name, "Byrne Plant Ltd");
    assert.equal(company.company, undefined);
    const person = prefillFor({ firstName: "Ann", email: "a@example.com" });
    assert.equal(person.business_type, "individual");
    assert.equal(person.business_profile.name, "Ann");
    assert.deepEqual(prefillFor({ email: "x@example.com" }), { business_type: "individual" });
});
