/**
 * RQ-01 / RQ-11 regression: the payment ledger must reconcile.
 *
 * The invariant every case below asserts is the same one the audit found
 * broken — what the customer ends up handing over must equal what they
 * actually owe:
 *
 *   collectedFromCustomer − returnedToCustomer + outstanding
 *     === rentPayable
 *
 * where the deposit is a pass-through: money in, then either back out to
 * the customer (`deposit_release`) or kept against damage
 * (`deposit_applied`, which settles part of `rentPayable`).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  computePaymentSummary,
  type PaymentSummary,
} from "@/server/payments/service";
import { addMoney, subtractMoney } from "@/lib/money";
import type { Payment } from "@/lib/db/schema";

type Row = { paymentType: Payment["paymentType"]; amount: string };

/** Everything the customer physically handed over. */
function cashIn(rows: Row[]): string {
  return rows
    .filter((r) =>
      (["advance", "balance", "security_deposit"] as const).includes(
        r.paymentType as "advance",
      ),
    )
    .reduce((sum, r) => addMoney(sum, r.amount), "0.00");
}

/** Everything handed back to them. */
function cashOut(rows: Row[]): string {
  return rows
    .filter((r) =>
      (["refund", "deposit_release"] as const).includes(r.paymentType as "refund"),
    )
    .reduce((sum, r) => addMoney(sum, r.amount), "0.00");
}

function assertReconciles(summary: PaymentSummary, rows: Row[], label: string) {
  const netPaid = subtractMoney(cashIn(rows), cashOut(rows));
  const willPayInTotal = addMoney(netPaid, summary.outstanding);
  const owedInTotal = addMoney(summary.rentPayable, summary.depositHeld);

  assert.equal(
    willPayInTotal,
    owedInTotal,
    `${label}: customer nets ${willPayInTotal} against a bill of ${owedInTotal} ` +
      `(rentPayable ${summary.rentPayable}, depositHeld ${summary.depositHeld}, ` +
      `outstanding ${summary.outstanding}, credit ${summary.creditBalance})`,
  );
}

function assertNeverBothSided(summary: PaymentSummary, label: string) {
  const bothPositive =
    Number(summary.outstanding) > 0 && Number(summary.creditBalance) > 0;
  assert.equal(
    bothPositive,
    false,
    `${label}: outstanding ${summary.outstanding} and credit ${summary.creditBalance} cannot both be positive`,
  );
}

const booking = { totalAmount: "3000.00", securityDeposit: "2000.00" };
const paidInFull: Row[] = [
  { paymentType: "advance", amount: "3000.00" },
  { paymentType: "security_deposit", amount: "2000.00" },
];

test("no damage: deposit is returned in full and nothing is owed", () => {
  const rows: Row[] = [
    ...paidInFull,
    { paymentType: "deposit_release", amount: "2000.00" },
  ];
  const summary = computePaymentSummary(booking, "0.00", rows);

  assert.equal(summary.rentPayable, "3000.00");
  assert.equal(summary.depositReturned, "2000.00");
  assert.equal(summary.depositAppliedToDamage, "0.00");
  assert.equal(summary.depositHeld, "0.00");
  assert.equal(summary.outstanding, "0.00");
  assert.equal(summary.status, "paid");
  assertReconciles(summary, rows, "no damage");
});

test("damage < deposit: the balance of the deposit goes back, nothing is owed", () => {
  // Damage 800 of a 2000 deposit: 800 kept, 1200 returned.
  const rows: Row[] = [
    ...paidInFull,
    { paymentType: "deposit_applied", amount: "800.00" },
    { paymentType: "deposit_release", amount: "1200.00" },
  ];
  const summary = computePaymentSummary(booking, "800.00", rows);

  assert.equal(summary.rentPayable, "3800.00");
  assert.equal(summary.depositAppliedToDamage, "800.00");
  assert.equal(summary.depositReturned, "1200.00");
  assert.equal(summary.rentCollected, "3800.00", "3000 cash + 800 from deposit");
  assert.equal(summary.outstanding, "0.00", "the deposit covered the damage");
  assert.equal(summary.creditBalance, "0.00");
  assertReconciles(summary, rows, "damage < deposit");
  assertNeverBothSided(summary, "damage < deposit");
});

test("damage == deposit: the whole deposit is consumed and nothing is owed", () => {
  const rows: Row[] = [
    ...paidInFull,
    { paymentType: "deposit_applied", amount: "2000.00" },
  ];
  const summary = computePaymentSummary(booking, "2000.00", rows);

  assert.equal(summary.rentPayable, "5000.00");
  assert.equal(summary.depositHeld, "0.00");
  assert.equal(summary.rentCollected, "5000.00");
  assert.equal(summary.outstanding, "0.00");
  assertReconciles(summary, rows, "damage == deposit");
});

test("damage > deposit: only the shortfall is still owed — the audit's case", () => {
  // Rent 3000, deposit 2000, damage 5000. The deposit covers 2000 of the
  // damage; 3000 remains. Before the fix this reported 5000 outstanding,
  // so the customer paid 10,000 against an 8,000 bill.
  const rows: Row[] = [
    ...paidInFull,
    { paymentType: "deposit_applied", amount: "2000.00" },
  ];
  const summary = computePaymentSummary(booking, "5000.00", rows);

  assert.equal(summary.rentPayable, "8000.00");
  assert.equal(summary.depositAppliedToDamage, "2000.00");
  assert.equal(summary.depositReturned, "0.00");
  assert.equal(summary.depositHeld, "0.00");
  assert.equal(summary.rentCollected, "5000.00", "3000 cash + 2000 from deposit");
  assert.equal(
    summary.outstanding,
    "3000.00",
    "the remaining damage only — not the whole 5000",
  );
  assert.equal(summary.status, "partial");
  assertReconciles(summary, rows, "damage > deposit");

  // The headline number from the audit: total the customer parts with.
  const totalPaid = addMoney(cashIn(rows), summary.outstanding);
  assert.equal(totalPaid, "8000.00", "rent 3000 + damage 5000, no double charge");
});

test("partial deposit usage with the shortfall then paid off closes the booking", () => {
  const rows: Row[] = [
    ...paidInFull,
    { paymentType: "deposit_applied", amount: "2000.00" },
    { paymentType: "balance", amount: "3000.00" },
  ];
  const summary = computePaymentSummary(booking, "5000.00", rows);

  assert.equal(summary.outstanding, "0.00");
  assert.equal(summary.status, "paid");
  assertReconciles(summary, rows, "shortfall settled");
});

test("damage assessed but no deposit was ever taken: the whole charge is owed", () => {
  const noDeposit = { totalAmount: "3000.00", securityDeposit: "0.00" };
  const rows: Row[] = [{ paymentType: "advance", amount: "3000.00" }];
  const summary = computePaymentSummary(noDeposit, "1500.00", rows);

  assert.equal(summary.rentPayable, "4500.00");
  assert.equal(summary.depositAppliedToDamage, "0.00");
  assert.equal(summary.outstanding, "1500.00");
  assertReconciles(summary, rows, "no deposit held");
});

test("RQ-11: an advance covering rent and deposit is not reported as owing and crediting at once", () => {
  // The counter enters one 5000 payment against a 3000 + 2000 booking.
  const rows: Row[] = [{ paymentType: "advance", amount: "5000.00" }];
  const summary = computePaymentSummary(booking, "0.00", rows);

  assertNeverBothSided(summary, "advance covering both sides");
  assert.equal(summary.outstanding, "0.00");
  assert.equal(summary.creditBalance, "0.00");
  assert.equal(summary.status, "paid");
});

test("a genuine over-payment still surfaces as a credit, not as zero", () => {
  const rows: Row[] = [{ paymentType: "advance", amount: "6000.00" }];
  const summary = computePaymentSummary(booking, "0.00", rows);

  assert.equal(summary.outstanding, "0.00");
  assert.equal(summary.creditBalance, "1000.00", "1000 over rent + deposit");
  assertNeverBothSided(summary, "genuine over-payment");
});

test("a genuine shortfall still surfaces as outstanding", () => {
  const rows: Row[] = [{ paymentType: "advance", amount: "1000.00" }];
  const summary = computePaymentSummary(booking, "0.00", rows);

  assert.equal(summary.outstanding, "4000.00");
  assert.equal(summary.creditBalance, "0.00");
  assert.equal(summary.status, "partial");
  assertNeverBothSided(summary, "shortfall");
});

test("deposit released back is not treated as settling the damage bill", () => {
  // A release must NOT behave like an application: the shop handed the
  // money back, so the damage is still owed in full.
  const rows: Row[] = [
    ...paidInFull,
    { paymentType: "deposit_release", amount: "2000.00" },
  ];
  const summary = computePaymentSummary(booking, "1000.00", rows);

  assert.equal(summary.rentPayable, "4000.00");
  assert.equal(summary.rentCollected, "3000.00", "the release credits nothing");
  assert.equal(summary.outstanding, "1000.00");
  assertReconciles(summary, rows, "release is not an application");
});
