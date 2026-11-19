import { test } from "node:test";
import assert from "node:assert/strict";
import { usernameBase } from "../src/controllers/user.controller.js";

test("generated usernames are lowercase ASCII from the first name", () => {
    assert.equal(usernameBase("Seán"), "sean");
    assert.equal(usernameBase("Mary-Kate O'Neill"), "marykateoneill");
    assert.equal(usernameBase("Bartholomew-Alexander"), "bartholomewalexa");
});

test("falls back to 'bidder' when there's nothing usable", () => {
    assert.equal(usernameBase(""), "bidder");
    assert.equal(usernameBase(undefined), "bidder");
    assert.equal(usernameBase("李"), "bidder");
});

import { normalisePhone, normalisePostcode, regionFromPostcode } from "../src/utils/contactValidation.js";

test("Eircodes and UK postcodes are accepted and tidied; anything else is rejected", () => {
    assert.equal(normalisePostcode("d02x285"), "D02 X285");
    assert.equal(normalisePostcode("D6W XY12"), "D6W XY12");
    assert.equal(normalisePostcode("bt15gs"), "BT1 5GS");
    assert.equal(normalisePostcode("SW1A1AA"), "SW1A 1AA");
    assert.equal(normalisePostcode("T12 AB34"), null, "B is not used in Eircodes");
    assert.equal(normalisePostcode("Co. Mayo"), null);
    assert.equal(normalisePostcode(""), null);
});

test("post code decides the region", () => {
    assert.equal(regionFromPostcode("A65 F4E2"), "ROI");
    assert.equal(regionFromPostcode("BT48 7AB"), "NI");
    assert.equal(regionFromPostcode("M1 1AE"), "GB");
    assert.equal(regionFromPostcode("nonsense"), null);
});

test("Irish and UK phone numbers in any common format; junk rejected", () => {
    assert.equal(normalisePhone("087 123 4567"), "0871234567");
    assert.equal(normalisePhone("+353 (0)87 123 4567"), "+353871234567");
    assert.equal(normalisePhone("00353 87 1234567"), "+353871234567");
    assert.equal(normalisePhone("+44 7700 900123"), "+447700900123");
    assert.equal(normalisePhone("01 234 5678"), "012345678");
    for (const bad of ["", "12345", "0871", "phone", "+353 12"]) assert.equal(normalisePhone(bad), null, bad);
});
