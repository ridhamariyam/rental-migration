import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateBookingOrderSchema } from "@/lib/validation/bookings";
import {
  deleteBooking,
  getBookingById,
  updateBookingOrder,
} from "@/server/bookings/service";

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
    const body = updateBookingOrderSchema.parse(await request.json());
    const booking = await updateBookingOrder(user, id, body);

    return apiSuccess(booking, "Booking updated");
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Permanent removal, owner-only (`Permission.RECORD_DELETE`). The service
 * decides whether this particular row may go — it refuses whenever
 * deleting would strand history that something else still depends on.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.RECORD_DELETE);

    const { id } = await params;
    await deleteBooking(user, id);

    return apiSuccess(null, "Booking deleted");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
