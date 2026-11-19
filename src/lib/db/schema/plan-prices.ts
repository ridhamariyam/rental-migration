import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The live price of each self-serve platform plan, editable by the super
 * admin. One row per plan id ("yearly" / "monthly"); a missing row means
 * the default from `src/lib/plans.ts` applies. Prices are whole rupees.
 *
 * Changing a price only affects checkouts started afterwards — every
 * `subscription_payments` row stores the exact amount it charged, so a
 * tenant's payment history never moves when prices do. Each change is
 * also written to the audit log (`platform.plan_prices_changed`).
 */
export const planPrices = pgTable("plan_prices", {
  plan: text("plan").primaryKey(),
  price: integer("price").notNull(),
  setupFee: integer("setup_fee").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PlanPriceRow = typeof planPrices.$inferSelect;
