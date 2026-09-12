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
    //: Reference only since the move to the hours-worked model: what the
    //: role is nominally worth per month, shown on the configuration and
    //: useful for budgeting, but **never** divided into an hourly figure
    //: (see `hourlyRate`). Nullable because a shop that pays purely by the
    //: hour has no monthly number to state.
    amount: numeric("amount", { precision: 12, scale: 2 }),
    //: What one hour of approved, actually-worked time is paid at — the
    //: basis of every payslip (`basePay = regular hours × this`). Entered
    //: by the owner per staff member; deliberately never derived from
    //: `amount ÷ standardHoursPerDay`, which would silently re-introduce
    //: the monthly-salary model this replaced and price overtime against
    //: a number nobody agreed to.
    hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    // 0=Sunday…6=Saturday, the day that's never a working day when
    // deriving how many working days fall in a given calendar month
    // (naturally 26 or 27 depending on the month's length) — null means no
    // weekly off (every calendar day is a working day).
    weeklyOffDay: integer("weekly_off_day"),
    // Hours a full working day is worth. Not a pay divisor — it is the
    // line between ordinary hours (paid at `hourlyRate`) and extra
    // worktime (paid at `overtimeRatePerHour`), and what one day of
    // approved leave is credited as. Numeric so a shop can configure 8.5.
    standardHoursPerDay: numeric("standard_hours_per_day", {
      precision: 4,
      scale: 2,
    })
      .notNull()
      .default("8.00"),
    // What one hour of *extra worktime* is paid at — hours worked beyond
    // `standardHoursPerDay` on a given day. Configured separately from
    // `hourlyRate` so a shop can pay a premium (or the same rate) for
    // extra time; null/0 leaves extra hours uncompensated rather than
    // penalised.
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
    //: The days this payslip actually pays for. A payroll period is no
    //: longer assumed to be a calendar month — a shop may run a fortnight,
    //: a week, or any stretch of days — so the range is the source of
    //: truth and the month pair below is derived from it.
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    //: Set only when the range is exactly one whole calendar month, which
    //: is what lets the history list keep labelling those "September 2026"
    //: instead of a pair of dates. Null for any other range.
    periodYear: integer("period_year"),
    periodMonth: integer("period_month"),
    //: The monthly reference figure in force that month, if the shop
    //: states one. Never used in the arithmetic — `basePay` comes from
    //: hours × `hourlyRate` — kept so a payslip can still show what the
    //: role was nominally worth.
    baseSalary: numeric("base_salary", { precision: 12, scale: 2 }),
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
    // The configured rate this payslip was priced at, frozen here so a
    // later raise never repriced a month already paid.
    hourlyRate: numeric("hourly_rate", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    // Approved ordinary minutes this period: time worked up to
    // `standardHoursPerDay` each day, plus a standard day for each
    // approved leave day. `basePay = regularMinutes ÷ 60 × hourlyRate`.
    regularMinutes: integer("regular_minutes").notNull().default(0),
    basePay: numeric("base_pay", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    overtimePay: numeric("overtime_pay", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    // Approved extra worktime: minutes beyond `standardHoursPerDay` on
    // the days they were actually worked. `overtimePay = these ÷ 60 ×
    // overtimeRatePerHour`.
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
    //: One payslip per staff member per exact range — regenerating the
    //: same period overwrites rather than duplicating, the same rule the
    //: month-keyed index enforced before ranges existed.
    uniqueIndex("uq_payslip_staff_period").on(
      table.staffId,
      table.periodStart,
      table.periodEnd,
    ),
    index("ix_salary_payslips_shop_id").on(table.shopId),
  ],
);

export type SalaryPayslip = typeof salaryPayslips.$inferSelect;
export type NewSalaryPayslip = typeof salaryPayslips.$inferInsert;
