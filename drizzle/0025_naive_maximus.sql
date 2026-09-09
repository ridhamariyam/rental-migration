ALTER TYPE "public"."notification_event" ADD VALUE 'feedback_request';--> statement-breakpoint
ALTER TABLE "notification_logs" ADD COLUMN "booking_item_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_notification_logs_booking_item_id" ON "notification_logs" USING btree ("booking_item_id");