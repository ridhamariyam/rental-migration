ALTER TABLE "bookings" ADD COLUMN "additional_cost" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "additional_cost_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "documents" jsonb DEFAULT '[]'::jsonb NOT NULL;