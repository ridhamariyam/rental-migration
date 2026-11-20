import assert from "node:assert/strict";
import test from "node:test";

import { renewalBlockedReason } from "./plans";

const now = new Date("2026-11-20T10:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

test("no plan can be bought while more than 7 days are paid for", () => {
  for (const plan of ["yearly", "monthly", "custom"] as const) {
    for (const planId of ["yearly", "monthly"] as const) {
      const reason = renewalBlockedReason(planId, { plan, endsAt: days(30) }, now);
      assert.match(reason ?? "", /already paid until 20 December 2026\. You can renew from 13 December 2026/);
    }
  }
});

test("in the last 7 days a Yearly plan can renew Yearly but not Monthly", () => {
  const current = { plan: "yearly" as const, endsAt: days(5) };
  assert.equal(renewalBlockedReason("yearly", current, now), null);
  assert.match(renewalBlockedReason("monthly", current, now) ?? "", /Monthly renewal opens after/);
});

test("in the last 7 days a Monthly or custom plan can renew either plan", () => {
  for (const plan of ["monthly", "custom"] as const) {
    assert.equal(renewalBlockedReason("monthly", { plan, endsAt: days(3) }, now), null);
    assert.equal(renewalBlockedReason("yearly", { plan, endsAt: days(3) }, now), null);
  }
});

test("exactly 7 days left opens renewal", () => {
  assert.equal(renewalBlockedReason("monthly", { plan: "monthly", endsAt: days(7) }, now), null);
});

test("once the plan has ended (grace or locked) anything can be bought", () => {
  for (const plan of ["yearly", "monthly", "custom", null] as const) {
    assert.equal(renewalBlockedReason("monthly", { plan, endsAt: days(-1) }, now), null);
    assert.equal(renewalBlockedReason("yearly", { plan, endsAt: days(-20) }, now), null);
  }
  assert.equal(renewalBlockedReason("monthly", { plan: null, endsAt: null }, now), null);
});
