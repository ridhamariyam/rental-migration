/**
 * The payroll model itself: pay is the hours someone actually worked,
 * priced at the rate configured for them.
 *
 *     basePay     = regular hours × hourlyRate
 *     overtimePay = extra hours   × overtimeRatePerHour
 *
 * The rate is never derived from the monthly figure — these tests pin that
 * down by configuring a monthly amount whose "salary ÷ hours" value is
 * nowhere near the configured hourly rate, so any reappearance of the old
 * model shows up as a wrong number rather than a passing test.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { db, resetDatabase, seedShop, seedStaff } from "@/test/db";
import { attendances, salaries, staffLeaves, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  calculateSalary,
  calculateSalaryForRange,
  generatePayslipForRange,
} from "@/server/salary/service";

/** A month that has certainly closed, so nothing is clamped to today. */
function closedMonth(): { year: number; month: number; days: number } {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return { year, month, days: new Date(year, month, 0).getDate() };
}

function iso(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

async function setup(
  config: Partial<typeof salaries.$inferInsert> = {},
) {
  const fixture = await seedShop();
  const staff = await seedStaff(fixture, {
    role: "staff",
    outletId: fixture.outletId,
  });

  await db.insert(salaries).values({
    shopId: fixture.shopId,
    staffId: staff.id,
    // Deliberately absurd next to the hourly rate: 60000 ÷ (8 × 26) is
    // ~288/hr, so anything deriving pay from the monthly figure cannot
    // accidentally match the 100/hr configured below.
    amount: "60000.00",
    hourlyRate: "100.00",
    overtimeRatePerHour: "150.00",
    standardHoursPerDay: "8.00",
    // No weekly off: every day in the period is a working day, which
    // keeps the day arithmetic in these tests explicit.
    weeklyOffDay: null,
    effectiveDate: "2020-01-01",
    ...config,
  });

  return { fixture, staff };
}

/** Attendance for one day: checked in at 09:00, out `hours` later. */
async function workDay(
  shopId: string,
  staffId: string,
  outletId: string,
  date: string,
  hours: number,
) {
  const checkIn = new Date(`${date}T09:00:00Z`);
  const checkOut = new Date(checkIn.getTime() + hours * 3_600_000);
  await db.insert(attendances).values({
    shopId,
    staffId,
    outletId,
    date,
    status: "present",
    checkInTime: checkIn,
    checkOutTime: checkOut,
    // Geo-stamped at the counter in the real flow; payroll only reads the
    // two timestamps, so any in-range pair does here.
    checkInLatitude: 0,
    checkInLongitude: 0,
  });
}

test("base pay is hours worked × the configured hourly rate", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();

  // Three ordinary days: 8 + 8 + 4 = 20 regular hours, no extra.
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 1), 8);
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 2), 8);
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 3), 4);

  const result = await calculateSalary(
    fixture.admin,
    staff.id,
    period.year,
    period.month,
  );

  assert.equal(result.hourlyRate, "100.00", "the configured rate is used as entered");
  assert.equal(result.regularMinutes, 20 * 60);
  assert.equal(result.overtimeMinutes, 0);
  assert.equal(result.basePay, "2000.00", "20h × 100");
  assert.equal(result.overtimePay, "0.00");
  assert.equal(result.netAmount, "2000.00");
});

test("only hours past the standard day are extra worktime, and they price at the overtime rate", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();

  // 12h then 4h: 8 + 4 regular, 4 extra — never 16 flat.
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 1), 12);
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 2), 4);

  const result = await calculateSalary(
    fixture.admin,
    staff.id,
    period.year,
    period.month,
  );

  assert.equal(result.regularMinutes, 12 * 60, "8 worked + 4 worked");
  assert.equal(result.overtimeMinutes, 4 * 60);
  assert.equal(result.basePay, "1200.00", "12h × 100");
  assert.equal(result.overtimePay, "600.00", "4h × 150");
  assert.equal(result.netAmount, "1800.00");
});

test("extra hours are recorded but unpaid when no overtime rate is configured", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup({ overtimeRatePerHour: null });
  const period = closedMonth();

  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 1), 11);

  const result = await calculateSalary(
    fixture.admin,
    staff.id,
    period.year,
    period.month,
  );

  assert.equal(result.overtimeMinutes, 3 * 60);
  assert.equal(result.overtimePay, "0.00");
  assert.equal(result.netAmount, "800.00", "8h × 100, the extra 3h unpaid");
});

test("an approved leave day is paid as one standard day", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();
  const leaveDate = iso(period.year, period.month, 5);

  await db.insert(staffLeaves).values({
    shopId: fixture.shopId,
    staffId: staff.id,
    fromDate: leaveDate,
    toDate: leaveDate,
    reason: "Wedding",
    status: "approved",
  });

  const result = await calculateSalary(
    fixture.admin,
    staff.id,
    period.year,
    period.month,
  );

  assert.equal(result.approvedLeaveDays, 1);
  assert.equal(result.regularMinutes, 8 * 60, "one standard day of regular time");
  assert.equal(result.basePay, "800.00");
});

test("nothing is paid, and nothing counted absent, before the joining date", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();
  const joinDay = 20;

  await db
    .update(users)
    .set({ joinedOn: iso(period.year, period.month, joinDay) })
    .where(eq(users.id, staff.id));

  // One day worked before joining (payroll must ignore it) and one after.
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 2), 8);
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, joinDay), 8);

  const result = await calculateSalary(
    fixture.admin,
    staff.id,
    period.year,
    period.month,
  );

  assert.equal(result.payStart, iso(period.year, period.month, joinDay));
  assert.equal(
    result.workingDays,
    period.days - joinDay + 1,
    "only days from the joining date onward are working days",
  );
  assert.equal(result.presentDays, 1, "the pre-joining attendance row is not payroll's");
  assert.equal(result.regularMinutes, 8 * 60);
  assert.equal(result.basePay, "800.00");
});

test("a month is priced against the rate in force then, not today's", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();

  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 1), 8);

  // A raise dated after the period must not reach back into it.
  await db.insert(salaries).values({
    shopId: fixture.shopId,
    staffId: staff.id,
    hourlyRate: "500.00",
    standardHoursPerDay: "8.00",
    weeklyOffDay: null,
    effectiveDate: new Date().toISOString().slice(0, 10),
  });

  const result = await calculateSalary(
    fixture.admin,
    staff.id,
    period.year,
    period.month,
  );

  assert.equal(result.hourlyRate, "100.00");
  assert.equal(result.basePay, "800.00");
});

test("a staff member with no hourly rate configured is refused, not paid zero", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup({ hourlyRate: "0.00" });
  const period = closedMonth();

  await assert.rejects(
    () => calculateSalary(fixture.admin, staff.id, period.year, period.month),
    /no hourly rate is configured/i,
  );
});

test("a payroll period can be any range of dates, not just a month", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();

  // Three worked days spread across the month; only the middle two fall
  // inside the fortnight being paid.
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 2), 8);
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 9), 8);
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 12), 6);

  const fortnight = await calculateSalaryForRange(fixture.admin, staff.id, {
    fromDate: iso(period.year, period.month, 8),
    toDate: iso(period.year, period.month, 14),
  });

  assert.equal(fortnight.periodStart, iso(period.year, period.month, 8));
  assert.equal(fortnight.periodEnd, iso(period.year, period.month, 14));
  assert.equal(
    fortnight.periodYear,
    null,
    "a part-month range has no month to be labelled by",
  );
  assert.equal(fortnight.regularMinutes, 14 * 60, "only the 8h and 6h days");
  assert.equal(fortnight.basePay, "1400.00", "14h × 100");

  // The same month as a whole still totals all three days.
  const whole = await calculateSalary(
    fixture.admin,
    staff.id,
    period.year,
    period.month,
  );
  assert.equal(whole.regularMinutes, 22 * 60);
  assert.equal(whole.periodMonth, period.month, "a whole month keeps its label");
});

test("a payslip is stored against its exact range and regenerating overwrites it", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();
  const range = {
    fromDate: iso(period.year, period.month, 1),
    toDate: iso(period.year, period.month, 10),
  };

  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 3), 8);

  const first = await generatePayslipForRange(fixture.admin, staff.id, range);
  assert.equal(first.periodStart, range.fromDate);
  assert.equal(first.periodEnd, range.toDate);
  assert.equal(first.netAmount, "800.00");

  // A correction to the attendance, then the same period run again.
  await workDay(fixture.shopId, staff.id, fixture.outletId, iso(period.year, period.month, 4), 8);
  const second = await generatePayslipForRange(fixture.admin, staff.id, range);

  assert.equal(second.id, first.id, "the same period updates its own payslip");
  assert.equal(second.netAmount, "1600.00");
});

test("a period that has not finished cannot be turned into a payslip", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const today = new Date().toISOString().slice(0, 10);

  await assert.rejects(
    () =>
      generatePayslipForRange(fixture.admin, staff.id, {
        fromDate: today,
        toDate: today,
      }),
    /has not finished yet/i,
  );
});

test("an end date before the start date is refused", async () => {
  await resetDatabase();
  const { fixture, staff } = await setup();
  const period = closedMonth();

  await assert.rejects(
    () =>
      calculateSalaryForRange(fixture.admin, staff.id, {
        fromDate: iso(period.year, period.month, 10),
        toDate: iso(period.year, period.month, 2),
      }),
    /end date cannot be before the start date/i,
  );
});
