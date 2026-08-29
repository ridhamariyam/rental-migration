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
