import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { shops } from "@/lib/db/schema/shops";
import { users } from "@/lib/db/schema/users";

/**
 * A shop-managed customer record (mirrors the legacy backend's Customer
 * fields, doc §8) — deliberately its **own** table, not a `users` row with
 * `role = "customer"` the way the legacy schema did it. The legacy model
 * forced every customer through the same non-null `email`/`username`/
 * `password` columns real login-bearing accounts need, even though doc §22
 * is explicit that customers never log in in this scope. A dedicated table
 * needs none of that, and keeps this phase from touching the `users`
 * schema/auth code that Phases 6–9 already shipped and tested.
 *
 * `primaryStaffId` is "the staff member who normally looks after this
 * customer" (their own booking history keeps its own `handledById` once
 * Phase 11 ships, so reassigning this never rewrites the past — see the
 * legacy model's own comment, carried forward).
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    preferredSize: text("preferred_size"),
    notes: text("notes"),
    primaryStaffId: uuid("primary_staff_id").references(() => users.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_customers_shop_phone").on(table.shopId, table.phone),
    // Postgres treats every NULL as distinct in a unique index, so this
    // never blocks two email-less customers — it only guards duplicates
    // when an email is actually given.
    uniqueIndex("uq_customers_shop_email").on(table.shopId, table.email),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
