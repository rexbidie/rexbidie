// Sale night: anti-sniping ripple to later lots.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { planCascade, cascadeEnabled } from "../src/services/saleNightService.js";

const T = (hhmm) => new Date(`2026-11-19T${hhmm}:00Z`);
const hhmm = (d) => d.toISOString().slice(11, 16);
const lots = (...times) => times.map((t, i) => ({ _id: `L${i + 1}`, endDate: T(t) }));

afterEach(() => { delete process.env.ANTI_SNIPE_CASCADE; });

test("a 1-minute extension ripples through lots 2 minutes apart", () => {
  // Lot closing 20:30 extends to 20:31; the rest were every 2 minutes.
  const moves = planCascade({ oldEnd: T("20:30"), newEnd: T("20:31"), laterLots: lots("20:32", "20:34", "20:36"), gapMs: 120000 });
  assert.deepEqual(moves.map((m) => [m.id, hhmm(m.from), hhmm(m.to)]), [["L1", "20:32", "20:33"], ["L2", "20:34", "20:35"], ["L3", "20:36", "20:37"]]);
});

test("the ripple stops at the first lot that already has room", () => {
  const moves = planCascade({ oldEnd: T("20:30"), newEnd: T("20:31"), laterLots: lots("20:32", "20:40", "20:42"), gapMs: 120000 });
  assert.deepEqual(moves.map((m) => [m.id, hhmm(m.to)]), [["L1", "20:33"]]);
});

test("lots that closed together stay together; wider gaps shrink to 2 minutes at most", () => {
  const moves = planCascade({ oldEnd: T("20:30"), newEnd: T("20:31"), laterLots: lots("20:32", "20:32", "20:33"), gapMs: 120000 });
  assert.deepEqual(moves.map((m) => hhmm(m.to)), ["20:33", "20:33", "20:34"]);
});

test("lots closing at the same time as the extended one, or earlier, aren't moved", () => {
  const moves = planCascade({ oldEnd: T("20:30"), newEnd: T("20:31"), laterLots: lots("20:28", "20:30"), gapMs: 120000 });
  assert.deepEqual(moves, []);
});

test("repeated extensions keep pushing, never pulling back", () => {
  const first = planCascade({ oldEnd: T("20:30"), newEnd: T("20:31"), laterLots: lots("20:32"), gapMs: 120000 });
  const second = planCascade({ oldEnd: T("20:31"), newEnd: T("20:32"), laterLots: [{ _id: "L1", endDate: first[0].to }], gapMs: 120000 });
  assert.equal(hhmm(second[0].to), "20:34");
  assert.deepEqual(planCascade({ oldEnd: T("20:31"), newEnd: T("20:30"), laterLots: lots("20:32") }), []);
});

test("switch: ANTI_SNIPE_CASCADE=off turns it off", () => {
  assert.equal(cascadeEnabled(), true);
  process.env.ANTI_SNIPE_CASCADE = "off";
  assert.equal(cascadeEnabled(), false);
});
