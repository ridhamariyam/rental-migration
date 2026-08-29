import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { paymentMethodEnum, paymentTypeEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { bookings } from "@/lib/db/schema/bookings";
import { users } from "@/lib/db/schema/users";

/**
 * One immutable money movement against a booking (mirrors the legacy
 * backend's `Payment`). A booking's financial position — collected/
 * outstanding/`paymentStatus` — is always *derived* by summing these rows
 * (`src/server/payments/service.ts`'s `computePaymentSummary`), never
 * stored as a single mutable field; rows here are inserted, never updated
 * or deleted, so the ledger itself is the audit trail.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    // Frozen from the booking's own outlet at payment time, same reasoning
    // as `bookings.outletId` itself.
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentType: paymentTypeEnum("payment_type").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    referenceNumber: text("reference_number"),
    note: text("note"),
    recordedById: uuid("recorded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_payments_shop_id").on(table.shopId),
    index("ix_payments_booking_id").on(table.bookingId),
    index("ix_payments_outlet_id").on(table.outletId),
    index("ix_payments_created_at").on(table.createdAt),
    // Defense in depth alongside the app-level `positiveMoneySchema` check
    // — a payment amount is never zero/negative even if some future code
    // path forgets to validate it.
    check("ck_payments_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
