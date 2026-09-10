import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { cancelBookingSchema } from "@/lib/validation/bookings";
import { cancelBookingItem } from "@/server/bookings/service";
import { dispatchAfterResponse } from "@/server/notifications/dispatch-after-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_CANCEL);

    const { id, itemId } = await params;
    const body = cancelBookingSchema.parse(
      await request.json().catch(() => ({})),
    );
    const item = await cancelBookingItem(user, id, itemId, body.reason, {
      refundMethod: body.refundMethod,
      refundReference: body.refundReference,
    });

    dispatchAfterResponse([itemId]);

    return apiSuccess(item, "Item cancelled");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
