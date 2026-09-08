import "server-only";

import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  attendances,
  salaries,
  salaryPayslips,
  staffLeaves,
  users,
  type Salary,
  type SalaryPayslip,
} from "@/lib/db/schema";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import { addMoney, nonNegativeMoney, proRateMoney, ZERO_MONEY } from "@/lib/money";
import type {
  CreateSalaryInput,
  UpdateSalaryInput,
  PayslipListQuery,
} from "@/lib/validation/salary";

async function requireTenantStaff(shopId: string, staffId: string) {
  const [staff] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(
      and(
        eq(users.id, staffId),
        eq(users.shopId, shopId),
        inArray(users.role, ["manager", "staff"]),
      ),
    )
    .limit(1);

  if (!staff) {
    throw AppError.notFound("Staff member not found");
  }

  return staff;
}

/** Every login-bearing tenant role may see their own salary/payslips; only
 * `SALARY_MANAGE` (the tenant owner) may look at someone else's. */
function assertCanView(actor: TenantSessionUser, staffId: string) {
  if (staffId === actor.id) {
    return;
  }
  if (!hasPermission(actor.role, Permission.SALARY_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }
}

async function loadSalaryForTenant(
  shopId: string,
  salaryId: string,
): Promise<Salary> {
  const [row] = await db
    .select()
    .from(salaries)
    .where(and(eq(salaries.id, salaryId), eq(salaries.shopId, shopId)))
    .limit(1);

  if (!row) {
    throw AppError.notFound("Salary configuration not found");
  }

  return row;
}

/**
 * Configures pay for a staff member (doc §18) — owner-only. A new row is
 * added rather than overwriting an existing configuration, so a past
 * month's already-generated payslip is never repriced by today's raise
 * (see the table-level doc comment on `schema/salary.ts`).
 */
export async function createSalary(
  actor: TenantSessionUser,
  input: CreateSalaryInput,
): Promise<Salary> {
  if (!hasPermission(actor.role, Permission.SALARY_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  await requireTenantStaff(actor.shopId, input.staffId);

  const [salary] = await db
    .insert(salaries)
    .values({
      shopId: actor.shopId,
      staffId: input.staffId,
      amount: input.amount,
      weeklyOffDay: input.weeklyOffDay,
      standardHoursPerDay: String(input.standardHoursPerDay),
      overtimeRatePerHour: input.overtimeRatePerHour || null,
      effectiveDate: input.effectiveDate,
      note: input.note || null,
    })
    .returning();

  await recordAudit(db, {
    shopId: actor.shopId,
    userId: actor.id,
    action: AuditAction.SALARY_CONFIGURED,
    entityType: "salary",
    entityId: salary.id,
    summary: `Salary of ${salary.amount} configured, effective ${salary.effectiveDate}`,
    after: {
      amount: salary.amount,
      weeklyOffDay: salary.weeklyOffDay,
      standardHoursPerDay: salary.standardHoursPerDay,
      overtimeRatePerHour: salary.overtimeRatePerHour,
      effectiveDate: salary.effectiveDate,
    },
  });

  return salary;
}

export async function updateSalary(
  actor: TenantSessionUser,
  salaryId: string,
  input: UpdateSalaryInput,
): Promise<Salary> {
  if (!hasPermission(actor.role, Permission.SALARY_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const existing = await loadSalaryForTenant(actor.shopId, salaryId);

  const [salary] = await db
    .update(salaries)
    .set({
      amount: input.amount,
      weeklyOffDay: input.weeklyOffDay,
      standardHoursPerDay: String(input.standardHoursPerDay),
      overtimeRatePerHour: input.overtimeRatePerHour || null,
      effectiveDate: input.effectiveDate,
      note: input.note || null,
      updatedAt: new Date(),
    })
    .where(eq(salaries.id, salaryId))
    .returning();

  await recordAudit(db, {
    shopId: actor.shopId,
    userId: actor.id,
    action: AuditAction.SALARY_UPDATED,
    entityType: "salary",
    entityId: salary.id,
    summary: `Salary configuration updated to ${salary.amount}`,
    before: {
      amount: existing.amount,
      weeklyOffDay: existing.weeklyOffDay,
      standardHoursPerDay: existing.standardHoursPerDay,
      overtimeRatePerHour: existing.overtimeRatePerHour,
    },
    after: {
      amount: salary.amount,
      weeklyOffDay: salary.weeklyOffDay,
      standardHoursPerDay: salary.standardHoursPerDay,
      overtimeRatePerHour: salary.overtimeRatePerHour,
    },
  });

  return salary;
}

export async function deleteSalary(
  actor: TenantSessionUser,
  salaryId: string,
): Promise<void> {
  if (!hasPermission(actor.role, Permission.SALARY_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const existing = await loadSalaryForTenant(actor.shopId, salaryId);
  await db.delete(salaries).where(eq(salaries.id, salaryId));

  await recordAudit(db, {
    shopId: actor.shopId,
    userId: actor.id,
    action: AuditAction.SALARY_DELETED,
    entityType: "salary",
    entityId: salaryId,
    summary: `Salary configuration of ${existing.amount} deleted`,
    before: { amount: existing.amount, standardHoursPerDay: existing.standardHoursPerDay },
  });
}

/** Every configuration ever entered for one staff member, most recent
 * first — self-viewable, same as the legacy backend. */
export async function listStaffSalaries(
  actor: TenantSessionUser,
  staffId: string,
): Promise<Salary[]> {
  assertCanView(actor, staffId);
  await requireTenantStaff(actor.shopId, staffId);

  return db
    .select()
    .from(salaries)
    .where(and(eq(salaries.staffId, staffId), eq(salaries.shopId, actor.shopId)))
    .orderBy(desc(salaries.effectiveDate));
}

/** The configuration in force on `onDate` — the latest row at or before
 * it, mirroring the legacy `SalaryRepository.get_effective`. */
async function getEffectiveSalary(
  shopId: string,
  staffId: string,
  onDate: string,
): Promise<Salary | null> {
  const [row] = await db
    .select()
    .from(salaries)
    .where(
      and(
        eq(salaries.staffId, staffId),
        eq(salaries.shopId, shopId),
        lte(salaries.effectiveDate, onDate),
      ),
    )
    .orderBy(desc(salaries.effectiveDate))
    .limit(1);

  return row ?? null;
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { start, end };
}

/** `date` plus one calendar day, both as `yyyy-mm-dd` — used to walk a
 * period one day at a time in `calculateSalary`. Parsed/formatted as UTC
 * throughout so a date string never drifts a day from the local
 * timezone's DST quirks. */
function nextDateIso(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 0 (Sunday) – 6 (Saturday) for a `yyyy-mm-dd` date, matching the same
 * numbering `weeklyOffDay` is configured with. */
function dayOfWeekIso(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Every calendar date (clipped to `[periodStart, periodEnd]`) covered by
 * an *approved* leave request — used to pay a leave day in full at the
 * standard-hours rate during `calculateSalary`'s daily walk, replacing the
 * legacy backend's day-count-only `_approved_leave_days`. */
async function approvedLeaveDates(
  staffId: string,
  periodStart: string,
  periodEnd: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ fromDate: staffLeaves.fromDate, toDate: staffLeaves.toDate })
    .from(staffLeaves)
    .where(
      and(
        eq(staffLeaves.staffId, staffId),
        eq(staffLeaves.status, "approved"),
        lte(staffLeaves.fromDate, periodEnd),
        gte(staffLeaves.toDate, periodStart),
      ),
    );

  const dates = new Set<string>();
  for (const row of rows) {
    const start = row.fromDate > periodStart ? row.fromDate : periodStart;
    const end = row.toDate < periodEnd ? row.toDate : periodEnd;
    for (let cursor = start; cursor <= end; cursor = nextDateIso(cursor)) {
      dates.add(cursor);
    }
  }

  return dates;
}

export type SalaryCalculation = {
  staffId: string;
  staffName: string;
  periodYear: number;
  periodMonth: number;
  periodStart: string;
  periodEnd: string;
  baseSalary: string;
  weeklyOffDay: number | null;
  standardHoursPerDay: string;
  overtimeRatePerHour: string | null;
  /** Working days actually computed for this specific period (calendar
   * days in range minus weekly-off days) — see the "auto 26 vs 27"
   * design note on `calculateSalary`. */
  workingDays: number;
  presentDays: number;
  approvedLeaveDays: number;
  /** Checked in but never checked out — counted as 0 payable minutes
   * until an owner correction fixes it. */
  incompleteDays: number;
  absentDays: number;
  hourlyRate: string;
  basePay: string;
  overtimePay: string;
  overtimeMinutes: number;
  shortfallMinutes: number;
  netAmount: string;
  totalWorkedMinutes: number;
  averageMinutesPerDay: number;
};

/**
 * Attendance-derived salary for one staff member for one calendar month
 * (doc §18), computed **per minute**, not per day: `basePay` is
 * `baseSalary × payableMinutes ÷ standardMinutesForThePeriod`
 * (`proRateMoney`, one BigInt division for the whole period so rounding
 * never compounds day-by-day), so a short day only loses the pay for the
 * hours actually missed instead of the whole day, and a long day earns
 * `overtimeRatePerHour` for whatever's beyond `standardHoursPerDay`.
 *
 * `workingDays` (the divisor's day-count) is derived fresh for *this*
 * period from `weeklyOffDay` — walking every calendar date and skipping
 * whichever weekday is configured as the weekly off — rather than a
 * static number, which is what makes it come out to 26 in a 30-day month
 * and 27 in a 31-day one automatically.
 *
 * A staff member who joined mid-month is handled by simply starting the
 * walk at `max(periodStart, salaryConfig.effectiveDate)` — days before
 * they were configured at all are excluded from both the numerator and
 * denominator, never counted as absent.
 *
 * Never persisted by itself; `generatePayslip` is what turns this into a
 * stable record.
 */
export async function calculateSalary(
  actor: TenantSessionUser,
  staffId: string,
  year: number,
  month: number,
): Promise<SalaryCalculation> {
  assertCanView(actor, staffId);
  const staff = await requireTenantStaff(actor.shopId, staffId);

  const { start: periodStart, end: periodEnd } = monthBounds(year, month);

  const configuration = await getEffectiveSalary(actor.shopId, staffId, periodEnd);
  if (!configuration) {
    throw new AppError(
      "No salary is configured for this staff member for that period",
      400,
    );
  }

  const baseSalary = configuration.amount;
  const weeklyOffDay = configuration.weeklyOffDay;
  const standardMinutesPerDay = Math.round(
    Number(configuration.standardHoursPerDay) * 60,
  );

  // A config that only takes effect partway through this period (a
  // mid-month joiner, or a raise dated after the 1st) starts the walk
  // there instead — see the doc comment above.
  const effectiveStart =
    configuration.effectiveDate > periodStart
      ? configuration.effectiveDate
      : periodStart;

  const [attendanceRows, leaveDates] = await Promise.all([
    db
      .select({
        date: attendances.date,
        status: attendances.status,
        checkInTime: attendances.checkInTime,
        checkOutTime: attendances.checkOutTime,
      })
      .from(attendances)
      .where(
        and(
          eq(attendances.shopId, actor.shopId),
          eq(attendances.staffId, staffId),
          gte(attendances.date, effectiveStart),
          lte(attendances.date, periodEnd),
        ),
      ),
    approvedLeaveDates(staffId, effectiveStart, periodEnd),
  ]);
  const attendanceByDate = new Map(attendanceRows.map((row) => [row.date, row]));

  let workingDays = 0;
  let totalStandardMinutes = 0;
  let totalPayableMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalWorkedMinutes = 0;
  let presentDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let incompleteDays = 0;
  let shortfallMinutes = 0;

  for (
    let cursor = effectiveStart;
    cursor <= periodEnd;
    cursor = nextDateIso(cursor)
  ) {
    if (weeklyOffDay !== null && dayOfWeekIso(cursor) === weeklyOffDay) {
      continue;
    }

    workingDays += 1;
    totalStandardMinutes += standardMinutesPerDay;

    if (leaveDates.has(cursor)) {
      leaveDays += 1;
      totalPayableMinutes += standardMinutesPerDay;
      continue;
    }

    const attendance = attendanceByDate.get(cursor);
    if (!attendance || attendance.status === "absent") {
      absentDays += 1;
      continue;
    }

    if (!attendance.checkOutTime) {
      incompleteDays += 1;
      continue;
    }

    const workedMinutes = Math.max(
      0,
      Math.round(
        (attendance.checkOutTime.getTime() - attendance.checkInTime.getTime()) /
          60_000,
      ),
    );
    presentDays += 1;
    totalWorkedMinutes += workedMinutes;

    const payableMinutes = Math.min(workedMinutes, standardMinutesPerDay);
    totalPayableMinutes += payableMinutes;
    if (workedMinutes > standardMinutesPerDay) {
      totalOvertimeMinutes += workedMinutes - standardMinutesPerDay;
    } else {
      shortfallMinutes += standardMinutesPerDay - workedMinutes;
    }
  }

  const hourlyRate =
    totalStandardMinutes > 0
      ? proRateMoney(baseSalary, 60, totalStandardMinutes)
      : ZERO_MONEY;
  const basePay =
    totalStandardMinutes > 0
      ? proRateMoney(baseSalary, totalPayableMinutes, totalStandardMinutes)
      : ZERO_MONEY;
  const overtimePay = configuration.overtimeRatePerHour
    ? proRateMoney(configuration.overtimeRatePerHour, totalOvertimeMinutes, 60)
    : ZERO_MONEY;
  const netAmount = nonNegativeMoney(addMoney(basePay, overtimePay));

  const averageMinutesPerDay =
    presentDays > 0 ? totalWorkedMinutes / presentDays : 0;

  return {
    staffId,
    staffName: `${staff.firstName} ${staff.lastName}`,
    periodYear: year,
    periodMonth: month,
    periodStart,
    periodEnd,
    baseSalary,
    weeklyOffDay,
    standardHoursPerDay: configuration.standardHoursPerDay,
    overtimeRatePerHour: configuration.overtimeRatePerHour,
    workingDays,
    presentDays,
    approvedLeaveDays: leaveDays,
    incompleteDays,
    absentDays,
    hourlyRate,
    basePay,
    overtimePay,
    overtimeMinutes: totalOvertimeMinutes,
    shortfallMinutes,
    netAmount,
    totalWorkedMinutes,
    averageMinutesPerDay,
  };
}

export type PayslipItem = SalaryPayslip & {
  staffFirstName: string;
  staffLastName: string;
  averageMinutesPerDay: number;
};

/** Derives "average minutes worked per present day" from the two figures a
 * payslip row actually persists (`totalWorkedMinutes`/`presentDays`) —
 * deterministic and never drifts from the frozen snapshot, so it's always
 * computed here at read time rather than stored as its own column. */
function withAverageMinutesPerDay<
  T extends { totalWorkedMinutes: number; presentDays: number },
>(row: T): T & { averageMinutesPerDay: number } {
  return {
    ...row,
    averageMinutesPerDay:
      row.presentDays > 0 ? row.totalWorkedMinutes / row.presentDays : 0,
  };
}

/** Persists a calculation so payroll history is stable — regenerating for
 * the same period recalculates and overwrites the same row (never a
 * duplicate), matching the legacy backend's upsert-by-period behaviour. */
export async function generatePayslip(
  actor: TenantSessionUser,
  staffId: string,
  year: number,
  month: number,
): Promise<PayslipItem> {
  if (!hasPermission(actor.role, Permission.SALARY_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const calculation = await calculateSalary(actor, staffId, year, month);

  const [existing] = await db
    .select({ id: salaryPayslips.id })
    .from(salaryPayslips)
    .where(
      and(
        eq(salaryPayslips.staffId, staffId),
        eq(salaryPayslips.periodYear, year),
        eq(salaryPayslips.periodMonth, month),
      ),
    )
    .limit(1);

  const values = {
    shopId: actor.shopId,
    staffId,
    periodYear: year,
    periodMonth: month,
    baseSalary: calculation.baseSalary,
    workingDays: calculation.workingDays,
    presentDays: calculation.presentDays,
    absentDays: calculation.absentDays,
    approvedLeaveDays: calculation.approvedLeaveDays,
    incompleteDays: calculation.incompleteDays,
    weeklyOffDay: calculation.weeklyOffDay,
    standardHoursPerDay: calculation.standardHoursPerDay,
    overtimeRatePerHour: calculation.overtimeRatePerHour,
    hourlyRate: calculation.hourlyRate,
    basePay: calculation.basePay,
    overtimePay: calculation.overtimePay,
    overtimeMinutes: calculation.overtimeMinutes,
    shortfallMinutes: calculation.shortfallMinutes,
    netAmount: calculation.netAmount,
    totalWorkedMinutes: calculation.totalWorkedMinutes,
    generatedById: actor.id,
    generatedAt: new Date(),
    updatedAt: new Date(),
  };

  const payslipId = existing
    ? (
        await db
          .update(salaryPayslips)
          .set(values)
          .where(eq(salaryPayslips.id, existing.id))
          .returning({ id: salaryPayslips.id })
      )[0].id
    : (
        await db.insert(salaryPayslips).values(values).returning({ id: salaryPayslips.id })
      )[0].id;

  const [item] = await db
    .select({
      id: salaryPayslips.id,
      shopId: salaryPayslips.shopId,
      staffId: salaryPayslips.staffId,
      periodYear: salaryPayslips.periodYear,
      periodMonth: salaryPayslips.periodMonth,
      baseSalary: salaryPayslips.baseSalary,
      workingDays: salaryPayslips.workingDays,
      presentDays: salaryPayslips.presentDays,
      absentDays: salaryPayslips.absentDays,
      approvedLeaveDays: salaryPayslips.approvedLeaveDays,
      incompleteDays: salaryPayslips.incompleteDays,
      weeklyOffDay: salaryPayslips.weeklyOffDay,
      standardHoursPerDay: salaryPayslips.standardHoursPerDay,
      overtimeRatePerHour: salaryPayslips.overtimeRatePerHour,
      hourlyRate: salaryPayslips.hourlyRate,
      basePay: salaryPayslips.basePay,
      overtimePay: salaryPayslips.overtimePay,
      overtimeMinutes: salaryPayslips.overtimeMinutes,
      shortfallMinutes: salaryPayslips.shortfallMinutes,
      netAmount: salaryPayslips.netAmount,
      totalWorkedMinutes: salaryPayslips.totalWorkedMinutes,
      note: salaryPayslips.note,
      generatedById: salaryPayslips.generatedById,
      generatedAt: salaryPayslips.generatedAt,
      createdAt: salaryPayslips.createdAt,
      updatedAt: salaryPayslips.updatedAt,
      staffFirstName: users.firstName,
      staffLastName: users.lastName,
    })
    .from(salaryPayslips)
    .innerJoin(users, eq(salaryPayslips.staffId, users.id))
    .where(eq(salaryPayslips.id, payslipId));

  return withAverageMinutesPerDay(item);
}

export type PayslipListResult = {
  items: PayslipItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listPayslips(
  actor: TenantSessionUser,
  query: PayslipListQuery,
): Promise<PayslipListResult> {
  const canManage = hasPermission(actor.role, Permission.SALARY_MANAGE);
  const conditions = [eq(salaryPayslips.shopId, actor.shopId)];

  if (!canManage) {
    conditions.push(eq(salaryPayslips.staffId, actor.id));
  } else if (query.staffId) {
    conditions.push(eq(salaryPayslips.staffId, query.staffId));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(salaryPayslips).where(where),
    db
      .select({
        id: salaryPayslips.id,
        shopId: salaryPayslips.shopId,
        staffId: salaryPayslips.staffId,
        periodYear: salaryPayslips.periodYear,
        periodMonth: salaryPayslips.periodMonth,
        baseSalary: salaryPayslips.baseSalary,
        workingDays: salaryPayslips.workingDays,
        presentDays: salaryPayslips.presentDays,
        absentDays: salaryPayslips.absentDays,
        approvedLeaveDays: salaryPayslips.approvedLeaveDays,
        incompleteDays: salaryPayslips.incompleteDays,
        weeklyOffDay: salaryPayslips.weeklyOffDay,
        standardHoursPerDay: salaryPayslips.standardHoursPerDay,
        overtimeRatePerHour: salaryPayslips.overtimeRatePerHour,
        hourlyRate: salaryPayslips.hourlyRate,
        basePay: salaryPayslips.basePay,
        overtimePay: salaryPayslips.overtimePay,
        overtimeMinutes: salaryPayslips.overtimeMinutes,
        shortfallMinutes: salaryPayslips.shortfallMinutes,
        netAmount: salaryPayslips.netAmount,
        totalWorkedMinutes: salaryPayslips.totalWorkedMinutes,
        note: salaryPayslips.note,
        generatedById: salaryPayslips.generatedById,
        generatedAt: salaryPayslips.generatedAt,
        createdAt: salaryPayslips.createdAt,
        updatedAt: salaryPayslips.updatedAt,
        staffFirstName: users.firstName,
        staffLastName: users.lastName,
      })
      .from(salaryPayslips)
      .innerJoin(users, eq(salaryPayslips.staffId, users.id))
      .where(where)
      .orderBy(desc(salaryPayslips.periodYear), desc(salaryPayslips.periodMonth))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows.map(withAverageMinutesPerDay),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
