ALTER TABLE "salaries" ADD COLUMN "weekly_off_day" integer;--> statement-breakpoint
ALTER TABLE "salaries" ADD COLUMN "standard_hours_per_day" numeric(4, 2) DEFAULT '8.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "salaries" ADD COLUMN "overtime_rate_per_hour" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "incomplete_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "weekly_off_day" integer;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "standard_hours_per_day" numeric(4, 2) DEFAULT '8.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "overtime_rate_per_hour" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "hourly_rate" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "base_pay" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "overtime_pay" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "overtime_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "shortfall_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "salaries" DROP COLUMN "working_days_per_month";--> statement-breakpoint
ALTER TABLE "salary_payslips" DROP COLUMN "per_day_amount";