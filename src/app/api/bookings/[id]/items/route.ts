import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { bookingItemSchema } from "@/lib/validation/bookings";
import { addItemToBookingGroup } from "@/server/bookings/service";
import { dispatchAfterResponse } from "@/server/notifications/dispatch-after-response";

/** Adds one more line to an already-created order — same permission as
 * editing a booking (`updateBooking`'s own `PATCH` route), since this is
 * still "changing an existing order" work, not a fresh booking. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_MANAGE);

    const { id } = await params;
    const body = bookingItemSchema.parse(await request.json());
    const created = await addItemToBookingGroup(user, id, body);

    dispatchAfterResponse([created.id]);

    return apiSuccess(created, "Item added", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
