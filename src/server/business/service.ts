import "server-only";

import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { AuditAction, recordAudit } from "@/server/audit/service";
import type { TenantSessionUser } from "@/server/auth/guard";
import type { UpdateBusinessInput } from "@/lib/validation/business";

export type ShopRow = typeof shops.$inferSelect;

/** True when a driver error is a Postgres unique-constraint violation
 * (`23505`) — same shape check `tenants/service.ts` uses. */
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
 * Reads the caller's own shop row for the "Business Settings" page. Scoped
 * by the id the session already carries (`actor.shopId`), never a
 * client-supplied one.
 */
export async function getOwnShop(shopId: string): Promise<ShopRow> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);

  if (!shop) {
    throw AppError.notFound("Business not found");
  }

  return shop;
}

/**
 * Updates the caller's own shop profile — the fix for the gap CLAUDE.md
 * documents in the legacy backend ("`ShopService.update_shop` requires
 * `SHOP_MANAGE`, but `_OWNER_PERMISSIONS` excludes it — the tenant admin
 * can never edit their own shop"). Here `Permission.SHOP_MANAGE` actually
 * is granted to `admin` (see `permissions.ts`), and the route handler
 * enforces it via `requireTenantUser(Permission.SHOP_MANAGE)` before this
 * ever runs. Pre-checks email/phone uniqueness (excluding this shop's own
 * row) so the common case returns a clean field error, with the database's
 * `unique` constraint as the real backstop against a concurrent duplicate.
 */
export async function updateOwnShop(
  actor: TenantSessionUser,
  input: UpdateBusinessInput,
): Promise<ShopRow> {
  const existing = await getOwnShop(actor.shopId);

  const conflicts = await db
    .select({ email: shops.email, phone: shops.phone })
    .from(shops)
    .where(
      and(
        ne(shops.id, actor.shopId),
        or(eq(shops.email, input.email), eq(shops.phone, input.phone)),
      ),
    );

  const fieldErrors: { field: string; message: string }[] = [];
  if (conflicts.some((row) => row.email === input.email)) {
    fieldErrors.push({
      field: "email",
      message: "Another business is already using this email",
    });
  }
  if (conflicts.some((row) => row.phone === input.phone)) {
    fieldErrors.push({
      field: "phone",
      message: "Another business is already using this phone number",
    });
  }
  if (fieldErrors.length > 0) {
    throw new AppError("These details are already in use", 409, fieldErrors);
  }

  try {
    const [updated] = await db
      .update(shops)
      .set({
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address || null,
        logoUrl: input.logoUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(shops.id, actor.shopId))
      .returning();

    if (!updated) {
      throw AppError.notFound("Business not found");
    }

    await recordAudit(db, {
      shopId: actor.shopId,
      userId: actor.id,
      action: AuditAction.SHOP_UPDATED,
      entityType: "shop",
      entityId: actor.shopId,
      summary: `Business settings updated`,
      before: { name: existing.name, email: existing.email, phone: existing.phone },
      after: { name: updated.name, email: updated.email, phone: updated.phone },
    });

    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const field = error.constraint_name?.includes("phone") ? "phone" : "email";
      throw new AppError("These details are already in use", 409, [
        {
          field,
          message:
            field === "phone"
              ? "Another business is already using this phone number"
              : "Another business is already using this email",
        },
      ]);
    }
    throw error;
  }
}
