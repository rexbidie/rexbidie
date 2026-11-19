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
