import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateBookingSchema } from "@/lib/validation/bookings";
import { getBookingById, updateBooking } from "@/server/bookings/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_VIEW);

    const { id } = await params;
    const booking = await getBookingById(user.shopId, id, user);
    if (!booking) {
      throw AppError.notFound("Booking not found");
    }

    return apiSuccess(booking);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_MANAGE);

    const { id } = await params;
    const body = updateBookingSchema.parse(await request.json());
    const booking = await updateBooking(user, id, body);

    return apiSuccess(booking, "Booking updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
