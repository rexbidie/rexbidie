import { test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";

// Capture emails instead of sending them.
const sent = [];
nodemailer.createTransport = () => ({
    sendMail: async (msg) => {
        sent.push(msg);
        return { messageId: "test" };
    },
    verify: async () => true,
});
const { auctionApprovedEmail, auctionListedEmail } = await import("../src/utils/nodemailer.js");

const seller = { email: "seller@example.com", firstName: "Test" };
const base = {
    _id: "abc123",
    title: "2006 Massey Ferguson 6480",
    auctionType: "reserve",
    startPrice: 4000,
    endDate: new Date("2026-11-17T19:04:00.000Z"),
};

test("approved, starting later: says approved and when it goes live, not 'now live'", async () => {
    sent.length = 0;
    await auctionApprovedEmail(seller, { ...base, startDate: new Date(Date.now() + 3 * 86400000) });
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Approved/);
    assert.match(sent[0].html, /It goes live on/);
    assert.doesNotMatch(sent[0].html, /is now live/);
    assert.match(sent[0].html, /Closing time: <strong>Tuesday, 17 November at 19:04/);
});

test("approved, already started: says live now", async () => {
    sent.length = 0;
    await auctionApprovedEmail(seller, { ...base, startDate: new Date(Date.now() - 3600000) });
    assert.match(sent[0].subject, /Live/);
    assert.match(sent[0].html, /is now live/);
});

test("live email includes the closing time", async () => {
    sent.length = 0;
    await auctionListedEmail({ ...base, startDate: new Date() }, seller);
    assert.match(sent[0].html, /Closing time: <strong>Tuesday, 17 November at 19:04/);
});
