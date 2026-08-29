import "server-only";

import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { staffLeaves, users, type StaffLeave } from "@/lib/db/schema";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import type {
  CreateLeaveInput,
  DecideLeaveInput,
  LeaveListQuery,
} from "@/lib/validation/leave";

export type LeaveItem = StaffLeave & {
  staffFirstName: string;
  staffLastName: string;
};

const LEAVE_SELECT = {
  id: staffLeaves.id,
  shopId: staffLeaves.shopId,
  staffId: staffLeaves.staffId,
  fromDate: staffLeaves.fromDate,
  toDate: staffLeaves.toDate,
  reason: staffLeaves.reason,
  status: staffLeaves.status,
  decidedById: staffLeaves.decidedById,
  decidedAt: staffLeaves.decidedAt,
  createdAt: staffLeaves.createdAt,
  updatedAt: staffLeaves.updatedAt,
  staffFirstName: users.firstName,
  staffLastName: users.lastName,
} as const;

function baseLeaveQuery() {
  return db
    .select(LEAVE_SELECT)
    .from(staffLeaves)
    .innerJoin(users, eq(staffLeaves.staffId, users.id));
}

async function requireTenantStaff(shopId: string, staffId: string) {
  const [staff] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.id, staffId),
        eq(users.shopId, shopId),
        inArray(users.role, ["manager", "staff"]),
      ),
    )
    .limit(1);

  if (!staff) {
    throw AppError.notFound("Staff member not found");
  }

  return staff;
}

/**
 * Requests leave — for the caller's own account by omitting `staffId`;
 * recording it on someone else's behalf needs `LEAVE_MANAGE` (mirrors the
 * legacy backend's `StaffLeaveService.create_leave`).
 */
export async function createLeave(
  actor: TenantSessionUser,
  input: CreateLeaveInput,
): Promise<LeaveItem> {
  const targetStaffId = input.staffId || actor.id;

  if (
    targetStaffId !== actor.id &&
    !hasPermission(actor.role, Permission.LEAVE_MANAGE)
  ) {
    throw AppError.forbidden(
      "You do not have permission to request leave for someone else",
    );
  }

  await requireTenantStaff(actor.shopId, targetStaffId);

  const [created] = await db
    .insert(staffLeaves)
    .values({
      shopId: actor.shopId,
      staffId: targetStaffId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      reason: input.reason,
    })
    .returning({ id: staffLeaves.id });

  const [item] = await baseLeaveQuery().where(eq(staffLeaves.id, created.id));
  return item;
}

export type LeaveListResult = {
  items: LeaveItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * A caller without `LEAVE_MANAGE` only ever sees their own requests —
 * `query.staffId` is a narrowing filter for a manager/admin, never a way
 * for a plain staff account to browse someone else's leave.
 */
export async function listLeaves(
  actor: TenantSessionUser,
  query: LeaveListQuery,
): Promise<LeaveListResult> {
  const canManage = hasPermission(actor.role, Permission.LEAVE_MANAGE);
  const conditions = [eq(staffLeaves.shopId, actor.shopId)];

  if (!canManage) {
    conditions.push(eq(staffLeaves.staffId, actor.id));
  } else if (query.staffId) {
    conditions.push(eq(staffLeaves.staffId, query.staffId));
  }

  if (query.status !== "all") {
    conditions.push(eq(staffLeaves.status, query.status));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(staffLeaves).where(where),
    baseLeaveQuery()
      .where(where)
      .orderBy(desc(staffLeaves.createdAt))
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

async function loadLeaveForTenant(
  shopId: string,
  leaveId: string,
): Promise<StaffLeave> {
  const [row] = await db
    .select()
    .from(staffLeaves)
    .where(and(eq(staffLeaves.id, leaveId), eq(staffLeaves.shopId, shopId)))
    .limit(1);

  if (!row) {
    throw AppError.notFound("Leave request not found");
  }

  return row;
}

/** Approves or rejects a pending request — a manager/admin can never
 * decide their own leave (mirrors the legacy backend's self-approval
 * guard exactly). */
export async function decideLeave(
  actor: TenantSessionUser,
  leaveId: string,
  input: DecideLeaveInput,
): Promise<LeaveItem> {
  if (!hasPermission(actor.role, Permission.LEAVE_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const leave = await loadLeaveForTenant(actor.shopId, leaveId);

  if (leave.staffId === actor.id) {
    throw AppError.forbidden("You cannot approve your own leave");
  }

  if (leave.status !== "pending") {
    throw new AppError(`This request has already been ${leave.status}`, 409);
  }

  await db
    .update(staffLeaves)
    .set({
      status: input.status,
      decidedById: actor.id,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(staffLeaves.id, leaveId));

  await recordAudit(db, {
    shopId: actor.shopId,
    userId: actor.id,
    action: AuditAction.LEAVE_DECIDED,
    entityType: "staff_leave",
    entityId: leave.id,
    summary: `Leave request (${leave.fromDate} \u2013 ${leave.toDate}) ${input.status}`,
    before: { status: leave.status },
    after: { status: input.status },
  });

  const [item] = await baseLeaveQuery().where(eq(staffLeaves.id, leaveId));
  return item;
}

/** Withdraws a request — the requester can retract their own *pending*
 * request; a manager/admin can remove any request in their tenant. */
export async function deleteLeave(
  actor: TenantSessionUser,
  leaveId: string,
): Promise<void> {
  const leave = await loadLeaveForTenant(actor.shopId, leaveId);
  const canManage = hasPermission(actor.role, Permission.LEAVE_MANAGE);

  if (leave.staffId !== actor.id && !canManage) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  if (leave.staffId === actor.id && !canManage && leave.status !== "pending") {
    throw new AppError(
      "A decided request can no longer be withdrawn — ask your manager",
      409,
    );
  }

  await db.delete(staffLeaves).where(eq(staffLeaves.id, leaveId));
}
