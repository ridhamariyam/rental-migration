import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { confirmPickupSchema } from "@/lib/validation/booking-lifecycle";
import { confirmPickup } from "@/server/bookings/lifecycle";
import { dispatchAfterResponse } from "@/server/notifications/dispatch-after-response";

/**
 * Confirms pickup for one item within an order (doc §12). Not gated by a
 * single fixed permission at the route level — `confirmPickup()` itself
 * requires `BOOKING_PICKUP` for the action and, only if money is actually
 * being collected, `PAYMENT_RECORD` too.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id, itemId } = await params;
    const body = confirmPickupSchema.parse(await request.json());
    const result = await confirmPickup(user, id, itemId, body);

    dispatchAfterResponse(id);

    return apiSuccess(result, "Pickup confirmed");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
