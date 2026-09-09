import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { bookingStatusEnum, paymentStatusEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { users } from "@/lib/db/schema/users";
import { customers } from "@/lib/db/schema/customers";

/**
 * One customer ORDER — one id, one booking number, one payment ledger,
 * one status. Renting several different items (or several units of the
 * same item) in one visit is still a single row here; the per-item stuff
 * (which product/variation, which dates, quantity, pickup/return
 * lifecycle) lives on `booking_items` instead (see `booking-items.ts`).
 *
 * This used to be one row *per line item*, linked into an order by a
 * `bookingGroupId` column — that made "one order" look like several
 * separate bookings sharing an id, which is exactly the confusion this
 * split exists to remove. `status` here is deliberately only ever
 * `draft`/`confirmed`/`cancelled` (reusing `bookingStatusEnum`, which
 * still has to carry the full pickup/return range for `booking_items
 * .status`) — the physical pickup/return/overdue lifecycle is inherently
 * per-item (one lehenga can come back before another), so it isn't
 * something a whole order can meaningfully be "in".
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingNumber: text("booking_number").notNull().unique(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),

    // Money — order-level, shared across every item -------------------
    //: Frozen at creation, never editable afterwards (agreed with the
    //: customer once, for the whole order).
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    //: Refundable deposit held for the *whole* order. Either the sum of
    //: every item's own default deposit (the common case —
    //: `securityDepositOverridden` false) or one flat number the counter
    //: agreed instead (true) that replaces that sum entirely.
    securityDeposit: numeric("security_deposit", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    securityDepositOverridden: boolean("security_deposit_overridden")
      .notNull()
      .default(false),
    //: A one-off charge on top of the rent — alteration, delivery, a
    //: late-return fee — editable after creation (e.g. agreed later),
    //: unlike the discount.
    additionalCost: numeric("additional_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    additionalCostReason: text("additional_cost_reason"),
    //: Maintained running total = sum of every non-cancelled item's
    //: `grossRent`, minus `discountAmount`, plus `additionalCost` —
    //: recomputed and rewritten (never derived on the fly) whenever an
    //: item is added/edited/cancelled or `additionalCost` changes, same
    //: "frozen, not recomputed at read time" discipline as everywhere
    //: else money is stored in this schema.
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),

    status: bookingStatusEnum("status").notNull().default("draft"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),

    notes: text("notes"),
    //: Paperwork attached at booking time — shared across every item.
    documents: jsonb("documents")
      .$type<{ url: string; name: string }[]>()
      .notNull()
      .default([]),

    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    //: Staff responsible for the order, frozen at creation so history
    //: survives later staff reassignment.
    handledById: uuid("handled_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_bookings_shop_id").on(table.shopId),
    index("ix_bookings_customer_id").on(table.customerId),
    index("ix_bookings_status").on(table.status),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

