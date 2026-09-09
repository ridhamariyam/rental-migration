import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The tenant. Every tenant-owned table will carry this table's id as
 * `shopId` as more schema is added phase by phase — see plan.md.
 */
export const shops = pgTable("shops", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().unique(),
  address: text("address"),
  //: The business's own logo, set by the tenant owner via the tenant-
  //: dashboard "Business Settings" page (admin-only) — uploaded to
  //: the project's Railway bucket, same as a user's `avatarUrl`. Null falls back to the
  //: deterministic gradient/initials avatar wherever the shop's identity
  //: is rendered.
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
