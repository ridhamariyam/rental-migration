import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { users } from "@/lib/db/schema/users";

/**
 * Append-only record of sensitive operations (doc's implicit audit
 * requirement; Phase 19), mirroring the legacy backend's `AuditLog`.
 * Written for role/status changes, tenant block/unblock, shop creation,
 * salary changes, settlement payouts, attendance corrections, leave
 * decisions, booking cancellations/discounts, and payments/refunds — see
 * `src/server/audit/service.ts`'s call sites.
 *
 * `shopId`/`userId` are both nullable: a platform-level action (creating
 * or blocking a tenant) has a target `shopId` but no acting `userId` — the
 * super admin isn't a row in `users` at all (see
 * `src/lib/auth/admin-session.ts`'s doc comment on why), so there's
 * nothing to reference there. Everything here is inserted, never updated
 * or deleted — the log itself is the audit trail, so it can't be quietly
 * rewritten later.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary"),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_audit_logs_shop_id").on(table.shopId),
    index("ix_audit_logs_entity").on(table.entityType, table.entityId),
    index("ix_audit_logs_created_at").on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
