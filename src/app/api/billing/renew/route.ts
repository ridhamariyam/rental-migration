import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { renewSchema } from "@/lib/validation/billing";
import { requireShopOwner } from "@/server/billing/owner";
import { startRenewal } from "@/server/billing/service";

/** Tenant owner renews (or changes) the platform plan — see
 * `requireShopOwner` for why a locked shop can still reach this. */
export async function POST(request: Request) {
  try {
    const user = await requireShopOwner();
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
