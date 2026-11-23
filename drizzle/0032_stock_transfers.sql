CREATE TYPE "public"."transfer_status" AS ENUM('in_transit', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"transfer_number" text NOT NULL,
	"variation_id" uuid NOT NULL,
	"source_variation_id" uuid,
	"from_outlet_id" uuid,
	"to_outlet_id" uuid,
	"quantity" integer NOT NULL,
	"status" "transfer_status" DEFAULT 'in_transit' NOT NULL,
	"notes" text,
	"sent_by_id" uuid,
	"assigned_to_id" uuid,
	"received_by_id" uuid,
	"received_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_variation_id_product_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."product_variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_variation_id_product_variations_id_fk" FOREIGN KEY ("source_variation_id") REFERENCES "public"."product_variations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_outlet_id_outlets_id_fk" FOREIGN KEY ("from_outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_outlet_id_outlets_id_fk" FOREIGN KEY ("to_outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_stock_transfers_shop_id" ON "stock_transfers" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "ix_stock_transfers_variation_id" ON "stock_transfers" USING btree ("variation_id");--> statement-breakpoint
CREATE INDEX "ix_stock_transfers_assigned_to_id" ON "stock_transfers" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "ix_stock_transfers_status" ON "stock_transfers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stock_transfers_shop_number" ON "stock_transfers" USING btree ("shop_id","transfer_number");