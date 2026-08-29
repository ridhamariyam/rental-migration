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
    // Days the monthly amount is spread across when deriving a per-day
    // rate (e.g. 26, not the calendar month's actual day count).
    workingDaysPerMonth: integer("working_days_per_month")
      .notNull()
      .default(26),
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
    workingDays: integer("working_days").notNull(),
    presentDays: integer("present_days").notNull().default(0),
    absentDays: integer("absent_days").notNull().default(0),
    approvedLeaveDays: integer("approved_leave_days").notNull().default(0),
    perDayAmount: numeric("per_day_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    netAmount: numeric("net_amount", { precision: 12, scale: 2 }).notNull(),
    // Sum of actual check-in→check-out durations across the period, in
    // whole minutes — frozen at generation time alongside the day counts
    // above (same "payslip is a stable snapshot" rule from this table's
    // own doc comment), never recomputed live from `attendances` later.
    // Purely informational (net pay is still day-count-based, not hours-
    // based) — shown on the payslip history as "total hours"/"avg per day".
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
