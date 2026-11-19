import "server-only";

import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

export type TenantSessionUser = SessionUser & { shopId: string };

/**
 * Route-handler guard for tenant-scoped API routes (outlets, staff, and
 * anything later that belongs to a signed-in business user) — the
 * equivalent of `requireSuperAdmin()` for the admin console. Every check
 * here mirrors what `dashboard/layout.tsx` already enforces for *pages*,
 * repeated because route handlers are a separate request lifecycle the
 * layout never runs for (same reasoning as `admin-session.ts`).
 *
 * `shopId` is always read from the session, never from the request body or
 * a query param — a client-supplied tenant id is only ever a narrowing
 * filter, validated against this value by the caller.
 */
export async function requireTenantUser(
  permission?: Permission,
): Promise<TenantSessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw AppError.unauthorized("Sign-in required");
  }

  if (!user.isActive) {
    throw AppError.forbidden("This account has been deactivated");
  }

  if (user.mustChangePassword) {
    throw AppError.forbidden("Set a new password before continuing");
  }

  if (!user.shopId) {
    throw AppError.forbidden("This action requires a business account");
  }

  if (permission && !hasPermission(user.role, permission)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  return user as TenantSessionUser;
}

/**
 * Which outlet a caller may see, or `null` for "the whole shop".
 *
 * `manager` and `staff` are described throughout `permissions.ts` as
 * outlet-scoped, but nothing enforced it: every list service took only
 * `shopId`, and `outletId` was a filter the *client* supplied. A manager
 * at one branch could read every other branch's staff, bookings,
 * customers and inventory just by omitting the parameter (RQ-12).
 *
 * `admin`/`super_admin` own the whole tenant and stay unscoped. A
 * manager or staff member with no outlet assigned is scoped to nothing
 * rather than to everything — failing closed, since an unassigned
 * account is a provisioning mistake, not a licence to see the lot.
 */
const OUTLET_SCOPED_ROLES: ReadonlySet<TenantSessionUser["role"]> = new Set([
  "manager",
  "staff",
]);

export function isOutletScoped(actor: Pick<TenantSessionUser, "role">): boolean {
  return OUTLET_SCOPED_ROLES.has(actor.role);
}

/** The outlet id every query for this actor must be narrowed to, or
 * `null` when they may see the whole shop. */
export function outletScopeFor(
  actor: Pick<TenantSessionUser, "role" | "outletId">,
): string | null {
  if (!isOutletScoped(actor)) return null;
  return actor.outletId ?? NO_OUTLET_SENTINEL;
}

/**
 * Stands in for "this account is outlet-scoped but has no outlet", so a
 * query narrows to nothing instead of silently dropping the filter. A
 * uuid that cannot exist as a real outlet id.
 */
export const NO_OUTLET_SENTINEL = "00000000-0000-0000-0000-000000000000";

/**
 * Reconciles a client-supplied `outletId` filter with what the actor is
 * actually allowed to see. Returns the outlet to filter by, or `null` for
 * no restriction.
 *
 * A scoped actor asking for a different outlet is refused outright rather
 * than silently re-scoped — quietly returning someone else's outlet's
 * empty result set reads as "there is no data here", which is a worse
 * answer than "you cannot look at that".
 */
export function resolveOutletScope(
  actor: Pick<TenantSessionUser, "role" | "outletId">,
  requestedOutletId?: string | null,
): string | null {
  const scope = outletScopeFor(actor);

  if (scope === null) {
    return requestedOutletId ?? null;
  }

  if (requestedOutletId && requestedOutletId !== scope) {
    throw AppError.forbidden("You can only view your own outlet's data");
  }

  return scope;
}
