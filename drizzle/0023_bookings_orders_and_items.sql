CREATE TABLE "booking_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"outlet_id" uuid,
	"product_id" uuid NOT NULL,
	"variation_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"total_days" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"rent_amount" numeric(12, 2) NOT NULL,
	"gross_rent" numeric(12, 2) NOT NULL,
	"status" "booking_status" DEFAULT 'draft' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"picked_up_at" timestamp with time zone,
	"picked_up_by_id" uuid,
	"returned_at" timestamp with time zone,
	"return_condition" "return_condition",
	"damage_notes" text,
	"damage_charge" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deposit_refunded" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cleaning_required" boolean DEFAULT false NOT NULL,
	"maintenance_required" boolean DEFAULT false NOT NULL,
	"collected_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Copy every existing bookings row's item-level data into booking_items,
-- preserving the original id — notification_logs/maintenance_tasks/
-- owner_settlements already reference these exact ids, so once their FK
-- is retargeted below they keep working with zero remapping. booking_id
-- temporarily holds the old booking_group_id (not yet a valid bookings.id)
-- — fixed up below, before the real FK constraint is added.
INSERT INTO "booking_items" (
  "id", "booking_id", "shop_id", "outlet_id", "product_id", "variation_id",
  "from_date", "to_date", "total_days", "quantity", "rent_amount", "gross_rent",
  "status", "cancelled_at", "cancellation_reason", "picked_up_at", "picked_up_by_id",
  "returned_at", "return_condition", "damage_notes", "damage_charge", "deposit_refunded",
  "cleaning_required", "maintenance_required", "collected_by_id", "created_at", "updated_at"
)
SELECT
  "id", "booking_group_id", "shop_id", "outlet_id", "product_id", "variation_id",
  "from_date", "to_date", "total_days", "quantity", "rent_amount", "gross_rent",
  "status", "cancelled_at", "cancellation_reason", "picked_up_at", "picked_up_by_id",
  "returned_at", "return_condition", "damage_notes", "damage_charge", "deposit_refunded",
  "cleaning_required", "maintenance_required", "collected_by_id", "created_at", "updated_at"
FROM "bookings";
--> statement-breakpoint

-- Unlink these three from the old per-line bookings rows *before* any of
-- those rows are deleted below, so the delete can't cascade/null them out
-- — they get repointed at booking_items (same row ids) further down.
ALTER TABLE "maintenance_tasks" DROP CONSTRAINT "maintenance_tasks_booking_id_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "owner_settlements" DROP CONSTRAINT "owner_settlements_booking_id_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_logs" DROP CONSTRAINT "notification_logs_booking_id_bookings_id_fk";
--> statement-breakpoint

-- One surviving row per booking_group_id (earliest created) becomes the
-- new order row.
CREATE TEMP TABLE "_survivors" AS
SELECT DISTINCT ON ("booking_group_id") "id" AS "survivor_id", "booking_group_id"
FROM "bookings"
ORDER BY "booking_group_id", "created_at" ASC, "id" ASC;
--> statement-breakpoint

-- Repoint every booking_items row at its group's survivor (was the raw
-- booking_group_id above, which isn't a real bookings.id).
UPDATE "booking_items" AS bi
SET "booking_id" = s."survivor_id"
FROM "_survivors" AS s
WHERE bi."booking_id" = s."booking_group_id";
--> statement-breakpoint

-- Consolidate every payment onto the survivor, regardless of which
-- original line item it was recorded against — this is what makes the
-- ledger genuinely one-per-order instead of split across several rows.
UPDATE "payments" AS p
SET "booking_id" = s."survivor_id"
FROM "bookings" AS b
JOIN "_survivors" AS s ON s."booking_group_id" = b."booking_group_id"
WHERE p."booking_id" = b."id";
--> statement-breakpoint

-- Drop every non-surviving original row — its data is fully preserved in
-- booking_items, and any payments/maintenance/notification/settlement
-- references were already moved off it above.
DELETE FROM "bookings" WHERE "id" NOT IN (SELECT "survivor_id" FROM "_survivors");
--> statement-breakpoint

-- Recompute the survivor's running total from its (possibly several)
-- items, and best-effort re-derive payment_status/status for legacy rows
-- — going forward the app always recomputes these correctly on every
-- payment/lifecycle action; this is only a one-time approximation for
-- whatever already existed before this migration.
UPDATE "bookings" AS b
SET "total_amount" = COALESCE(
  (SELECT SUM(bi."gross_rent") FROM "booking_items" AS bi WHERE bi."booking_id" = b."id" AND bi."status" != 'cancelled'),
  0
) - b."discount_amount" + b."additional_cost";
--> statement-breakpoint

UPDATE "bookings" AS b
SET "payment_status" = (CASE
  WHEN COALESCE(collected."amt", 0) - COALESCE(returned."amt", 0) >= (b."total_amount" + b."security_deposit") THEN 'paid'
  WHEN COALESCE(collected."amt", 0) > 0 THEN 'partial'
  ELSE 'unpaid'
END)::payment_status
FROM (
  SELECT "booking_id", SUM("amount") AS "amt" FROM "payments"
  WHERE "payment_type" IN ('advance', 'balance', 'security_deposit') GROUP BY "booking_id"
) AS collected
LEFT JOIN (
  SELECT "booking_id", SUM("amount") AS "amt" FROM "payments"
  WHERE "payment_type" IN ('refund', 'deposit_release') GROUP BY "booking_id"
) AS returned ON returned."booking_id" = collected."booking_id"
WHERE b."id" = collected."booking_id";
--> statement-breakpoint

UPDATE "bookings" AS b
SET "status" = (CASE
  WHEN b."status" = 'draft' THEN 'draft'
  WHEN b."status" = 'cancelled' AND NOT EXISTS (
    SELECT 1 FROM "booking_items" AS bi WHERE bi."booking_id" = b."id" AND bi."status" != 'cancelled'
  ) THEN 'cancelled'
  ELSE 'confirmed'
END)::booking_status;
--> statement-breakpoint

DROP TABLE "_survivors";
--> statement-breakpoint

-- Everything else below is a straightforward schema reshape: drop the old
-- per-line FKs/indexes/columns from bookings, add the new order-only
-- column, and wire up booking_items' own FKs/indexes.
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_outlet_id_outlets_id_fk";
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_variation_id_product_variations_id_fk";
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_picked_up_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_collected_by_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "ix_bookings_variation_id";--> statement-breakpoint
DROP INDEX "ix_bookings_dates";--> statement-breakpoint
DROP INDEX "ix_bookings_group_id";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "total_amount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "security_deposit_overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_variation_id_product_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."product_variations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_picked_up_by_id_users_id_fk" FOREIGN KEY ("picked_up_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_collected_by_id_users_id_fk" FOREIGN KEY ("collected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_booking_items_booking_id" ON "booking_items" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "ix_booking_items_shop_id" ON "booking_items" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "ix_booking_items_variation_id" ON "booking_items" USING btree ("variation_id");--> statement-breakpoint
CREATE INDEX "ix_booking_items_status" ON "booking_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_booking_items_dates" ON "booking_items" USING btree ("from_date","to_date");--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_booking_id_booking_items_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_booking_id_booking_items_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_booking_id_booking_items_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "booking_group_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "outlet_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "variation_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "from_date";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "to_date";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "total_days";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "quantity";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "rent_amount";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "gross_rent";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "picked_up_at";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "picked_up_by_id";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "returned_at";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "return_condition";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "damage_notes";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "damage_charge";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "deposit_refunded";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "cleaning_required";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "maintenance_required";--> statement-breakpoint
ALTER TABLE "bookings" DROP COLUMN "collected_by_id";