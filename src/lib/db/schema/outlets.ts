import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { shops } from "@/lib/db/schema/shops";

/**
 * A physical branch belonging to one tenant (`shops`). Mirrors the legacy
 * backend's `Outlet` model (`backend/app/models/outlet.py`), with one
 * deliberate change: there is no `manager_id` column here. The old model
 * pointed from outlet → manager; this schema instead lets `users.outletId`
 * (a manager-role user assigned to this outlet) be the single source of
 * truth for "who manages this outlet" — avoiding a circular foreign key
 * between `outlets` and `users` (each would need to reference the other)
 * for a fact that's already derivable from the staff-assignment side.
 *
 * `latitude`/`longitude`/`allowedRadiusMetres` are stored now but not
 * enforced anywhere yet — geofenced attendance check-in is Phase 15 (see
 * plan.md § Phase 8 "Out of scope").
 */
export const outlets = pgTable(
  "outlets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    address: text("address"),
    phone: text("phone"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    allowedRadiusMetres: integer("allowed_radius_metres")
      .notNull()
      .default(150),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // An outlet's short code only needs to be unique within its own tenant
    // (two different shops can both have a "MAIN" outlet).
    uniqueIndex("uq_outlets_shop_code").on(table.shopId, table.code),
  ],
);

export type Outlet = typeof outlets.$inferSelect;
export type NewOutlet = typeof outlets.$inferInsert;
