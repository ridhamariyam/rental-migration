import "server-only";

import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { destroyAllSessionsForUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporary-password";
import {
  canAssignRole,
  hasPermission,
  Permission,
} from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import {
  attendances,
  bookings,
  outlets,
  salaryPayslips,
  users,
} from "@/lib/db/schema";
import { requireActiveOutlet } from "@/server/outlets/service";
import { AuditAction, recordAudit } from "@/server/audit/service";
import { resolveOutletScope, type TenantSessionUser } from "@/server/auth/guard";
import type {
  CreateStaffInput,
  StaffListQuery,
  UpdateStaffInput,
} from "@/lib/validation/staff";
import { staffIdParamSchema } from "@/lib/validation/staff";

export type StaffRow = typeof users.$inferSelect;

export type StaffListItem = StaffRow & {
  outletName: string | null;
  outletCode: string | null;
};

export type StaffListResult = {
  items: StaffListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const STAFF_ROLES = ["manager", "staff"] as const;

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Staff/manager reads, always scoped to the caller's own tenant and to the
 * two staff-managed roles (`manager`/`staff`) — never the tenant's own
 * `admin` row or its `customer` rows, which live outside this screen. All
 * filtering happens in the database, same discipline as `listTenants`/
 * `listOutlets`.
 */
export async function listStaff(
  actor: Pick<TenantSessionUser, "shopId" | "role" | "outletId">,
  query: StaffListQuery,
): Promise<StaffListResult> {
  const { page, pageSize, q, role, status } = query;
  // A manager sees their own outlet's roster, not the whole chain's — the
  // client's `?outletId=` is reconciled against what they may actually
  // see rather than trusted (RQ-12).
  const outletId = resolveOutletScope(actor, query.outletId);

  const conditions = [
    eq(users.shopId, actor.shopId),
    inArray(users.role, STAFF_ROLES),
  ];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
        ilike(users.email, pattern),
        ilike(users.phone, pattern),
      )!,
    );
  }

  if (role === "manager" || role === "staff") {
    conditions.push(eq(users.role, role));
  }

  if (status === "active") {
    conditions.push(eq(users.isActive, true));
  } else if (status === "inactive") {
    conditions.push(eq(users.isActive, false));
  }

  if (outletId) {
    conditions.push(eq(users.outletId, outletId));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(users).where(where),
    db
      .select({
        id: users.id,
        shopId: users.shopId,
        outletId: users.outletId,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        passwordHash: users.passwordHash,
        avatarUrl: users.avatarUrl,
        joinedOn: users.joinedOn,
        mustChangePassword: users.mustChangePassword,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        outletName: outlets.name,
        outletCode: outlets.code,
      })
      .from(users)
      .leftJoin(outlets, eq(users.outletId, outlets.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Active staff/manager/admin accounts for the tenant, for admin-only
 * "assigned staff" pickers (e.g. the booking form's "handled by" select,
 * shown only to an `admin` actor) — deliberately not paginated, this is a
 * picker not a list. Includes `admin` too (a solo-owner shop has no
 * separate staff yet, but the owner still wants to assign themselves). */
export async function listActiveStaffForSelect(
  shopId: string,
): Promise<
  { id: string; firstName: string; lastName: string; avatarUrl: string | null }[]
> {
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        eq(users.shopId, shopId),
        inArray(users.role, ["admin", "manager", "staff"]),
        eq(users.isActive, true),
      ),
    )
    .orderBy(users.firstName, users.lastName);
}

/** Active `manager`/`staff` accounts only — for pickers whose target lookup
 * (e.g. salary's `requireTenantStaff`) deliberately excludes the tenant
 * owner's own `admin` row, since an owner doesn't get a salary/attendance
 * record. Using `listActiveStaffForSelect` (which includes `admin`) here
 * would let the owner pick themselves and then hit a 404. */
export async function listPayableStaffForSelect(
  shopId: string,
): Promise<
  { id: string; firstName: string; lastName: string; avatarUrl: string | null }[]
> {
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        eq(users.shopId, shopId),
        inArray(users.role, STAFF_ROLES),
        eq(users.isActive, true),
      ),
    )
    .orderBy(users.firstName, users.lastName);
}

export type StaffStats = {
  total: number;
  active: number;
  inactive: number;
};

export async function getStaffStats(shopId: string): Promise<StaffStats> {
  const [totalRow, activeRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.shopId, shopId), inArray(users.role, STAFF_ROLES))),
    db
      .select({ value: count() })
      .from(users)
      .where(
        and(
          eq(users.shopId, shopId),
          inArray(users.role, STAFF_ROLES),
          eq(users.isActive, true),
        ),
      ),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const active = activeRow[0]?.value ?? 0;

  return { total, active, inactive: total - active };
}

/**
 * Returns `null` for an invalid id, a nonexistent user, a user outside this
 * tenant, or a tenant user who isn't staff-managed (the owner's own `admin`
 * row, or a `customer`) — the caller turns any of these into a 404, same
 * "don't reveal which case it was" reasoning used everywhere else.
 */
export async function getStaffById(
  shopId: string,
  id: string,
): Promise<StaffListItem | null> {
  const parsedId = staffIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const [row] = await db
    .select({
      id: users.id,
      shopId: users.shopId,
      outletId: users.outletId,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      passwordHash: users.passwordHash,
      avatarUrl: users.avatarUrl,
      joinedOn: users.joinedOn,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      outletName: outlets.name,
      outletCode: outlets.code,
    })
    .from(users)
    .leftJoin(outlets, eq(users.outletId, outlets.id))
    .where(
      and(
        eq(users.id, parsedId.data),
        eq(users.shopId, shopId),
        inArray(users.role, STAFF_ROLES),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Creates a staff or manager account under the caller's tenant, with a
 * one-time system-generated temporary password (same provisioning pattern
 * as Phase 5's tenant-admin creation) — the account must reset it on first
 * login (Phase 7 enforces this server-side).
 *
 * `canAssignRole` is the fix for the RBAC bug in plan.md § 3.2: the legacy
 * backend never let an `admin` (tenant owner) create a `manager` account at
 * all, only `staff`/`customer`. Here an owner can assign either.
 */
export async function createStaff(
  actor: TenantSessionUser,
  input: CreateStaffInput,
): Promise<{ staff: StaffRow; temporaryPassword: string }> {
  if (!canAssignRole(actor.role, input.role)) {
    throw AppError.forbidden(
      `You cannot create a user with the '${input.role}' role`,
    );
  }

  await requireActiveOutlet(actor.shopId, input.outletId);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.shopId, actor.shopId),
        eq(sql`lower(${users.email})`, input.email.toLowerCase()),
      ),
    )
    .limit(1);

  if (existing) {
    throw new AppError("A staff member with this email already exists", 409, [
      {
        field: "email",
        message: "A staff member with this email already exists",
      },
    ]);
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const [staff] = await db
      .insert(users)
      .values({
        shopId: actor.shopId,
        outletId: input.outletId,
        role: input.role,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone || null,
        joinedOn: input.joinedOn || null,
        passwordHash,
        mustChangePassword: true,
      })
      .returning();

    await recordAudit(db, {
      shopId: actor.shopId,
      outletId: input.outletId,
      userId: actor.id,
      action: AuditAction.STAFF_CREATED,
      entityType: "user",
      entityId: staff.id,
      summary: `${input.firstName} ${input.lastName} added as ${input.role}`,
      after: { role: staff.role, outletId: staff.outletId, isActive: staff.isActive },
    });

    return { staff, temporaryPassword };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("A staff member with this email already exists", 409, [
        {
          field: "email",
          message: "A staff member with this email already exists",
        },
      ]);
    }
    throw error;
  }
}

export async function updateStaff(
  actor: TenantSessionUser,
  id: string,
  input: UpdateStaffInput,
): Promise<StaffRow> {
  const existing = await getStaffById(actor.shopId, id);
  if (!existing) {
    throw AppError.notFound("Staff member not found");
  }

  if (!canAssignRole(actor.role, input.role)) {
    throw AppError.forbidden(`You cannot assign the '${input.role}' role`);
  }

  await requireActiveOutlet(actor.shopId, input.outletId);

  const [staff] = await db
    .update(users)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
      role: input.role,
      outletId: input.outletId,
      joinedOn: input.joinedOn || null,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, id), eq(users.shopId, actor.shopId)))
    .returning();

  await recordAudit(db, {
    shopId: actor.shopId,
    outletId: staff.outletId,
    userId: actor.id,
    action:
      existing.role !== input.role
        ? AuditAction.STAFF_ROLE_CHANGED
        : AuditAction.STAFF_UPDATED,
    entityType: "user",
    entityId: staff.id,
    summary:
      existing.role !== input.role
        ? `${staff.firstName} ${staff.lastName}'s role changed from ${existing.role} to ${input.role}`
        : `${staff.firstName} ${staff.lastName} updated`,
    before: { role: existing.role, outletId: existing.outletId, phone: existing.phone },
    after: { role: staff.role, outletId: staff.outletId, phone: staff.phone },
  });

  return staff;
}

/**
 * Activating/deactivating a staff account is access-affecting the same way
 * blocking a tenant is — deactivating immediately revokes every session the
 * user currently holds, rather than waiting for their token to expire
 * naturally.
 */
/**
 * Permanently removes a staff account. Owner-only, refused for your own
 * account and for anyone who has left a trail worth keeping — attendance,
 * payslips, or bookings they handled. Deactivating is what "they left"
 * means (it keeps their history and frees their login); this is for an
 * account created by mistake.
 */
export async function deleteStaff(
  actor: TenantSessionUser,
  id: string,
): Promise<void> {
  if (!hasPermission(actor.role, Permission.RECORD_DELETE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }
  if (id === actor.id) {
    throw new AppError("You cannot delete your own account", 400);
  }

  const existing = await getStaffById(actor.shopId, id);
  if (!existing) {
    throw AppError.notFound("Staff member not found");
  }

  const [[attendanceRow], [payslipRow], [handledRow]] = await Promise.all([
    db.select({ value: count() }).from(attendances).where(eq(attendances.staffId, id)),
    db
      .select({ value: count() })
      .from(salaryPayslips)
      .where(eq(salaryPayslips.staffId, id)),
    db.select({ value: count() }).from(bookings).where(eq(bookings.handledById, id)),
  ]);

  const blockers: string[] = [];
  if (attendanceRow.value > 0)
    blockers.push(`${attendanceRow.value} attendance record(s)`);
  if (payslipRow.value > 0) blockers.push(`${payslipRow.value} payslip(s)`);
  if (handledRow.value > 0) blockers.push(`${handledRow.value} booking(s) handled`);

  if (blockers.length > 0) {
    throw new AppError(
      `This account has ${blockers.join(", ")} — deactivate it instead so that history stays readable`,
      409,
    );
  }

  await recordAudit(db, {
    shopId: actor.shopId,
    outletId: existing.outletId,
    userId: actor.id,
    action: AuditAction.STAFF_DELETED,
    entityType: "user",
    entityId: id,
    summary: `Staff account ${existing.firstName} ${existing.lastName} deleted`,
    before: {
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      role: existing.role,
    },
  });

  await db
    .delete(users)
    .where(and(eq(users.id, id), eq(users.shopId, actor.shopId)));
}

export async function setStaffStatus(
  actor: TenantSessionUser,
  id: string,
  isActive: boolean,
): Promise<StaffRow> {
  const existing = await getStaffById(actor.shopId, id);
  if (!existing) {
    throw AppError.notFound("Staff member not found");
  }

  const [staff] = await db
    .update(users)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(users.id, id), eq(users.shopId, actor.shopId)))
    .returning();

  await recordAudit(db, {
    shopId: actor.shopId,
    outletId: staff.outletId,
    userId: actor.id,
    action: AuditAction.STAFF_STATUS_CHANGED,
    entityType: "user",
    entityId: staff.id,
    summary: `${staff.firstName} ${staff.lastName} ${isActive ? "activated" : "deactivated"}`,
    before: { isActive: existing.isActive },
    after: { isActive },
  });

  if (!isActive) {
    await destroyAllSessionsForUser(id);
  }

  return staff;
}

/**
 * Admin-initiated password reset for a staff/manager account — for when
 * someone forgot their password, or an account may have been compromised
 * and the owner wants to rotate its credentials without waiting for the
 * account holder to do it themselves. Scoped through `getStaffById`, so
 * this can only ever target a staff/manager row that both belongs to the
 * caller's own tenant *and* is one of the two staff-managed roles — never
 * another tenant's user, and never the caller's own `admin` row (which
 * isn't reachable through this staff-only lookup at all).
 *
 * Same security posture as account creation: a fresh cryptographically
 * random temporary password, `mustChangePassword` forced back to `true`
 * so the account holder must set their own new one on next login, and
 * (unlike creation) every existing session for the account is invalidated
 * immediately — otherwise a still-open session elsewhere (e.g. the very
 * device this reset is protecting against) would keep working right up
 * until it happened to expire on its own, defeating the point of the
 * reset.
 */
export async function resetStaffPassword(
  actor: TenantSessionUser,
  id: string,
): Promise<{ staff: StaffRow; temporaryPassword: string }> {
  const existing = await getStaffById(actor.shopId, id);
  if (!existing) {
    throw AppError.notFound("Staff member not found");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const [staff] = await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, id), eq(users.shopId, actor.shopId)))
    .returning();

  if (!staff) {
    throw AppError.notFound("Staff member not found");
  }

  await destroyAllSessionsForUser(id);

  await recordAudit(db, {
    shopId: actor.shopId,
    outletId: staff.outletId,
    userId: actor.id,
    action: AuditAction.STAFF_PASSWORD_RESET,
    entityType: "user",
    entityId: staff.id,
    summary: `${staff.firstName} ${staff.lastName}'s password was reset`,
  });

  return { staff, temporaryPassword };
}
