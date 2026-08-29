CREATE TYPE "public"."payment_method" AS ENUM('cash', 'upi', 'card', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('advance', 'balance', 'security_deposit', 'damage_charge', 'refund', 'deposit_release');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"outlet_id" uuid,
	"booking_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"reference_number" text,
	"note" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_payments_shop_id" ON "payments" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "ix_payments_booking_id" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ix_payments_outlet_id" ON "payments" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "ix_payments_created_at" ON "payments" USING btree ("created_at");