import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { maintenanceStatusEnum, maintenanceTypeEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { productVariations } from "@/lib/db/schema/product-variations";
import { bookings } from "@/lib/db/schema/bookings";
import { users } from "@/lib/db/schema/users";

/**
 * Cleaning/repair work that gates a returned item back to `available`
 * (doc §16), mirroring the legacy backend's `MaintenanceTask`. `bookingId`
 * is set when a task was opened automatically at return
 * (`returnBooking()` in `src/server/bookings/lifecycle.ts`) and left
 * `null` for one opened by hand against an item found damaged outside a
 * return.
 */
export const maintenanceTasks = pgTable(
  "maintenance_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    // Frozen from the variation's own outlet at task-open time, same
    // reasoning as `bookings.outletId`/`payments.outletId`.
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => productVariations.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    taskType: maintenanceTypeEnum("task_type").notNull(),
    status: maintenanceStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    assignedToId: uuid("assigned_to_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: uuid("completed_by_id").references(() => users.id, {
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
    index("ix_maintenance_tasks_shop_id").on(table.shopId),
    index("ix_maintenance_tasks_variation_id").on(table.variationId),
    index("ix_maintenance_tasks_status").on(table.status),
  ],
);

export type MaintenanceTask = typeof maintenanceTasks.$inferSelect;
export type NewMaintenanceTask = typeof maintenanceTasks.$inferInsert;
