CREATE TYPE "public"."ownership_type" AS ENUM('shop_owned', 'customer_owned');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "owner_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"outlet_id" uuid,
	"booking_id" uuid NOT NULL,
	"variation_id" uuid NOT NULL,
	"owner_name" text,
	"owner_phone" text,
	"owner_customer_id" uuid,
	"gross_rental_amount" numeric(12, 2) NOT NULL,
	"share_percentage" numeric(5, 2) NOT NULL,
	"owner_amount" numeric(12, 2) NOT NULL,
	"shop_amount" numeric(12, 2) NOT NULL,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by_id" uuid,
	"payment_reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "ownership_type" "ownership_type" DEFAULT 'shop_owned' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "owner_phone" text;--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "owner_customer_id" uuid;--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "owner_share_percentage" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "owner_notes" text;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_variation_id_product_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."product_variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_owner_customer_id_customers_id_fk" FOREIGN KEY ("owner_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_owner_settlements_booking_id" ON "owner_settlements" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ix_owner_settlements_shop_id" ON "owner_settlements" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "ix_owner_settlements_status" ON "owner_settlements" USING btree ("status");--> statement-breakpoint
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_owner_customer_id_customers_id_fk" FOREIGN KEY ("owner_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;