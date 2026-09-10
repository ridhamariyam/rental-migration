/**
 * RQ-04 regression: the calendar-day walk must give the same answer in
 * every timezone.
 *
 * The dashboard's revenue chart rendered a flat ₹0 line for every user
 * east of UTC because the walk parsed local midnight and formatted UTC,
 * shifting each generated key one day earlier so none matched the data
 * the server had sent. These tests run the walk under several `TZ`
 * settings, which is the only way to catch that class of bug.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { eachDayInclusive, nextDay } from "@/lib/date-range";

/** Runs `fn` with `process.env.TZ` set, restoring it afterwards. Node
 * caches the zone lazily, so setting it before the first `Date` call in
 * the body is enough for these pure-arithmetic helpers. */
function withTimezone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

const ZONES = [
  "UTC",
  "Asia/Kolkata", // UTC+5:30 — the product's own market, and the bug's home
  "Pacific/Kiritimati", // UTC+14, the furthest ahead
  "America/Los_Angeles", // behind UTC
  "Pacific/Chatham", // UTC+12:45, a non-hour offset
];

test("nextDay is the same in every timezone", () => {
  for (const tz of ZONES) {
    withTimezone(tz, () => {
      assert.equal(nextDay("2026-08-28"), "2026-08-29", tz);
      assert.equal(nextDay("2026-08-31"), "2026-09-01", `${tz}: month boundary`);
      assert.equal(nextDay("2026-12-31"), "2027-01-01", `${tz}: year boundary`);
      assert.equal(nextDay("2028-02-28"), "2028-02-29", `${tz}: leap year`);
      assert.equal(nextDay("2027-02-28"), "2027-03-01", `${tz}: non-leap year`);
    });
  }
});

test("the walk covers the requested window inclusively, in every timezone", () => {
  for (const tz of ZONES) {
    withTimezone(tz, () => {
      const days = [...eachDayInclusive("2026-08-28", "2026-09-10")];
      assert.equal(days.length, 14, `${tz}: 14 days inclusive`);
      assert.equal(days[0], "2026-08-28", `${tz}: starts on the from date`);
      assert.equal(
        days.at(-1),
        "2026-09-10",
        `${tz}: must include today — the day the chart was dropping`,
      );
    });
  }
});

test("a single-day window yields exactly that day", () => {
  const days = [...eachDayInclusive("2026-09-10", "2026-09-10")];
  assert.deepEqual(days, ["2026-09-10"]);
});

test("an inverted window yields nothing rather than spinning", () => {
  assert.deepEqual([...eachDayInclusive("2026-09-10", "2026-09-01")], []);
});

test("a DST transition does not drop or duplicate a day", () => {
  // US DST forward transition, 2026-03-08.
  withTimezone("America/New_York", () => {
    const days = [...eachDayInclusive("2026-03-06", "2026-03-10")];
    assert.deepEqual(days, [
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });
});

test("the walk spans a month boundary correctly", () => {
  const days = [...eachDayInclusive("2026-01-30", "2026-02-02")];
  assert.deepEqual(days, ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
});
