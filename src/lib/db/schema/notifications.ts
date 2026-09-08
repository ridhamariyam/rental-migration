import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  notificationEventEnum,
  notificationLogStatusEnum,
} from "@/lib/db/schema/enums";
import { bookings } from "@/lib/db/schema/bookings";
import { shops } from "@/lib/db/schema/shops";

export type JsonRecord = Record<string, unknown>;

export const whatsappNumbers = pgTable(
  "whatsapp_numbers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    integratedNumber: text("integrated_number").notNull(),
    displayName: text("display_name"),
    wabaId: text("waba_id"),
    metaBusinessId: text("meta_business_id"),
    status: text("status").notNull().default("unknown"),
    rawPayload: jsonb("raw_payload").$type<JsonRecord>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_whatsapp_numbers_shop_number").on(
      table.shopId,
      table.integratedNumber,
    ),
    index("ix_whatsapp_numbers_shop_id").on(table.shopId),
  ],
);

export const whatsappTemplates = pgTable(
  "whatsapp_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    whatsappNumberId: uuid("whatsapp_number_id").references(
      () => whatsappNumbers.id,
      { onDelete: "set null" },
    ),
    integratedNumber: text("integrated_number").notNull(),
    name: text("name").notNull(),
    namespace: text("namespace"),
    language: text("language").notNull().default("en"),
    category: text("category"),
    status: text("status").notNull().default("unknown"),
    body: text("body"),
    components: jsonb("components").$type<JsonRecord>().notNull().default({}),
    variableSlots: jsonb("variable_slots").$type<string[]>().notNull().default([]),
    rawPayload: jsonb("raw_payload").$type<JsonRecord>().notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_whatsapp_templates_shop_template").on(
      table.shopId,
      table.integratedNumber,
      table.name,
      table.language,
    ),
    index("ix_whatsapp_templates_shop_id").on(table.shopId),
    index("ix_whatsapp_templates_number_id").on(table.whatsappNumberId),
  ],
);

export const notificationRules = pgTable(
  "notification_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    event: notificationEventEnum("event").notNull(),
    whatsappNumberId: uuid("whatsapp_number_id").references(
      () => whatsappNumbers.id,
      { onDelete: "set null" },
    ),
    templateId: uuid("template_id").references(() => whatsappTemplates.id, {
      onDelete: "set null",
    }),
    isEnabled: boolean("is_enabled").notNull().default(false),
    scheduleOffsetMinutes: integer("schedule_offset_minutes").notNull().default(0),
    variableMapping: jsonb("variable_mapping")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    repeatLimit: integer("repeat_limit").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_notification_rules_shop_event").on(table.shopId, table.event),
    index("ix_notification_rules_shop_id").on(table.shopId),
  ],
);

export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    //: References the order (not a specific item) — events like
    //: payment/confirmation are order-wide, and per-order dedup keeps one
    //: log per event even for a multi-item order. Item-specific pickup/
    //: return reminders are scheduled once per order too (using whichever
    //: item queues them first); a genuinely different reminder per item
    //: with different dates is a known gap, not attempted here.
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "cascade",
    }),
    recipientPhone: text("recipient_phone").notNull(),
    recipientName: text("recipient_name"),
    event: notificationEventEnum("event").notNull(),
    whatsappNumberId: uuid("whatsapp_number_id").references(
      () => whatsappNumbers.id,
      { onDelete: "set null" },
    ),
    templateId: uuid("template_id").references(() => whatsappTemplates.id, {
      onDelete: "set null",
    }),
    integratedNumber: text("integrated_number").notNull(),
    templateName: text("template_name").notNull(),
    templateNamespace: text("template_namespace"),
    templateLanguage: text("template_language").notNull().default("en"),
    components: jsonb("components").$type<JsonRecord>().notNull().default({}),
    payload: jsonb("payload").$type<JsonRecord>().notNull().default({}),
    status: notificationLogStatusEnum("status").notNull().default("queued"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    providerRequestId: text("provider_request_id"),
    crqid: text("crqid").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_notification_logs_shop_id").on(table.shopId),
    index("ix_notification_logs_status_scheduled").on(
      table.status,
      table.scheduledFor,
    ),
    index("ix_notification_logs_booking_id").on(table.bookingId),
    uniqueIndex("uq_notification_logs_crqid").on(table.crqid),
  ],
);

export type WhatsappNumber = typeof whatsappNumbers.$inferSelect;
export type NewWhatsappNumber = typeof whatsappNumbers.$inferInsert;
export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type NewWhatsappTemplate = typeof whatsappTemplates.$inferInsert;
export type NotificationRule = typeof notificationRules.$inferSelect;
export type NewNotificationRule = typeof notificationRules.$inferInsert;
export type NotificationLog = typeof notificationLogs.$inferSelect;
export type NewNotificationLog = typeof notificationLogs.$inferInsert;
