import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { renewSchema } from "@/lib/validation/billing";
import { startRenewal } from "@/server/billing/service";

/**
 * Tenant owner renews the platform subscription. Deliberately *not*
 * `requireTenantUser()` — that refuses locked (expired) shops, and renewing
 * is exactly what a locked shop has to be able to do.
 */
async function requireOwner() {
  const user = await getCurrentUser();
  if (!user) throw AppError.unauthorized("Sign-in required");
  if (!user.isActive) throw AppError.forbidden("This account has been deactivated");
  if (!user.shopId || user.role !== "admin") {
    throw AppError.forbidden("Only the business owner can renew the subscription");
  }
  return { ...user, shopId: user.shopId };
}

export async function POST(request: Request) {
  try {
    const user = await requireOwner();
    const body = renewSchema.parse(await request.json());
    const checkout = await startRenewal(user.shopId, body.plan, {
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    });
    return apiSuccess(checkout, "Checkout ready", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
