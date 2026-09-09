ALTER TABLE "product_variations" ADD COLUMN "selling_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "buying_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "owner_share_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
-- Added nullable, backfilled, then made NOT NULL: a plain `ADD COLUMN ... NOT
-- NULL` without a default fails on any table that already has rows (23502).
-- `share_amount` is the flat owner share snapshotted at return time, and it
-- replaces the old `share_percentage`; for rows written under the percentage
-- model the amount actually owed is already recorded in `owner_amount`, so
-- that is the faithful backfill.
ALTER TABLE "owner_settlements" ADD COLUMN "share_amount" numeric(12, 2);--> statement-breakpoint
UPDATE "owner_settlements" SET "share_amount" = "owner_amount" WHERE "share_amount" IS NULL;--> statement-breakpoint
ALTER TABLE "owner_settlements" ALTER COLUMN "share_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variations" DROP COLUMN "owner_share_percentage";--> statement-breakpoint
ALTER TABLE "owner_settlements" DROP COLUMN "share_percentage";
