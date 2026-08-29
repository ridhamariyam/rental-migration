import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { leaveStatusEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { users } from "@/lib/db/schema/users";

/**
 * A staff leave request (doc §18 — approved leave counts as a payable day
 * in salary calculation), mirroring the legacy backend's `StaffLeave`.
 */
export const staffLeaves = pgTable(
  "staff_leaves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    reason: text("reason").notNull(),
    status: leaveStatusEnum("status").notNull().default("pending"),
    decidedById: uuid("decided_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_staff_leaves_staff_id").on(table.staffId),
    index("ix_staff_leaves_shop_id").on(table.shopId),
  ],
);

export type StaffLeave = typeof staffLeaves.$inferSelect;
export type NewStaffLeave = typeof staffLeaves.$inferInsert;
