import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { settlementStatusEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { bookings } from "@/lib/db/schema/bookings";
import { productVariations } from "@/lib/db/schema/product-variations";
import { customers } from "@/lib/db/schema/customers";
import { users } from "@/lib/db/schema/users";

/**
 * Revenue owed to the owner of a customer-owned item for one completed
 * rental (Phase 16, doc §19–21), mirroring the legacy backend's
 * `OwnerSettlement`. Persisted at return time (see
 * `src/server/settlements/service.ts`'s `recordSettlementForBooking`,
 * called from `src/server/bookings/lifecycle.ts`'s `returnBooking`) so the
 * amount owed is an auditable recorded transaction — never recomputed on
 * the fly inside a report, same "settlements are persisted transactions"
 * rule `payments` already follows.
 *
 * `ownerName`/`ownerPhone`/`shareAmount` are **snapshotted** from the
 * variation at the moment of return, not read live from it later — an
 * owner's share or contact details changing next month must never rewrite
 * what was actually owed for a rental that already happened.
 *
 * One booking is exactly one physical item in this schema (see
 * `bookings.ts`'s doc comment), so a unique constraint on `bookingId` alone
 * is enough to make `recordSettlementForBooking` idempotent — no separate
 * `variationId` component needed the way the legacy schema's (theoretically
 * multi-item) booking required.
 */
export const ownerSettlements = pgTable(
  "owner_settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => productVariations.id, { onDelete: "cascade" }),
    ownerName: text("owner_name"),
    ownerPhone: text("owner_phone"),
    ownerCustomerId: uuid("owner_customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    grossRentalAmount: numeric("gross_rental_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    shareAmount: numeric("share_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    ownerAmount: numeric("owner_amount", { precision: 12, scale: 2 }).notNull(),
    shopAmount: numeric("shop_amount", { precision: 12, scale: 2 }).notNull(),
    status: settlementStatusEnum("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidById: uuid("paid_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    paymentReference: text("payment_reference"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_owner_settlements_booking_id").on(table.bookingId),
    index("ix_owner_settlements_shop_id").on(table.shopId),
    index("ix_owner_settlements_status").on(table.status),
  ],
);

export type OwnerSettlement = typeof ownerSettlements.$inferSelect;
export type NewOwnerSettlement = typeof ownerSettlements.$inferInsert;
