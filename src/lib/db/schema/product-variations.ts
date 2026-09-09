import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { ownershipTypeEnum, productStatusEnum } from "@/lib/db/schema/enums";
import { outlets } from "@/lib/db/schema/outlets";
import { products } from "@/lib/db/schema/products";
import { customers } from "@/lib/db/schema/customers";

/**
 * A physically barcoded rental item (mirrors the legacy backend's
 * `ProductVariation`). `status` is the lifecycle state; it is *not* on its
 * own an availability check — rentability is `status === "available"`
 * *and* no overlapping booking for the requested dates, which is Phase
 * 11's `AvailabilityService` concern, not this table's.
 *
 * `sku`/`barcode` are unique **globally**, not per tenant — carried
 * forward from the legacy schema deliberately: a barcode is a physical
 * label printed once and scanned at the counter, the same real-world-object
 * uniqueness a UPC/EAN code has, not a per-tenant login-style identifier.
 *
 * Revenue-share/ownership fields (Phase 16, doc §19–21) — `ownerCustomerId`
 * links to `customers`, deliberately **not** the legacy model's
 * `owner_user_id` (a `users` row): this schema keeps customers in their own
 * table with no login at all (see `customers.ts`'s doc comment), so a
 * customer-owned item's owner is a customer record, not a system account.
 * `ownerName`/`ownerPhone` stay free text regardless — a customer-owned
 * item's owner doesn't have to already exist as a `Customer` row (e.g. a
 * relative who isn't otherwise a client of the shop).
 */
export const productVariations = pgTable("product_variations", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  outletId: uuid("outlet_id").references(() => outlets.id, {
    onDelete: "set null",
  }),
  color: text("color"),
  size: text("size"),
  rentPrice: numeric("rent_price", { precision: 12, scale: 2 }).notNull(),
  //: What the shop can sell this exact item for, if it ever stops renting
  //: it out — distinct from `rentPrice`, both visible to any
  //: `PRODUCT_MANAGE` role (unlike `buyingPrice`, below).
  sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }),
  //: What the shop paid for this item — sensitive cost data, gated behind
  //: `Permission.PRODUCT_COST_VIEW` (owner-only) everywhere it's read or
  //: written, never exposed to a `manager`/`staff` actor.
  buyingPrice: numeric("buying_price", { precision: 12, scale: 2 }),
  //: No longer collected per item — a booking's own deposit (see
  //: `bookings.security_deposit`) is entered fresh at booking time
  //: instead. Column kept (default `0`) only so existing rows and
  //: `src/server/bookings/pricing.ts`'s deposit fallback keep working.
  securityDeposit: numeric("security_deposit", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  quantity: integer("quantity").notNull().default(1),
  sku: text("sku").notNull().unique(),
  barcode: text("barcode").notNull().unique(),
  //: The photo of *this* physical copy — the image now lives here rather
  //: than on the catalogue row, because two copies of the same product can
  //: differ in the ways a renter actually cares about (colour, wear), and
  //: one shared catalogue photo can't show that. `products.image` is kept
  //: for rows created before the move and is still rendered as a fallback.
  image: text("image"),
  gallery: jsonb("gallery").$type<string[]>().notNull().default([]),
  //: The owner's manual "listed for rental" switch — distinct from
  //: `status` (the lifecycle). See the table-level doc comment.
  isAvailable: boolean("is_available").notNull().default(true),
  status: productStatusEnum("status").notNull().default("available"),

  // Revenue share (Phase 16, doc §19–21) -----------------------------
  ownershipType: ownershipTypeEnum("ownership_type")
    .notNull()
    .default("shop_owned"),
  ownerName: text("owner_name"),
  ownerPhone: text("owner_phone"),
  ownerCustomerId: uuid("owner_customer_id").references(() => customers.id, {
    onDelete: "set null",
  }),
  //: Fixed amount (not a percentage) that goes to the owner rather than
  //: the shop for each rental of this item — see
  //: `src/server/settlements/service.ts`.
  ownerShareAmount: numeric("owner_share_amount", {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default("0"),
  ownerNotes: text("owner_notes"),


  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProductVariation = typeof productVariations.$inferSelect;
export type NewProductVariation = typeof productVariations.$inferInsert;
