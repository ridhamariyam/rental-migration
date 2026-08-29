import "server-only";

import { and, count, desc, eq, gte, lte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { auditLogs, users, type AuditLog } from "@/lib/db/schema";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import type { AuditLogListQuery } from "@/lib/validation/audit";
import { AuditAction, PLATFORM_ONLY_ACTIONS, type AuditActionValue } from "@/lib/audit-actions";


export { AuditAction, type AuditActionValue };

/** Recursively strips a value down to something `jsonb`-safe — a `Date`
 * becomes its ISO string, `undefined` entries are dropped, everything
 * else (money strings, numbers, booleans, nested objects/arrays) passes
 * through unchanged. Mirrors the legacy `_jsonable` helper; this app
 * never stores money as a `Decimal` object (it's a string end to end), so
 * that specific case doesn't apply here. */
function toJsonable(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonable);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) {
        result[key] = toJsonable(item);
      }
    }
    return result;
  }
  return value;
}

/**
 * Writes one append-only audit row — never permission-checked on its own
 * (the outer action, e.g. `BOOKING_CANCEL`, is already gated). Takes only
 * an `insert`-capable executor (either the plain `db` client or an
 * already-open transaction's `tx`) rather than requiring `PaymentTx`
 * specifically — most of this phase's call sites are single-statement
 * updates with no transaction of their own to join, and forcing one open
 * just to write an audit row would be a bigger, riskier refactor than the
 * audit trail itself calls for. Call sites that *do* already run inside a
 * `db.transaction()` (payments, return/pickup) pass `tx` so the audit row
 * commits atomically with the change it describes.
 */
export async function recordAudit(
  executor: Pick<typeof db, "insert">,
  params: {
    shopId: string | null;
    outletId?: string | null;
    userId?: string | null;
    action: AuditActionValue;
    entityType: string;
    entityId?: string | null;
    summary?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await executor.insert(auditLogs).values({
    shopId: params.shopId,
    outletId: params.outletId ?? null,
    userId: params.userId ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    summary: params.summary ? params.summary.slice(0, 500) : null,
    beforeState:
      params.before !== undefined
        ? (toJsonable(params.before) as Record<string, unknown>)
        : null,
    afterState:
      params.after !== undefined
        ? (toJsonable(params.after) as Record<string, unknown>)
        : null,
  });
}

export type AuditLogItem = AuditLog & {
  userFirstName: string | null;
  userLastName: string | null;
};

export type AuditLogListResult = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** The tenant's own audit trail (doc's implicit "who did what" record,
 * Phase 19) — owner-only via `AUDIT_VIEW`. Includes rows written for the
 * tenant's own creation/block/unblock (the acting "user" for those is the
 * platform super admin, who has no `users` row at all — `userId` is
 * simply `null` on those rows, surfaced client-side as "Platform admin"). */
export async function listAuditLogs(
  actor: TenantSessionUser,
  query: AuditLogListQuery,
): Promise<AuditLogListResult> {
  if (!hasPermission(actor.role, Permission.AUDIT_VIEW)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const conditions = [
    eq(auditLogs.shopId, actor.shopId),
    // Platform-level tenant moderation (created/blocked/unblocked by the
    // super admin) is never part of a tenant's own audit trail — excluded
    // unconditionally so it can't be surfaced even via a crafted `action`
    // filter, not just left out of the UI's dropdown.
    notInArray(auditLogs.action, [...PLATFORM_ONLY_ACTIONS]),
  ];
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
  if (query.userId) conditions.push(eq(auditLogs.userId, query.userId));
  if (query.fromDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(`${query.fromDate}T00:00:00Z`)));
  }
  if (query.toDate) {
    conditions.push(lte(auditLogs.createdAt, new Date(`${query.toDate}T23:59:59.999Z`)));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(auditLogs).where(where),
    db
      .select({
        id: auditLogs.id,
        shopId: auditLogs.shopId,
        outletId: auditLogs.outletId,
        userId: auditLogs.userId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        summary: auditLogs.summary,
        beforeState: auditLogs.beforeState,
        afterState: auditLogs.afterState,
        createdAt: auditLogs.createdAt,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
