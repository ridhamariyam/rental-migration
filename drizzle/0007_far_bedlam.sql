CREATE TYPE "public"."return_condition" AS ENUM('good', 'minor_damage', 'major_damage');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "picked_up_by_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "return_condition" "return_condition";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "damage_notes" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "damage_charge" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_refunded" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cleaning_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "maintenance_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "collected_by_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_picked_up_by_id_users_id_fk" FOREIGN KEY ("picked_up_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_collected_by_id_users_id_fk" FOREIGN KEY ("collected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;