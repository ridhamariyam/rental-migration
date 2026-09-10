/**
 * RQ-09 regression: a payslip is a record of a finished month.
 *
 * `calculateSalary` walks every day of the period and scores any day with
 * no attendance row as an absence. Nothing clamped the walk to today, so
 * previewing the current month on the 10th counted days 11-30 as absent
 * and produced a wildly understated figure — which `generatePayslip` then
 * persisted.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { db, resetDatabase, seedShop, seedStaff } from "@/test/db";
import { salaries } from "@/lib/db/schema";
import { calculateSalary, generatePayslip } from "@/server/salary/service";

function monthOffset(months: number): { year: number; month: number } {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + months, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

async function staffWithSalary() {
  const fixture = await seedShop();
  const staff = await seedStaff(fixture, {
    role: "staff",
    outletId: fixture.outletId,
  });

  await db.insert(salaries).values({
    shopId: fixture.shopId,
    staffId: staff.id,
    amount: "30000.00",
    effectiveDate: "2020-01-01",
    standardHoursPerDay: "8.00",
    weeklyOffDay: 0,
  });

  return { fixture, staff };
}

test("a payslip cannot be generated for the current, unfinished month", async () => {
  await resetDatabase();
  const { fixture, staff } = await staffWithSalary();
  const current = monthOffset(0);

  await assert.rejects(
    () => generatePayslip(fixture.admin, staff.id, current.year, current.month),
    /has not finished yet/i,
    "persisting a partial month would pay it out as if complete",
  );
});

test("a payslip cannot be generated for a future month", async () => {
  await resetDatabase();
  const { fixture, staff } = await staffWithSalary();
  const future = monthOffset(2);

  await assert.rejects(
    () => generatePayslip(fixture.admin, staff.id, future.year, future.month),
    /has not finished yet/i,
  );
});

test("a payslip can be generated for a month that has closed", async () => {
  await resetDatabase();
  const { fixture, staff } = await staffWithSalary();
  const past = monthOffset(-1);

  const payslip = await generatePayslip(fixture.admin, staff.id, past.year, past.month);
  assert.equal(payslip.periodYear, past.year);
  assert.equal(payslip.periodMonth, past.month);
});

test("previewing the current month stops at today instead of scoring the rest absent", async () => {
  await resetDatabase();
  const { fixture, staff } = await staffWithSalary();
  const now = new Date();
  const current = monthOffset(0);

  const preview = await calculateSalary(
    fixture.admin,
    staff.id,
    current.year,
    current.month,
  );

  const daysElapsed = now.getDate();
  assert.ok(
    preview.workingDays <= daysElapsed,
    `walked ${preview.workingDays} working days but only ${daysElapsed} have happened`,
  );
  assert.ok(
    preview.absentDays <= daysElapsed,
    "days that have not happened cannot be absences",
  );
});

test("a preview for a month that has not started at all is refused", async () => {
  await resetDatabase();
  const { fixture, staff } = await staffWithSalary();
  const future = monthOffset(3);

  await assert.rejects(
    () => calculateSalary(fixture.admin, staff.id, future.year, future.month),
    /has not started yet/i,
  );
});

test("a closed month still walks its full length", async () => {
  await resetDatabase();
  const { fixture, staff } = await staffWithSalary();
  const past = monthOffset(-1);
  const daysInPastMonth = new Date(past.year, past.month, 0).getDate();

  const calculation = await calculateSalary(
    fixture.admin,
    staff.id,
    past.year,
    past.month,
  );

  // Every day except the weekly off day.
  assert.ok(
    calculation.workingDays > daysInPastMonth - 6,
    `a finished month should not be clamped: got ${calculation.workingDays} of ${daysInPastMonth}`,
  );
});
