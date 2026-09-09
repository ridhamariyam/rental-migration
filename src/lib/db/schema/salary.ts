import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { shops } from "@/lib/db/schema/shops";
import { users } from "@/lib/db/schema/users";

/**
 * Salary configuration for a staff member, versioned by effective date
 * (doc §18), mirroring the legacy backend's `Salary`. A new row is added
 * rather than overwriting the old one whenever pay changes, so
 * `calculateSalary` can always price a past month against whatever was
 * actually in force then (`getEffectiveSalary`'s "latest row at or before
 * this date" lookup) — editing today's amount must never reprice last
 * month's already-generated payslip.
 */
export const salaries = pgTable(
  "salaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // 0=Sunday…6=Saturday, the day that's never a working day when
    // deriving how many working days fall in a given calendar month
    // (naturally 26 or 27 depending on the month's length) — null means no
    // weekly off (every calendar day is a working day).
    weeklyOffDay: integer("weekly_off_day"),
    // Hours a full working day is worth — the divisor for turning `amount`
    // into a per-minute rate (see `calculateSalary`), not just a per-day
    // one. Numeric so a shop can configure e.g. 8.5.
    standardHoursPerDay: numeric("standard_hours_per_day", {
      precision: 4,
      scale: 2,
    })
      .notNull()
      .default("8.00"),
    // Flat amount paid per hour worked beyond `standardHoursPerDay` on a
    // given day. Null/0 disables overtime pay entirely (extra hours are
    // simply not compensated, but not penalised either).
    overtimeRatePerHour: numeric("overtime_rate_per_hour", {
      precision: 12,
      scale: 2,
    }),
    effectiveDate: date("effective_date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ix_salaries_staff_id").on(table.staffId)],
);

export type Salary = typeof salaries.$inferSelect;
export type NewSalary = typeof salaries.$inferInsert;

/**
 * One persisted, attendance-derived salary calculation for a staff member
 * for one calendar month (doc §18's "Salary Record"), mirroring the legacy
 * backend's `SalaryPayslip`. Generating a payslip a second time for the
 * same period recalculates and overwrites this same row (never a
 * duplicate) — CLAUDE.md's "settlements are persisted transactions" rule
 * applies the same way here: reports read this stored figure, they never
 * recompute it from attendance on the fly.
 */
export const salaryPayslips = pgTable(
  "salary_payslips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodYear: integer("period_year").notNull(),
    periodMonth: integer("period_month").notNull(),
    baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
    // Working days actually computed for this specific period (weekly-off
    // days excluded), not a static config number — see `calculateSalary`.
    workingDays: integer("working_days").notNull(),
    presentDays: integer("present_days").notNull().default(0),
    absentDays: integer("absent_days").notNull().default(0),
    approvedLeaveDays: integer("approved_leave_days").notNull().default(0),
    // Checked in but never checked out for that day — counted as 0 payable
    // minutes until an owner correction fixes it (see `calculateSalary`).
    incompleteDays: integer("incomplete_days").notNull().default(0),
    weeklyOffDay: integer("weekly_off_day"),
    standardHoursPerDay: numeric("standard_hours_per_day", {
      precision: 4,
      scale: 2,
    })
      .notNull()
      .default("8.00"),
    overtimeRatePerHour: numeric("overtime_rate_per_hour", {
      precision: 12,
      scale: 2,
    }),
    // `baseSalary / totalStandardMinutes * 60` — display-only reference
    // rate, not itself used to derive `basePay` (that's one BigInt
    // division over the whole period, not this rate times hours, to avoid
    // compounding rounding — see `proRateMoney`).
    hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    basePay: numeric("base_pay", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    overtimePay: numeric("overtime_pay", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    shortfallMinutes: integer("shortfall_minutes").notNull().default(0),
    netAmount: numeric("net_amount", { precision: 12, scale: 2 }).notNull(),
    // Sum of actual check-in→check-out durations across the period, in
    // whole minutes — frozen at generation time alongside the day counts
    // above (same "payslip is a stable snapshot" rule from this table's
    // own doc comment), never recomputed live from `attendances` later.
    // Purely informational (`basePay`/`overtimePay` are what drive
    // `netAmount`) — shown on the payslip history as "total hours"/"avg
    // per day".
    totalWorkedMinutes: integer("total_worked_minutes").notNull().default(0),
    note: text("note"),
    generatedById: uuid("generated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_payslip_staff_period").on(
      table.staffId,
      table.periodYear,
      table.periodMonth,
    ),
    index("ix_salary_payslips_shop_id").on(table.shopId),
  ],
);

export type SalaryPayslip = typeof salaryPayslips.$inferSelect;
export type NewSalaryPayslip = typeof salaryPayslips.$inferInsert;
