// Admin → Sale Night Times: checking a set of new closing times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkChanges, SAFETY_MINUTES } from "../src/controllers/saleTimes.controller.js";

const DAY = "2026-11-17";
const NOW = new Date("2026-11-15T12:00:00Z");
const A = "6af24988e0ff5d59a69f30b3";
const B = "6af238b91d560f085416e0f0";
const C = "6af6deb25be79028442dd297";
const lots = [
  { _id: A, title: "Prodig", status: "active", endDate: new Date("2026-11-17T19:00:00Z") },
  { _id: B, title: "Breaker", status: "approved", endDate: new Date("2026-11-17T23:00:00Z") },
  { _id: C, title: "Sold thing", status: "sold", endDate: new Date("2026-11-17T19:02:00Z") },
];

test("valid changes become updates in Irish time; unchanged lines are skipped", () => {
  const { errors, updates } = checkChanges({ day: DAY, now: NOW, lots, changes: [
    { id: A, time: "19:00" },          // unchanged
    { id: B, time: "19:30" },
  ] });
  assert.deepEqual(errors, []);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, B);
  assert.equal(updates[0].to.toISOString(), "2026-11-17T19:30:00.000Z"); // November: Irish time = UTC
});

test("two lots may close at the same minute", () => {
  const { errors, updates } = checkChanges({ day: DAY, now: NOW, lots, changes: [
    { id: A, time: "19:30" }, { id: B, time: "19:30" },
  ] });
  assert.deepEqual(errors, []);
  assert.equal(updates.length, 2);
});

test("bad lines are reported and nothing is accepted from them", () => {
  const { errors } = checkChanges({ day: DAY, now: NOW, lots, changes: [
    { id: "nope", time: "19:30" },
    { id: A, time: "7.30pm" },
    { id: C, time: "19:40" },
    { id: "6af000000000000000000000", time: "19:42" },
    { id: B, time: "19:44" }, { id: B, time: "19:46" },
  ] });
  assert.equal(errors.length, 5);
  assert.match(errors[0], /isn't a listing ID/);
  assert.match(errors[1], /isn't a time/);
  assert.match(errors[2], /already closed/);
  assert.match(errors[3], /isn't closing on/);
  assert.match(errors[4], /appears twice/);
});

test(`lots closing within ${SAFETY_MINUTES} minutes, or new times that soon, are refused`, () => {
  const late = new Date("2026-11-17T18:45:00Z"); // 15 min before lot A closes
  const r1 = checkChanges({ day: DAY, now: late, lots, changes: [{ id: A, time: "20:00" }] });
  assert.match(r1.errors[0], /closes within/);
  const r2 = checkChanges({ day: DAY, now: late, lots, changes: [{ id: B, time: "19:05" }] });
  assert.match(r2.errors[0], /less than/);
});
