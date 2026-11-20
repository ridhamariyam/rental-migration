import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { cancelSubscriptionSchema } from "@/lib/validation/billing";
import { requireShopOwner } from "@/server/billing/owner";
import { cancelSubscription, resumeSubscription } from "@/server/billing/service";

/** Owner cancels the plan (access continues to the paid-until date). */
export async function POST(request: Request) {
  try {
    const user = await requireShopOwner();
    const body = cancelSubscriptionSchema.parse(await request.json().catch(() => ({})));
    await cancelSubscription({ id: user.id, shopId: user.shopId }, body.reason);
    return apiSuccess({ cancelled: true }, "Subscription cancelled");
  } catch (error) {
    return apiError(error);
  }
}

/** Owner undoes a pending cancellation. */
export async function DELETE() {
  try {
    const user = await requireShopOwner();
    await resumeSubscription({ id: user.id, shopId: user.shopId });
    return apiSuccess({ cancelled: false }, "Subscription resumed");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
