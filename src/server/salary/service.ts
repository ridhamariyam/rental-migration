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
import { getWorkedHoursSummary } from "@/server/attendance/service";
import { divideMoneyByInteger, multiplyMoneyByDays, nonNegativeMoney, ZERO_MONEY } from "@/lib/money";
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
      workingDaysPerMonth: input.workingDaysPerMonth,
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
    after: { amount: salary.amount, workingDaysPerMonth: salary.workingDaysPerMonth, effectiveDate: salary.effectiveDate },
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
      workingDaysPerMonth: input.workingDaysPerMonth,
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
    before: { amount: existing.amount, workingDaysPerMonth: existing.workingDaysPerMonth },
    after: { amount: salary.amount, workingDaysPerMonth: salary.workingDaysPerMonth },
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
    before: { amount: existing.amount, workingDaysPerMonth: existing.workingDaysPerMonth },
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

/** Overlapping days of every *approved* leave request within the period —
 * ported exactly from the legacy `SalaryService._approved_leave_days`. */
async function approvedLeaveDays(
  staffId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
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

  let days = 0;
  for (const row of rows) {
    const start = row.fromDate > periodStart ? row.fromDate : periodStart;
    const end = row.toDate < periodEnd ? row.toDate : periodEnd;
    const dayCount =
      Math.round(
        (new Date(`${end}T00:00:00Z`).getTime() -
          new Date(`${start}T00:00:00Z`).getTime()) /
          86_400_000,
      ) + 1;
    days += dayCount;
  }

  return days;
}

export type SalaryCalculation = {
  staffId: string;
  staffName: string;
  periodYear: number;
  periodMonth: number;
  periodStart: string;
  periodEnd: string;
  baseSalary: string;
  workingDays: number;
  presentDays: number;
  approvedLeaveDays: number;
  payableDays: number;
  absentDays: number;
  perDayAmount: string;
  netAmount: string;
  totalWorkedMinutes: number;
  averageMinutesPerDay: number;
};

/** Attendance-derived salary for one staff member for one calendar month
 * (doc §18) — ported exactly from the legacy `SalaryService.calculate`.
 * Never persisted by itself; `generatePayslip` is what turns this into a
 * stable record. */
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
  const workingDays = configuration.workingDaysPerMonth || 26;
  const perDay = workingDays ? divideMoneyByInteger(baseSalary, workingDays) : ZERO_MONEY;

  const [presentRow] = await db
    .select({ value: count() })
    .from(attendances)
    .where(
      and(
        eq(attendances.staffId, staffId),
        gte(attendances.date, periodStart),
        lte(attendances.date, periodEnd),
        inArray(attendances.status, ["present", "corrected"]),
      ),
    );
  const presentDays = presentRow?.value ?? 0;

  const leaveDays = await approvedLeaveDays(staffId, periodStart, periodEnd);

  const payableDays = Math.min(workingDays, presentDays + leaveDays);
  const absentDays = Math.max(0, workingDays - payableDays);

  // Actual clocked hours are informational only (net pay stays day-count
  // based) — averaged over `presentDays` so it stays consistent with
  // whatever's re-derivable later from a *persisted* payslip row (only
  // `totalWorkedMinutes`/`presentDays` are frozen at generation time, not
  // a separate "days with a checkout" count).
  const workedHours = await getWorkedHoursSummary(
    actor.shopId,
    staffId,
    periodStart,
    periodEnd,
  );
  const averageMinutesPerDay =
    presentDays > 0 ? workedHours.totalMinutes / presentDays : 0;

  // Decimal-safe multiply (cents-based `BigInt` arithmetic, never a
  // binary float) — same `multiplyMoneyByDays` helper booking pricing
  // uses for `rentAmount * totalDays`.
  const netAmount = nonNegativeMoney(multiplyMoneyByDays(perDay, payableDays));

  return {
    staffId,
    staffName: `${staff.firstName} ${staff.lastName}`,
    periodYear: year,
    periodMonth: month,
    periodStart,
    periodEnd,
    baseSalary,
    workingDays,
    presentDays,
    approvedLeaveDays: leaveDays,
    payableDays,
    absentDays,
    perDayAmount: perDay,
    netAmount,
    totalWorkedMinutes: workedHours.totalMinutes,
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
    perDayAmount: calculation.perDayAmount,
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
      perDayAmount: salaryPayslips.perDayAmount,
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
        perDayAmount: salaryPayslips.perDayAmount,
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
