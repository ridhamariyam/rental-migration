-- A payroll period is a range of dates, not necessarily a calendar month.
--
-- The two new columns are added nullable and backfilled from the
-- year/month pair every existing payslip was keyed by (first day of that
-- month to its last), then made NOT NULL — adding them NOT NULL outright
-- would fail on any table that already holds payslips, which is exactly
-- what production has.
ALTER TABLE "salary_payslips" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "period_end" date;--> statement-breakpoint

UPDATE "salary_payslips"
SET "period_start" = make_date("period_year", "period_month", 1),
    "period_end" = (make_date("period_year", "period_month", 1) + interval '1 month' - interval '1 day')::date
WHERE "period_start" IS NULL AND "period_year" IS NOT NULL AND "period_month" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "salary_payslips" ALTER COLUMN "period_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ALTER COLUMN "period_end" SET NOT NULL;--> statement-breakpoint

-- `period_year`/`period_month` survive as the label for a payslip whose
-- range happens to be one whole month; a custom range leaves them null.
ALTER TABLE "salary_payslips" ALTER COLUMN "period_year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ALTER COLUMN "period_month" DROP NOT NULL;--> statement-breakpoint

DROP INDEX "uq_payslip_staff_period";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payslip_staff_period" ON "salary_payslips" USING btree ("staff_id","period_start","period_end");
