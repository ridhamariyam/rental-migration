import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";

/**
 * The signed-in business owner, for the subscription routes. Deliberately
 * *not* `requireTenantUser()` — that refuses locked (expired) shops, and
 * renewing is exactly what a locked shop has to be able to do.
 */
export async function requireShopOwner() {
  const user = await getCurrentUser();
  if (!user) throw AppError.unauthorized("Sign-in required");
  if (!user.isActive) throw AppError.forbidden("This account has been deactivated");
  if (!user.shopId || user.role !== "admin") {
    throw AppError.forbidden("Only the business owner can manage the subscription");
  }
  return { ...user, shopId: user.shopId };
}
