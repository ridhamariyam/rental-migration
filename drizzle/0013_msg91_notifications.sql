CREATE TYPE "public"."notification_event" AS ENUM('booking_created', 'booking_confirmed', 'payment_received', 'pickup_reminder', 'pickup_today', 'pickup_confirmed', 'return_reminder', 'return_due_today', 'overdue_reminder', 'booking_returned', 'booking_cancelled', 'staff_welcome');--> statement-breakpoint
CREATE TYPE "public"."notification_log_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "whatsapp_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"integrated_number" text NOT NULL,
	"display_name" text,
	"waba_id" text,
	"meta_business_id" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"whatsapp_number_id" uuid,
	"integrated_number" text NOT NULL,
	"name" text NOT NULL,
	"namespace" text,
	"language" text DEFAULT 'en' NOT NULL,
	"category" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"body" text,
	"components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variable_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"event" "notification_event" NOT NULL,
	"whatsapp_number_id" uuid,
	"template_id" uuid,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"schedule_offset_minutes" integer DEFAULT 0 NOT NULL,
	"variable_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"repeat_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"booking_id" uuid,
	"recipient_phone" text NOT NULL,
	"recipient_name" text,
	"event" "notification_event" NOT NULL,
	"whatsapp_number_id" uuid,
	"template_id" uuid,
	"integrated_number" text NOT NULL,
	"template_name" text NOT NULL,
	"template_namespace" text,
	"template_language" text DEFAULT 'en' NOT NULL,
	"components" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_log_status" DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"provider_request_id" text,
	"crqid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_numbers" ADD CONSTRAINT "whatsapp_numbers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_whatsapp_number_id_whatsapp_numbers_id_fk" FOREIGN KEY ("whatsapp_number_id") REFERENCES "public"."whatsapp_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_whatsapp_numbers_shop_number" ON "whatsapp_numbers" USING btree ("shop_id","integrated_number");--> statement-breakpoint
CREATE INDEX "ix_whatsapp_numbers_shop_id" ON "whatsapp_numbers" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_whatsapp_templates_shop_template" ON "whatsapp_templates" USING btree ("shop_id","integrated_number","name","language");--> statement-breakpoint
CREATE INDEX "ix_whatsapp_templates_shop_id" ON "whatsapp_templates" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "ix_whatsapp_templates_number_id" ON "whatsapp_templates" USING btree ("whatsapp_number_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_rules_shop_event" ON "notification_rules" USING btree ("shop_id","event");--> statement-breakpoint
CREATE INDEX "ix_notification_rules_shop_id" ON "notification_rules" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "ix_notification_logs_shop_id" ON "notification_logs" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "ix_notification_logs_status_scheduled" ON "notification_logs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "ix_notification_logs_booking_id" ON "notification_logs" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_logs_crqid" ON "notification_logs" USING btree ("crqid");
