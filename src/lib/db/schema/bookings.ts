import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  bookingStatusEnum,
  paymentStatusEnum,
  returnConditionEnum,
} from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { users } from "@/lib/db/schema/users";
import { customers } from "@/lib/db/schema/customers";
import { products } from "@/lib/db/schema/products";
import { productVariations } from "@/lib/db/schema/product-variations";

/**
 * A rental of one physical item over a date range (mirrors the legacy
 * backend's `Booking`). Money fields freeze the *rate* (`rentAmount`) and
 * computed totals at booking time — never recomputed from the variation's
 * current price later, so editing a product's price tomorrow never
 * rewrites yesterday's booking.
 *
 * `rentAmount` is a **flat price per unit for the whole rental**, not a
 * per-day rate: the shop quotes one price for the hire regardless of how
 * many days the item is out (see `quoteRental`). `totalDays` is still
 * stored — it drives availability, reminders and the receipt's date
 * range — it just no longer multiplies the price.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingNumber: text("booking_number").notNull().unique(),
    // Set to the same value for every *distinct item* line created
    // together in one "customer rents several different items"
    // submission (see `createBookingGroup`) — e.g. a dress plus jewelry
    // for the same event. It does **not** multiply for a repeat quantity
    // of the *same* item/dates/discount; that's `quantity` below, kept as
    // a single row so one order line is one booking, one receipt, one
    // pickup/return event.
    bookingGroupId: uuid("booking_group_id").defaultRandom().notNull(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    // Frozen from the variation's own outlet at booking time — see
    // `product-variations.ts`'s doc comment on why a booking's outlet is
    // never a separately-chosen field.
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => productVariations.id),

    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    totalDays: integer("total_days").notNull(),
    //: How many identical physical units of this same item/dates this one
    //: booking represents (e.g. 2 identical necklaces for the same
    //: wedding) — priced, paid, picked up and returned together as a
    //: single batch. Availability math sums this across every overlapping
    //: booking rather than counting rows (see `availability.ts`).
    quantity: integer("quantity").notNull().default(1),

    // Money -----------------------------------------------------------
    rentAmount: numeric("rent_amount", { precision: 12, scale: 2 }).notNull(),
    grossRent: numeric("gross_rent", { precision: 12, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    securityDeposit: numeric("security_deposit", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    //: A one-off charge agreed at the counter on top of the rent —
    //: alteration, delivery, late-return fee, anything the shop bills for
    //: that isn't the item's own price. Folded into `totalAmount` (it is
    //: payable, so the payment ledger has to see it) but kept as its own
    //: column so a receipt can show *what* was charged, and so a
    //: customer-owned item's owner is never paid a share of it (see
    //: `settleBookingRevenue` in `bookings/lifecycle.ts`).
    additionalCost: numeric("additional_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    //: Why that charge was added — required whenever `additionalCost` is
    //: above zero (`bookingItemSchema`), so an unexplained amount can
    //: never appear on a customer's bill.
    additionalCostReason: text("additional_cost_reason"),
    //: Paperwork attached at booking time — an ID proof, a signed rental
    //: agreement, a photo of the item at handover. Uploaded first (see
    //: `POST /api/uploads/document`), so only the resulting URL/label
    //: pairs are stored here. Order-level: every line created in one
    //: submission carries the same list, exactly like `notes`.
    documents: jsonb("documents")
      .$type<{ url: string; name: string }[]>()
      .notNull()
      .default([]),
    //: Rent payable after discount **plus** `additionalCost`, deposit
    //: excluded. Damage charges (Phase 13) are tracked separately in
    //: `damageCharge`, never folded back into this frozen figure.
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),

    status: bookingStatusEnum("status").notNull().default("draft"),

    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    notes: text("notes"),

    // Pickup (Phase 13) ------------------------------------------------
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    pickedUpById: uuid("picked_up_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Return / damage / deposit (Phase 13) -----------------------------
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnCondition: returnConditionEnum("return_condition"),
    damageNotes: text("damage_notes"),
    //: Added to `totalAmount` (never rewriting it) when computing what's
    //: actually payable — see `computePaymentSummary`'s `rentPayable`.
    damageCharge: numeric("damage_charge", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    //: What was actually handed back to the customer at return — a
    //: snapshot for display, even though it's also derivable from the
    //: `payments` ledger's `deposit_release` rows.
    depositRefunded: numeric("deposit_refunded", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    cleaningRequired: boolean("cleaning_required").notNull().default(false),
    maintenanceRequired: boolean("maintenance_required")
      .notNull()
      .default(false),
    //: Staff who inspected/collected the item at return — frozen at return
    //: time, same reasoning as `handledById`.
    collectedById: uuid("collected_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // People ------------------------------------------------------------
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    //: Staff responsible for the booking, frozen at creation so history
    //: survives later staff reassignment (same rule as `customers
    //: .primaryStaffId`).
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
    index("ix_bookings_variation_id").on(table.variationId),
    index("ix_bookings_status").on(table.status),
    index("ix_bookings_dates").on(table.fromDate, table.toDate),
    index("ix_bookings_group_id").on(table.bookingGroupId),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
