import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { transferStatusEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { productVariations } from "@/lib/db/schema/product-variations";
import { users } from "@/lib/db/schema/users";

/**
 * Moving physical stock from one outlet to another.
 *
 * `variationId` is the item that travels: for a whole-item move it is the
 * original item itself; for a part-quantity move it is a new item split off
 * the original at send time (`sourceVariationId`), with its own barcode.
 * While `in_transit` that item is `in_transfer` (unbookable) and still
 * belongs to `fromOutletId`; when the assigned receiver confirms, it moves
 * to `toOutletId` and becomes `available` there.
 */
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    transferNumber: text("transfer_number").notNull(),
    variationId: uuid("variation_id")
      .notNull()
      .references(() => productVariations.id, { onDelete: "cascade" }),
    sourceVariationId: uuid("source_variation_id").references(
      () => productVariations.id,
      { onDelete: "set null" },
    ),
    fromOutletId: uuid("from_outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    toOutletId: uuid("to_outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull(),
    status: transferStatusEnum("status").notNull().default("in_transit"),
    notes: text("notes"),
    sentById: uuid("sent_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedToId: uuid("assigned_to_id").references(() => users.id, {
      onDelete: "set null",
    }),
    receivedById: uuid("received_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_stock_transfers_shop_id").on(table.shopId),
    index("ix_stock_transfers_variation_id").on(table.variationId),
    index("ix_stock_transfers_assigned_to_id").on(table.assignedToId),
    index("ix_stock_transfers_status").on(table.status),
    uniqueIndex("uq_stock_transfers_shop_number").on(
      table.shopId,
      table.transferNumber,
    ),
  ],
);

export type StockTransfer = typeof stockTransfers.$inferSelect;
