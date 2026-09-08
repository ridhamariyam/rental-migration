import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { bulkConfirmPickupSchema } from "@/lib/validation/booking-lifecycle";
import { confirmPickupOrder } from "@/server/bookings/lifecycle";
import { dispatchAfterResponse } from "@/server/notifications/dispatch-after-response";

/**
 * Confirms pickup for every listed item in one order at once (doc §12,
 * batched) — see `confirmPickupOrder()`'s own doc comment for why this
 * exists alongside the per-item `.../items/[itemId]/pickup` route.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = await params;
    const body = bulkConfirmPickupSchema.parse(await request.json());
    const result = await confirmPickupOrder(user, id, body);

    dispatchAfterResponse(result.items.map((item) => item.id));

    return apiSuccess(result, "Pickup confirmed");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
