import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { subscriptionPlanEnum } from "@/lib/db/schema/enums";

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
  //: The shared "Try the demo" account prospects are signed into from the
  //: public site (`POST /api/auth/demo`). At most one shop is the demo at
  //: a time — the super admin picks it from the tenant detail page.
  //: Account-level settings (passwords, profile, business details) are
  //: read-only for a demo shop so one visitor can't lock the next out.
  isDemo: boolean("is_demo").notNull().default(false),
  //: Platform subscription. Both null for tenants created by hand before
  //: billing existed — those never lock. Set on a paid signup/renewal, or
  //: by the super admin for offline/custom deals.
  plan: subscriptionPlanEnum("plan"),
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
