ALTER TABLE "product_variations" ADD COLUMN "selling_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "buying_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variations" ADD COLUMN "owner_share_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_settlements" ADD COLUMN "share_amount" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variations" DROP COLUMN "owner_share_percentage";--> statement-breakpoint
ALTER TABLE "owner_settlements" DROP COLUMN "share_percentage";