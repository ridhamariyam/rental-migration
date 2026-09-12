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
import {
  addMoney,
  compareMoney,
  nonNegativeMoney,
  proRateMoney,
  ZERO_MONEY,
} from "@/lib/money";
import { toDateString } from "@/lib/format";
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
      joinedOn: users.joinedOn,
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
      amount: input.amount || null,
      hourlyRate: input.hourlyRate,
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
    summary: `Pay of ${salary.hourlyRate}/hour configured, effective ${salary.effectiveDate}`,
    after: {
      hourlyRate: salary.hourlyRate,
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
      amount: input.amount || null,
      hourlyRate: input.hourlyRate,
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
    summary: `Pay configuration updated to ${salary.hourlyRate}/hour`,
    before: {
      hourlyRate: existing.hourlyRate,
      amount: existing.amount,
      weeklyOffDay: existing.weeklyOffDay,
      standardHoursPerDay: existing.standardHoursPerDay,
      overtimeRatePerHour: existing.overtimeRatePerHour,
    },
    after: {
      hourlyRate: salary.hourlyRate,
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
    summary: `Pay configuration of ${existing.hourlyRate}/hour deleted`,
    before: {
      hourlyRate: existing.hourlyRate,
      amount: existing.amount,
      standardHoursPerDay: existing.standardHoursPerDay,
    },
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
    .where(
      and(eq(salaries.staffId, staffId), eq(salaries.shopId, actor.shopId)),
    )
    .orderBy(desc(salaries.effectiveDate));
}

export type PayReadiness = "none" | "no_rate" | "ready";

/**
 * Whether this staff member can have pay calculated at all, so the UI can
 * say what is missing *before* someone presses Calculate and gets a red
 * error back. `none` = never configured, `no_rate` = configured under the
 * old monthly-only model and still has no hourly rate.
 */
export async function getPayReadiness(
  actor: TenantSessionUser,
  staffId: string,
): Promise<PayReadiness> {
  assertCanView(actor, staffId);

  const [current] = await db
    .select({ hourlyRate: salaries.hourlyRate })
    .from(salaries)
    .where(
      and(eq(salaries.staffId, staffId), eq(salaries.shopId, actor.shopId)),
    )
    .orderBy(desc(salaries.effectiveDate))
    .limit(1);

  if (!current) return "none";
  return Number(current.hourlyRate) > 0 ? "ready" : "no_rate";
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

function monthBounds(
  year: number,
  month: number,
): { start: string; end: string } {
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
  /** Set only when the period is exactly one whole calendar month — what
   * lets a payslip be labelled "September 2026" instead of two dates. */
  periodYear: number | null;
  periodMonth: number | null;
  /** The days asked for. `payStart`/`periodEnd` below are what was
   * actually priced after clamping to today, the joining date and the pay
   * configuration. */
  periodStart: string;
  periodEnd: string;
  /** The first day actually priced — the latest of the period start, the
   * pay configuration's effective date and the staff member's joining
   * date. Days before it are neither paid nor counted absent. */
  payStart: string;
  /** Monthly reference figure, if the shop states one. Never used in the
   * arithmetic below. */
  monthlySalary: string | null;
  weeklyOffDay: number | null;
  standardHoursPerDay: string;
  /** The configured rate ordinary hours are paid at. */
  hourlyRate: string;
  /** The configured rate extra worktime is paid at, if any. */
  overtimeRatePerHour: string | null;
  /** Working days actually computed for this specific period (calendar
   * days in range minus weekly-off days). */
  workingDays: number;
  presentDays: number;
  approvedLeaveDays: number;
  /** Checked in but never checked out — counted as 0 payable minutes
   * until an owner correction fixes it. */
  incompleteDays: number;
  absentDays: number;
  /** Approved ordinary minutes: worked time up to `standardHoursPerDay`
   * each day, plus a standard day for each approved leave day. */
  regularMinutes: number;
  /** Approved extra worktime: minutes past `standardHoursPerDay` on the
   * days they were worked. */
  overtimeMinutes: number;
  /** `regularMinutes ÷ 60 × hourlyRate`. */
  basePay: string;
  /** `overtimeMinutes ÷ 60 × overtimeRatePerHour`. */
  overtimePay: string;
  shortfallMinutes: number;
  /** `basePay + overtimePay`. */
  netAmount: string;
  totalWorkedMinutes: number;
  averageMinutesPerDay: number;
};

/** The `{year, month}` a range covers when it is exactly one whole
 * calendar month, else nulls — see `SalaryCalculation.periodYear`. */
function wholeMonthOf(
  start: string,
  end: string,
): { year: number | null; month: number | null } {
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  const bounds = monthBounds(year, month);
  return bounds.start === start && bounds.end === end
    ? { year, month }
    : { year: null, month: null };
}

/**
 * What one staff member earned in one calendar month, from the hours they
 * actually worked (doc §18).
 *
 *     basePay     = approved regular hours × configured hourlyRate
 *     overtimePay = approved extra hours   × configured overtimeRatePerHour
 *     netAmount   = basePay + overtimePay
 *
 * Both rates are configured per staff member and used as entered. The
 * hourly rate is deliberately **never** derived from the monthly figure
 * (`amount ÷ standard hours`): that older model repriced every hour
 * whenever the month's shape changed and paid overtime against a number
 * nobody had agreed, which is what this replaced. `amount` survives only
 * as a reference figure carried onto the payslip.
 *
 * "Regular" vs "extra" is decided per day, not per period: a day is worth
 * up to `standardHoursPerDay` of regular time, and only what is worked
 * beyond that same day counts as extra worktime — so a 12-hour Monday and
 * a 4-hour Tuesday are 8 + 4 regular plus 4 extra, never 16 flat.
 *
 * An approved leave day is credited as one standard day of regular time
 * (paid, no extra). A weekly-off day is skipped entirely. A day with no
 * attendance row is an absence and earns nothing; a day checked in but
 * never checked out earns nothing either, until an owner correction gives
 * it a checkout.
 *
 * The walk starts at the latest of the period start, the pay
 * configuration's `effectiveDate`, and the staff member's `joinedOn` — so
 * a mid-month joiner is never scored absent for the days before they
 * started — and stops at today, since a month still running would
 * otherwise count its remaining days as absences (RQ-09).
 *
 * Never persisted by itself; `generatePayslip` is what turns this into a
 * stable record.
 */
/**
 * The calendar-month shorthand for `calculateSalaryForRange` — most payroll
 * still runs monthly, and a month is just the range from its 1st to its
 * last day.
 */
export async function calculateSalary(
  actor: TenantSessionUser,
  staffId: string,
  year: number,
  month: number,
): Promise<SalaryCalculation> {
  const { start, end } = monthBounds(year, month);
  return calculateSalaryForRange(actor, staffId, {
    fromDate: start,
    toDate: end,
  });
}

export async function calculateSalaryForRange(
  actor: TenantSessionUser,
  staffId: string,
  range: { fromDate: string; toDate: string },
): Promise<SalaryCalculation> {
  assertCanView(actor, staffId);
  const staff = await requireTenantStaff(actor.shopId, staffId);

  const periodStart = range.fromDate;
  const fullPeriodEnd = range.toDate;

  if (fullPeriodEnd < periodStart) {
    throw new AppError("The end date cannot be before the start date", 400);
  }

  // A range that happens to be exactly one calendar month keeps the
  // month labelling the payslip history reads by.
  const { year, month } = wholeMonthOf(periodStart, fullPeriodEnd);

  // Never walk into days that have not happened yet. Every day with no
  // attendance row counts as an absence, so previewing the current month
  // on the 10th used to score days 11-30 as absent and report a wildly
  // understated figure — which `generatePayslip` then persisted (RQ-09).
  const today = toDateString(new Date());
  const periodEnd = fullPeriodEnd > today ? today : fullPeriodEnd;

  if (periodEnd < periodStart) {
    throw new AppError("That salary period has not started yet", 400);
  }

  const configuration = await getEffectiveSalary(
    actor.shopId,
    staffId,
    periodEnd,
  );
  if (!configuration) {
    throw new AppError(
      "No pay is configured for this staff member for that period",
      400,
    );
  }

  const hourlyRate = configuration.hourlyRate;
  if (compareMoney(hourlyRate, ZERO_MONEY) <= 0) {
    // A zero rate would quietly produce a zero payslip. Pay configured
    // before this shop moved to hourly pay has no rate at all, so say so
    // rather than paying nothing.
    throw new AppError(
      "No hourly rate is configured for this staff member for that period — set one on their pay configuration",
      400,
    );
  }

  const weeklyOffDay = configuration.weeklyOffDay;
  const standardMinutesPerDay = Math.round(
    Number(configuration.standardHoursPerDay) * 60,
  );

  // Pay starts at whichever comes last: the month, the configuration that
  // prices it, or the day this person joined. Days before that are outside
  // the employment/pricing window entirely — not absences.
  const payStart = [periodStart, configuration.effectiveDate, staff.joinedOn]
    .filter((value): value is string => Boolean(value))
    .reduce((latest, value) => (value > latest ? value : latest), periodStart);

  if (payStart > periodEnd) {
    return {
      staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      periodYear: year,
      periodMonth: month,
      periodStart,
      periodEnd,
      payStart,
      monthlySalary: configuration.amount,
      weeklyOffDay,
      standardHoursPerDay: configuration.standardHoursPerDay,
      hourlyRate,
      overtimeRatePerHour: configuration.overtimeRatePerHour,
      workingDays: 0,
      presentDays: 0,
      approvedLeaveDays: 0,
      incompleteDays: 0,
      absentDays: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      basePay: ZERO_MONEY,
      overtimePay: ZERO_MONEY,
      shortfallMinutes: 0,
      netAmount: ZERO_MONEY,
      totalWorkedMinutes: 0,
      averageMinutesPerDay: 0,
    };
  }

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
          gte(attendances.date, payStart),
          lte(attendances.date, periodEnd),
        ),
      ),
    approvedLeaveDates(staffId, payStart, periodEnd),
  ]);
  const attendanceByDate = new Map(
    attendanceRows.map((row) => [row.date, row]),
  );

  let workingDays = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let totalWorkedMinutes = 0;
  let presentDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let incompleteDays = 0;
  let shortfallMinutes = 0;

  for (
    let cursor = payStart;
    cursor <= periodEnd;
    cursor = nextDateIso(cursor)
  ) {
    if (weeklyOffDay !== null && dayOfWeekIso(cursor) === weeklyOffDay) {
      continue;
    }

    workingDays += 1;

    if (leaveDates.has(cursor)) {
      leaveDays += 1;
      regularMinutes += standardMinutesPerDay;
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

    regularMinutes += Math.min(workedMinutes, standardMinutesPerDay);
    if (workedMinutes > standardMinutesPerDay) {
      overtimeMinutes += workedMinutes - standardMinutesPerDay;
    } else {
      shortfallMinutes += standardMinutesPerDay - workedMinutes;
    }
  }

  // One division per figure (`proRateMoney` is BigInt-exact) rather than
  // rounding an hourly amount per day and summing the error.
  const basePay = proRateMoney(hourlyRate, regularMinutes, 60);
  const overtimePay = configuration.overtimeRatePerHour
    ? proRateMoney(configuration.overtimeRatePerHour, overtimeMinutes, 60)
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
    payStart,
    monthlySalary: configuration.amount,
    weeklyOffDay,
    standardHoursPerDay: configuration.standardHoursPerDay,
    hourlyRate,
    overtimeRatePerHour: configuration.overtimeRatePerHour,
    workingDays,
    presentDays,
    approvedLeaveDays: leaveDays,
    incompleteDays,
    absentDays,
    regularMinutes,
    overtimeMinutes,
    basePay,
    overtimePay,
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
export async function generatePayslipForRange(
  actor: TenantSessionUser,
  staffId: string,
  range: { fromDate: string; toDate: string },
): Promise<PayslipItem> {
  if (!hasPermission(actor.role, Permission.SALARY_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  // A payslip is a record of a period that has finished. Previewing a
  // period still running is useful (and clamped to today by the
  // calculation), but persisting that preview would pay out a partial
  // period as if it were complete (RQ-09).
  const today = toDateString(new Date());
  if (range.toDate >= today) {
    throw new AppError(
      "This period has not finished yet — a payslip can only be generated once the last day has passed",
      400,
    );
  }

  const calculation = await calculateSalaryForRange(actor, staffId, range);

  const [existing] = await db
    .select({ id: salaryPayslips.id })
    .from(salaryPayslips)
    .where(
      and(
        eq(salaryPayslips.staffId, staffId),
        eq(salaryPayslips.periodStart, range.fromDate),
        eq(salaryPayslips.periodEnd, range.toDate),
      ),
    )
    .limit(1);

  const values = {
    shopId: actor.shopId,
    staffId,
    periodStart: range.fromDate,
    periodEnd: range.toDate,
    periodYear: calculation.periodYear,
    periodMonth: calculation.periodMonth,
    baseSalary: calculation.monthlySalary,
    workingDays: calculation.workingDays,
    presentDays: calculation.presentDays,
    absentDays: calculation.absentDays,
    approvedLeaveDays: calculation.approvedLeaveDays,
    incompleteDays: calculation.incompleteDays,
    weeklyOffDay: calculation.weeklyOffDay,
    standardHoursPerDay: calculation.standardHoursPerDay,
    overtimeRatePerHour: calculation.overtimeRatePerHour,
    hourlyRate: calculation.hourlyRate,
    regularMinutes: calculation.regularMinutes,
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
        await db
          .insert(salaryPayslips)
          .values(values)
          .returning({ id: salaryPayslips.id })
      )[0].id;

  const [item] = await db
    .select({
      id: salaryPayslips.id,
      shopId: salaryPayslips.shopId,
      staffId: salaryPayslips.staffId,
      periodStart: salaryPayslips.periodStart,
      periodEnd: salaryPayslips.periodEnd,
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
      regularMinutes: salaryPayslips.regularMinutes,
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

/** Calendar-month shorthand for `generatePayslipForRange`. */
export async function generatePayslip(
  actor: TenantSessionUser,
  staffId: string,
  year: number,
  month: number,
): Promise<PayslipItem> {
  const { start, end } = monthBounds(year, month);
  return generatePayslipForRange(actor, staffId, {
    fromDate: start,
    toDate: end,
  });
}

export type PayslipListResult = {
  items: PayslipItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * One payslip for the payslip document/print view. Scoped the same way the
 * list is: your own always, anyone else's only with `SALARY_MANAGE`, and
 * never another tenant's.
 */
export async function getPayslipById(
  actor: TenantSessionUser,
  id: string,
): Promise<PayslipItem | null> {
  const [row] = await db
    .select({
      id: salaryPayslips.id,
      shopId: salaryPayslips.shopId,
      staffId: salaryPayslips.staffId,
      periodStart: salaryPayslips.periodStart,
      periodEnd: salaryPayslips.periodEnd,
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
      regularMinutes: salaryPayslips.regularMinutes,
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
    .where(
      and(
        eq(salaryPayslips.id, id),
        eq(salaryPayslips.shopId, actor.shopId),
      ),
    )
    .limit(1);

  if (!row) return null;

  if (
    row.staffId !== actor.id &&
    !hasPermission(actor.role, Permission.SALARY_MANAGE)
  ) {
    return null;
  }

  return withAverageMinutesPerDay(row);
}

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
        periodStart: salaryPayslips.periodStart,
        periodEnd: salaryPayslips.periodEnd,
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
        regularMinutes: salaryPayslips.regularMinutes,
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
      .orderBy(
        desc(salaryPayslips.periodYear),
        desc(salaryPayslips.periodMonth),
      )
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
