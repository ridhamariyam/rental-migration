import "server-only";

import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { destroySessionsForShop } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporary-password";
import { AppError } from "@/lib/errors/app-error";
import { shops, users } from "@/lib/db/schema";
import { AuditAction, recordAudit } from "@/server/audit/service";
import {
  tenantIdParamSchema,
  type CreateTenantInput,
  type TenantListQuery,
} from "@/lib/validation/tenants";

export type TenantListItem = typeof shops.$inferSelect;

export type TenantListResult = {
  items: TenantListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Tenant (shop) reads for the platform admin surface. Only reads —
 * creation/mutation land in Phase 4/5. All filtering happens in the
 * database (not fetched-then-filtered in memory), so this scales the same
 * way whether there are 3 tenants or 3,000.
 */
export async function listTenants(
  query: TenantListQuery,
): Promise<TenantListResult> {
  const { page, pageSize, q, status } = query;

  const conditions = [];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(shops.name, pattern),
        ilike(shops.email, pattern),
        ilike(shops.phone, pattern),
      ),
    );
  }

  if (status === "active") {
    conditions.push(eq(shops.isActive, true));
  } else if (status === "blocked") {
    conditions.push(eq(shops.isActive, false));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow, items] = await Promise.all([
    db.select({ value: count() }).from(shops).where(where),
    db
      .select()
      .from(shops)
      .where(where)
      .orderBy(desc(shops.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Not part of the paginated/filtered list — a lightweight, always-whole-
 * dataset count so the summary tiles above the table don't shift as the
 * user searches or filters.
 */
export type TenantStats = {
  total: number;
  active: number;
  blocked: number;
};

export async function getTenantStats(): Promise<TenantStats> {
  const [totalRow, activeRow] = await Promise.all([
    db.select({ value: count() }).from(shops),
    db.select({ value: count() }).from(shops).where(eq(shops.isActive, true)),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const active = activeRow[0]?.value ?? 0;

  return { total, active, blocked: total - active };
}

/**
 * Returns `null` for both "not a valid id" and "no such tenant" — the
 * caller (page/route) turns either into a 404, never revealing which case
 * it was, same reasoning the old backend used for tenant isolation.
 */
export async function getTenantById(
  id: string,
): Promise<TenantListItem | null> {
  const parsedId = tenantIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const [tenant] = await db
    .select()
    .from(shops)
    .where(eq(shops.id, parsedId.data))
    .limit(1);

  return tenant ?? null;
}

/** True when a driver error is a Postgres unique-constraint violation
 * (`23505`), optionally naming which constraint tripped it. */
function isUniqueViolation(
  error: unknown,
): error is { code: string; constraint_name?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Creates a tenant (shop) *and* provisions its first admin user in the same
 * DB transaction (Phase 5) — a shop row with no admin user should never be
 * able to exist, so if the user insert fails, the shop insert rolls back
 * with it. Checks for an existing shop email/phone up front so the common
 * case returns a clean field error instead of a driver exception, but the
 * actual uniqueness guarantee is the database's `unique` constraint (see
 * `drizzle/0000_wise_prima.sql`) — a concurrent duplicate insert is still
 * caught below and turned into the same clean 409 rather than leaking a
 * raw constraint-violation message. The admin's own email only needs to be
 * unique *within* the shop (`uq_users_shop_email`), which is automatically
 * true for a shop that doesn't exist yet, so no separate check is needed
 * for it.
 *
 * The generated temporary password is hashed with the same `bcryptjs` path
 * as any other password before it ever touches the database, and is never
 * logged — it only ever exists in memory for the duration of this call and
 * in the one JSON response the caller sends back.
 */
export async function createTenant(
  input: CreateTenantInput,
): Promise<{ tenant: TenantListItem; temporaryPassword: string }> {
  const conflicts = await db
    .select({ email: shops.email, phone: shops.phone })
    .from(shops)
    .where(or(eq(shops.email, input.email), eq(shops.phone, input.phone)));

  const fieldErrors: { field: string; message: string }[] = [];
  if (conflicts.some((row) => row.email === input.email)) {
    fieldErrors.push({
      field: "email",
      message: "A tenant with this email already exists",
    });
  }
  if (conflicts.some((row) => row.phone === input.phone)) {
    fieldErrors.push({
      field: "phone",
      message: "A tenant with this phone number already exists",
    });
  }
  if (fieldErrors.length > 0) {
    throw new AppError(
      "A tenant with these details already exists",
      409,
      fieldErrors,
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const tenant = await db.transaction(async (tx) => {
      const [shop] = await tx
        .insert(shops)
        .values({
          name: input.name,
          email: input.email,
          phone: input.phone,
          address: input.address || null,
        })
        .returning();

      await tx.insert(users).values({
        shopId: shop.id,
        role: "admin",
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        email: input.ownerEmail,
        phone: input.ownerPhone || null,
        passwordHash,
        // Any account created *for* someone else with a system-generated
        // password is flagged for a forced reset, regardless of role — the
        // legacy app only did this for staff, never for a provisioned
        // shop owner (see plan.md § Phase 5 "Problems in existing
        // implementation").
        mustChangePassword: true,
      });

      await recordAudit(tx, {
        shopId: shop.id,
        action: AuditAction.TENANT_CREATED,
        entityType: "shop",
        entityId: shop.id,
        summary: `Tenant "${shop.name}" created, owner ${input.ownerFirstName} ${input.ownerLastName}`,
        after: { name: shop.name, email: shop.email, phone: shop.phone },
      });

      return shop;
    });

    return { tenant, temporaryPassword };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const field = error.constraint_name?.includes("phone")
        ? "phone"
        : "email";
      throw new AppError("A tenant with these details already exists", 409, [
        {
          field,
          message:
            field === "phone"
              ? "A tenant with this phone number already exists"
              : "A tenant with this email already exists",
        },
      ]);
    }
    throw error;
  }
}

/**
 * Toggles a tenant's active status. Blocking revokes every session for
 * every user under the shop immediately (see plan.md § Phase 4 security
 * considerations) — a natural-expiry-only block would leave an already
 * logged-in tenant user with access until their token happened to lapse.
 */
export async function setTenantStatus(
  id: string,
  isActive: boolean,
): Promise<TenantListItem> {
  const parsedId = tenantIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    throw AppError.notFound("Tenant not found");
  }

  const [existing] = await db
    .select({ isActive: shops.isActive })
    .from(shops)
    .where(eq(shops.id, parsedId.data))
    .limit(1);

  if (!existing) {
    throw AppError.notFound("Tenant not found");
  }

  const [tenant] = await db
    .update(shops)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(shops.id, parsedId.data))
    .returning();

  if (!tenant) {
    throw AppError.notFound("Tenant not found");
  }

  await recordAudit(db, {
    shopId: tenant.id,
    action: isActive ? AuditAction.TENANT_UNBLOCKED : AuditAction.TENANT_BLOCKED,
    entityType: "shop",
    entityId: tenant.id,
    summary: isActive ? `Tenant "${tenant.name}" unblocked` : `Tenant "${tenant.name}" blocked`,
    before: { isActive: existing.isActive },
    after: { isActive },
  });

  if (!isActive) {
    await destroySessionsForShop(parsedId.data);
  }

  return tenant;
}
