import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { cancelBookingSchema } from "@/lib/validation/bookings";
import { cancelBookingOrder } from "@/server/bookings/service";
import { dispatchAfterResponse } from "@/server/notifications/dispatch-after-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_CANCEL);

    const { id } = await params;
    const body = cancelBookingSchema.parse(
      await request.json().catch(() => ({})),
    );
    const booking = await cancelBookingOrder(user, id, body.reason, {
      refundMethod: body.refundMethod,
      refundReference: body.refundReference,
    });

    dispatchAfterResponse(id);

    return apiSuccess(booking, "Booking cancelled");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
