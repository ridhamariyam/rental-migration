/**
 * Continuation of `seed-rentbee-demo.ts` — that run crashed partway
 * through attendance (a pre-existing staff member already had a row for
 * one of the randomly chosen days, violating `uq_attendance_staff_date`)
 * after outlets/staff/categories/products/customers/bookings/payments/
 * settlements/maintenance had already committed successfully. This script
 * only finishes the remaining attendance/leave/salary/payslip data,
 * skipping any (staff, date) attendance pair that already exists instead
 * of assuming a clean slate.
 *
 * Usage: pnpm exec tsx scripts/seed-rentbee-demo-part2.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, gte } from "drizzle-orm";
import { attendances, salaries, salaryPayslips, staffLeaves, users } from "../src/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — check .env.local");
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const SHOP_ID = "c5a33db7-0edd-470d-aedd-26dfcca3db82";
const OUTLET_KANNUR_ID = "b03d2f13-c1c8-439e-b02d-cbfa2881206b";
const MANAGER_KANNUR_ID = "9ee9b20a-69e3-4c57-9874-f2cf59442356";
const STAFF_KANNUR_ID_ALREADY_SALARIED = "5f9f01e5-6bab-41f3-945b-ae76acf83269";

function offsetDateIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function offsetTimestamp(days: number, hour = 11): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function money(n: number): string {
  return n.toFixed(2);
}

async function main() {
  async function findStaffByEmail(email: string) {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.shopId, SHOP_ID), eq(users.email, email)))
      .limit(1);
    return row ?? null;
  }

  const fathimaRow = await findStaffByEmail("fathima.rasheed@rentbee.example");
  const arjunRow = await findStaffByEmail("arjun.menon@rentbee.example");
  const snehaRow = await findStaffByEmail("sneha.pillai@rentbee.example");
  const vishnuRow = await findStaffByEmail("vishnu.nair@rentbee.example");
  const anaghaRow = await findStaffByEmail("anagha.krishnan@rentbee.example");

  if (!fathimaRow || !arjunRow || !snehaRow || !vishnuRow || !anaghaRow) {
    throw new Error("Expected staff rows from part 1 are missing — did part 1 actually run?");
  }

  const payableStaff = [
    { id: MANAGER_KANNUR_ID, outletId: OUTLET_KANNUR_ID },
    { id: STAFF_KANNUR_ID_ALREADY_SALARIED, outletId: OUTLET_KANNUR_ID },
    { id: fathimaRow.id, outletId: fathimaRow.outletId! },
    { id: arjunRow.id, outletId: arjunRow.outletId! },
    { id: snehaRow.id, outletId: snehaRow.outletId! },
    { id: vishnuRow.id, outletId: vishnuRow.outletId! },
    { id: anaghaRow.id, outletId: anaghaRow.outletId! },
  ];

  // ------------------------------------------------------------------
  // Attendance (skip any (staff, date) pair that already exists)
  // ------------------------------------------------------------------
  let attendanceCount = 0;
  for (const staffMember of payableStaff) {
    const existing = await db
      .select({ date: attendances.date })
      .from(attendances)
      .where(
        and(
          eq(attendances.staffId, staffMember.id),
          gte(attendances.date, offsetDateIso(-31)),
        ),
      );
    const existingDates = new Set(existing.map((row) => row.date));

    for (let dayOffset = -30; dayOffset <= -1; dayOffset += 1) {
      const date = offsetTimestamp(dayOffset, 0);
      if (date.getUTCDay() === 0) continue; // Sunday off
      const dateIso = offsetDateIso(dayOffset);
      if (existingDates.has(dateIso)) continue;

      const roll = Math.random();
      const status = roll < 0.85 ? "present" : roll < 0.95 ? "absent" : "corrected";
      if (status === "absent") continue; // no check-in row for an absent day

      await db.insert(attendances).values({
        shopId: SHOP_ID,
        outletId: staffMember.outletId,
        staffId: staffMember.id,
        date: dateIso,
        status,
        checkInTime: offsetTimestamp(dayOffset, 9),
        checkInLatitude: 11.8745,
        checkInLongitude: 75.3704,
        checkInDistanceMetres: randomInt(5, 120),
        checkOutTime: offsetTimestamp(dayOffset, 19),
        checkOutLatitude: 11.8745,
        checkOutLongitude: 75.3704,
        checkOutDistanceMetres: randomInt(5, 120),
      });
      attendanceCount += 1;
    }
  }
  console.log(`Attendance: +${attendanceCount}`);

  // ------------------------------------------------------------------
  // Leave
  // ------------------------------------------------------------------
  const leaveReasons = [
    "Family function",
    "Medical appointment",
    "Personal work",
    "Festival travel",
    "Not feeling well",
  ];
  let leaveCount = 0;
  for (const staffMember of payableStaff) {
    const leavesForStaff = randomInt(1, 2);
    for (let i = 0; i < leavesForStaff; i += 1) {
      const fromOffset = randomInt(-40, -3);
      const span = randomInt(0, 2);
      const decided = Math.random() < 0.8;
      const approved = decided && Math.random() < 0.75;
      await db.insert(staffLeaves).values({
        shopId: SHOP_ID,
        staffId: staffMember.id,
        fromDate: offsetDateIso(fromOffset),
        toDate: offsetDateIso(fromOffset + span),
        reason: pick(leaveReasons),
        status: decided ? (approved ? "approved" : "rejected") : "pending",
        decidedById: decided ? MANAGER_KANNUR_ID : null,
        decidedAt: decided ? offsetTimestamp(fromOffset - 1, 14) : null,
      });
      leaveCount += 1;
    }
  }
  console.log(`Leave requests: +${leaveCount}`);

  // ------------------------------------------------------------------
  // Salary + payslips
  // ------------------------------------------------------------------
  let salaryCount = 0;
  let payslipCount = 0;
  const now = new Date();
  for (const staffMember of payableStaff) {
    let baseSalary: number;
    if (staffMember.id === STAFF_KANNUR_ID_ALREADY_SALARIED) {
      baseSalary = 22000; // matches the salary row seeded before this session
    } else {
      baseSalary = pick([18000, 20000, 22000, 25000, 28000]);
      await db.insert(salaries).values({
        shopId: SHOP_ID,
        staffId: staffMember.id,
        amount: money(baseSalary),
        weeklyOffDay: 0,
        standardHoursPerDay: "8.00",
        effectiveDate: offsetDateIso(-90),
        note: "Standard monthly salary",
      });
      salaryCount += 1;
    }

    for (const monthsAgo of [2, 1]) {
      const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
      const periodYear = period.getUTCFullYear();
      const periodMonth = period.getUTCMonth() + 1;
      const workingDays = 26;
      const standardHoursPerDay = "8.00";
      const presentDays = randomInt(18, 24);
      const approvedLeaveDays = randomInt(0, 2);
      const absentDays = Math.max(0, workingDays - presentDays - approvedLeaveDays);
      const payableDays = Math.min(workingDays, presentDays + approvedLeaveDays);
      const hourlyRate = money(baseSalary / (workingDays * 8));
      const basePay = money(Number(hourlyRate) * payableDays * 8);
      const netAmount = basePay;

      await db
        .insert(salaryPayslips)
        .values({
          shopId: SHOP_ID,
          staffId: staffMember.id,
          periodYear,
          periodMonth,
          baseSalary: money(baseSalary),
          weeklyOffDay: 0,
          standardHoursPerDay,
          workingDays,
          presentDays,
          absentDays,
          approvedLeaveDays,
          hourlyRate,
          basePay,
          netAmount,
          generatedById: MANAGER_KANNUR_ID,
          generatedAt: offsetTimestamp(-monthsAgo * 30 + 3, 10),
        })
        .onConflictDoNothing();
      payslipCount += 1;
    }
  }
  console.log(`Salaries: +${salaryCount}, Payslips attempted: ${payslipCount}`);

  console.log("Done seeding remaining Rentbee demo data.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
