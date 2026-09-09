import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateBookingItemSchema } from "@/lib/validation/bookings";
import { updateBookingItem } from "@/server/bookings/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_MANAGE);

    const { id, itemId } = await params;
    const body = updateBookingItemSchema.parse(await request.json());
    const item = await updateBookingItem(user, id, itemId, body);

    return apiSuccess(item, "Item updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
