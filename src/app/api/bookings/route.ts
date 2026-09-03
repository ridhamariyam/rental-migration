import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  bookingListQuerySchema,
  createBookingSchema,
} from "@/lib/validation/bookings";
import { createBookingGroup, listBookings } from "@/server/bookings/service";
import { dispatchAfterResponse } from "@/server/notifications/dispatch-after-response";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_VIEW);

    const { searchParams } = new URL(request.url);
    const query = bookingListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      customerId: searchParams.get("customerId") ?? undefined,
    });

    const result = await listBookings(user.shopId, query, user);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_CREATE);

    const body = createBookingSchema.parse(await request.json());
    const created = await createBookingGroup(user, body);

    dispatchAfterResponse(created.map((booking) => booking.id));

    const message =
      created.length > 1
        ? `${created.length} bookings created`
        : "Booking created";

    return apiSuccess(created, message, 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
