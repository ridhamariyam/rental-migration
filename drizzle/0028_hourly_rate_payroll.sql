ALTER TABLE "salaries" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ALTER COLUMN "base_salary" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "joined_on" date;--> statement-breakpoint
ALTER TABLE "salaries" ADD COLUMN "hourly_rate" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payslips" ADD COLUMN "regular_minutes" integer DEFAULT 0 NOT NULL;