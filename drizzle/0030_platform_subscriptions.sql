CREATE TYPE "public"."subscription_payment_purpose" AS ENUM('signup', 'renewal');--> statement-breakpoint
CREATE TYPE "public"."subscription_payment_status" AS ENUM('created', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('yearly', 'monthly', 'custom');--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"purpose" "subscription_payment_purpose" NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_payment_status" DEFAULT 'created' NOT NULL,
	"plan_fee_paise" integer NOT NULL,
	"setup_fee_paise" integer DEFAULT 0 NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"signup_details" jsonb,
	"owner_password_hash" text,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"note" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "subscription_payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "plan" "subscription_plan";--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "subscription_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscription_payments_shop" ON "subscription_payments" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_payments_status_created" ON "subscription_payments" USING btree ("status","created_at");