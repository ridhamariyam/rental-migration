import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { bookingStatusEnum, returnConditionEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { users } from "@/lib/db/schema/users";
import { products } from "@/lib/db/schema/products";
import { productVariations } from "@/lib/db/schema/product-variations";
import { bookings } from "@/lib/db/schema/bookings";

/**
 * One physical item's rental within an order (`bookings`) — one row per
 * distinct item/dates line, or one row for several identical units of the
 * same item/dates (`quantity`), priced/paid/picked-up/returned together as
 * a batch. An order with several different items (a lehenga plus
 * jewelry for the same event) has one `booking_items` row per item, all
 * sharing one `bookingId` — that's the whole point of the split from the
 * old one-row-per-item-with-a-shared-`bookingGroupId` model: the order
 * itself is unambiguous, and each item's own pickup/return lifecycle
 * still gets to move independently.
 *
 * Money fields freeze the rate/amount at booking time, same discipline as
 * everywhere else in this schema. `rentAmount` is a flat price for the
 * whole hire, not a per-day rate (see `quoteRental`) — `totalDays` still
 * drives availability/reminders/the receipt's date range.
 *
 * `status` reuses `bookingStatusEnum`'s full range (unlike the order's own
 * `status`, which only ever uses `draft`/`confirmed`/`cancelled`) — this is
 * where `pickup_pending`/`rented`/`return_pending`/`overdue`/`returned`
 * actually live, since those are inherently about one physical item's
 * whereabouts, not the whole order's.
 */
export const bookingItems = pgTable(
  "booking_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    // Frozen from the variation's own outlet at booking time.
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => productVariations.id),

    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    totalDays: integer("total_days").notNull(),
    //: How many identical physical units of this item/dates this one line
    //: represents — see the table doc comment.
    quantity: integer("quantity").notNull().default(1),

    rentAmount: numeric("rent_amount", { precision: 12, scale: 2 }).notNull(),
    //: `rentAmount * quantity` — this item's own contribution to the
    //: order's `totalAmount`, before the order's shared discount/
    //: additional cost are applied.
    grossRent: numeric("gross_rent", { precision: 12, scale: 2 }).notNull(),

    status: bookingStatusEnum("status").notNull().default("draft"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),

    // Pickup ------------------------------------------------------------
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    pickedUpById: uuid("picked_up_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Return / damage / deposit -----------------------------------------
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnCondition: returnConditionEnum("return_condition"),
    damageNotes: text("damage_notes"),
    //: Added to this item's share of the order's payable amount when
    //: computing what's actually owed — see `computePaymentSummary`.
    damageCharge: numeric("damage_charge", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    //: What was actually handed back to the customer for this item's own
    //: share of the deposit at return — a display snapshot.
    depositRefunded: numeric("deposit_refunded", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    cleaningRequired: boolean("cleaning_required").notNull().default(false),
    maintenanceRequired: boolean("maintenance_required")
      .notNull()
      .default(false),
    //: Staff who inspected/collected the item at return.
    collectedById: uuid("collected_by_id").references(() => users.id, {
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
    index("ix_booking_items_booking_id").on(table.bookingId),
    index("ix_booking_items_shop_id").on(table.shopId),
    index("ix_booking_items_variation_id").on(table.variationId),
    index("ix_booking_items_status").on(table.status),
    index("ix_booking_items_dates").on(table.fromDate, table.toDate),
  ],
);

export type BookingItem = typeof bookingItems.$inferSelect;
export type NewBookingItem = typeof bookingItems.$inferInsert;
