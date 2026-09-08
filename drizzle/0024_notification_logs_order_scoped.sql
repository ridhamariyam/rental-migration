ALTER TABLE "notification_logs" DROP CONSTRAINT "notification_logs_booking_id_booking_items_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;