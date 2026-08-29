import "server-only";

import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { outlets, users } from "@/lib/db/schema";
import type {
  CreateOutletInput,
  OutletListQuery,
  UpdateOutletInput,
} from "@/lib/validation/outlets";
import { outletIdParamSchema } from "@/lib/validation/outlets";

export type OutletRow = typeof outlets.$inferSelect;

export type OutletListItem = OutletRow & {
  managerId: string | null;
  managerName: string | null;
};

export type OutletListResult = {
  items: OutletListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** True when a driver error is a Postgres unique-constraint violation
 * (`23505`) — same shape as `tenants/service.ts`'s check. */
function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * "Who manages this outlet" is derived from the staff side (a `manager`-
 * role user whose `outletId` points at it), not a column on `outlets` — see
 * the reasoning comment in `schema/outlets.ts`. Attaches at most one manager
 * name per outlet id (if more than one manager is ever assigned to the same
 * outlet, the most recently created one wins — a soft display fallback, not
 * a constraint the app enforces elsewhere).
 */
async function attachManagers(rows: OutletRow[]): Promise<OutletListItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const managerRows = await db
    .select({
      id: users.id,
      outletId: users.outletId,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        eq(users.role, "manager"),
        inArray(
          users.outletId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(desc(users.createdAt));

  const managerByOutlet = new Map<string, { id: string; name: string }>();
  for (const manager of managerRows) {
    if (!manager.outletId || managerByOutlet.has(manager.outletId)) continue;
    managerByOutlet.set(manager.outletId, {
      id: manager.id,
      name: `${manager.firstName} ${manager.lastName}`,
    });
  }

  return rows.map((row) => ({
    ...row,
    managerId: managerByOutlet.get(row.id)?.id ?? null,
    managerName: managerByOutlet.get(row.id)?.name ?? null,
  }));
}

/**
 * Outlet reads, always scoped to the caller's own tenant — `shopId` comes
 * from the session (`requireTenantUser()`), never from the client. All
 * filtering happens in the database, same discipline as `listTenants`.
 */
export async function listOutlets(
  shopId: string,
  query: OutletListQuery,
): Promise<OutletListResult> {
  const { page, pageSize, q, status } = query;

  const conditions = [eq(outlets.shopId, shopId)];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(outlets.name, pattern),
        ilike(outlets.code, pattern),
        ilike(outlets.address, pattern),
      )!,
    );
  }

  if (status === "active") {
    conditions.push(eq(outlets.isActive, true));
  } else if (status === "inactive") {
    conditions.push(eq(outlets.isActive, false));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(outlets).where(where),
    db
      .select()
      .from(outlets)
      .where(where)
      .orderBy(desc(outlets.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const items = await attachManagers(rows);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type OutletStats = {
  total: number;
  active: number;
  inactive: number;
};

export async function getOutletStats(shopId: string): Promise<OutletStats> {
  const [totalRow, activeRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(outlets)
      .where(eq(outlets.shopId, shopId)),
    db
      .select({ value: count() })
      .from(outlets)
      .where(and(eq(outlets.shopId, shopId), eq(outlets.isActive, true))),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const active = activeRow[0]?.value ?? 0;

  return { total, active, inactive: total - active };
}

/**
 * Returns `null` for an invalid id, a nonexistent outlet, *or* an outlet
 * belonging to a different tenant — the caller turns any of these into a
 * 404, never revealing which case it was (same tenant-isolation reasoning
 * as `getTenantById`).
 */
export async function getOutletById(
  shopId: string,
  id: string,
): Promise<OutletListItem | null> {
  const parsedId = outletIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const [outlet] = await db
    .select()
    .from(outlets)
    .where(and(eq(outlets.id, parsedId.data), eq(outlets.shopId, shopId)))
    .limit(1);

  if (!outlet) {
    return null;
  }

  const [withManager] = await attachManagers([outlet]);
  return withManager;
}

/** Only present-and-nonblank fields are ever considered — an
 * `optionalNumericString` field left blank stays `null` in the database. */
function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  return Number(value);
}

export async function createOutlet(
  shopId: string,
  input: CreateOutletInput,
): Promise<OutletRow> {
  const code = input.code.toUpperCase();

  const [existing] = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.shopId, shopId), eq(outlets.code, code)))
    .limit(1);

  if (existing) {
    throw new AppError("An outlet with this code already exists", 409, [
      { field: "code", message: "An outlet with this code already exists" },
    ]);
  }

  try {
    const [outlet] = await db
      .insert(outlets)
      .values({
        shopId,
        name: input.name,
        code,
        address: input.address || null,
        phone: input.phone || null,
        latitude: parseOptionalNumber(input.latitude),
        longitude: parseOptionalNumber(input.longitude),
        allowedRadiusMetres:
          parseOptionalNumber(input.allowedRadiusMetres) ?? 150,
      })
      .returning();

    return outlet;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("An outlet with this code already exists", 409, [
        { field: "code", message: "An outlet with this code already exists" },
      ]);
    }
    throw error;
  }
}

export async function updateOutlet(
  shopId: string,
  id: string,
  input: UpdateOutletInput,
): Promise<OutletRow> {
  const existing = await getOutletById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Outlet not found");
  }

  const code = input.code.toUpperCase();

  const [conflict] = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(and(eq(outlets.shopId, shopId), eq(outlets.code, code)))
    .limit(1);

  if (conflict && conflict.id !== id) {
    throw new AppError("An outlet with this code already exists", 409, [
      { field: "code", message: "An outlet with this code already exists" },
    ]);
  }

  try {
    const [outlet] = await db
      .update(outlets)
      .set({
        name: input.name,
        code,
        address: input.address || null,
        phone: input.phone || null,
        latitude: parseOptionalNumber(input.latitude),
        longitude: parseOptionalNumber(input.longitude),
        allowedRadiusMetres:
          parseOptionalNumber(input.allowedRadiusMetres) ?? 150,
        updatedAt: new Date(),
      })
      .where(and(eq(outlets.id, id), eq(outlets.shopId, shopId)))
      .returning();

    return outlet;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("An outlet with this code already exists", 409, [
        { field: "code", message: "An outlet with this code already exists" },
      ]);
    }
    throw error;
  }
}

export async function setOutletStatus(
  shopId: string,
  id: string,
  isActive: boolean,
): Promise<OutletRow> {
  const existing = await getOutletById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Outlet not found");
  }

  const [outlet] = await db
    .update(outlets)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(outlets.id, id), eq(outlets.shopId, shopId)))
    .returning();

  return outlet;
}

/** Active outlets for the tenant, for the "assign outlet" select in the
 * staff form — deliberately not paginated, this is a picker not a list. */
export async function listActiveOutletsForSelect(
  shopId: string,
): Promise<{ id: string; name: string; code: string }[]> {
  return db
    .select({ id: outlets.id, name: outlets.name, code: outlets.code })
    .from(outlets)
    .where(and(eq(outlets.shopId, shopId), eq(outlets.isActive, true)))
    .orderBy(outlets.name);
}

/**
 * Throws a clean 404/400 if the outlet doesn't exist, isn't this tenant's,
 * or is deactivated — shared by anything that assigns a record to an
 * outlet (staff, product variations, …) so a picker never lets someone
 * assign to an outlet that won't show up anywhere else as a valid option.
 */
export async function requireActiveOutlet(
  shopId: string,
  outletId: string,
): Promise<void> {
  const [outlet] = await db
    .select({ id: outlets.id, isActive: outlets.isActive })
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.shopId, shopId)))
    .limit(1);

  if (!outlet) {
    throw new AppError("Outlet not found", 404, [
      { field: "outletId", message: "Choose a valid outlet" },
    ]);
  }

  if (!outlet.isActive) {
    throw new AppError("This outlet is deactivated", 400, [
      { field: "outletId", message: "This outlet is deactivated" },
    ]);
  }
}
