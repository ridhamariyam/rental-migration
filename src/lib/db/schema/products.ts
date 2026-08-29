import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { categories } from "@/lib/db/schema/categories";
import { shops } from "@/lib/db/schema/shops";

/**
 * The tenant-level catalogue entry (mirrors the legacy backend's `Product`).
 * Physical, barcoded stock lives in `productVariations` — a variation is
 * what actually gets assigned to an outlet, rented, and transferred; this
 * row is just "the thing in the catalogue" (name/category/description/one
 * cover image).
 *
 * Deliberately drops the legacy model's optional, effectively-unused
 * `sku` column — the SKU that actually matters (the one printed on a
 * barcode label and scanned at the counter) lives on `productVariations`,
 * one per physical item; a second, optional "product SKU" here would only
 * invite confusion about which one is authoritative.
 */
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  shopId: uuid("shop_id")
    .notNull()
    .references(() => shops.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id),
  name: text("name").notNull(),
  description: text("description"),
  image: text("image"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
