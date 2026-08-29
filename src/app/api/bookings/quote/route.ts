import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { quoteRequestSchema } from "@/lib/validation/bookings";
import { quoteBooking } from "@/server/bookings/service";

/**
 * Prices a rental and checks its availability without creating anything —
 * backs the booking form's live "check availability & price" preview.
 * Guarded by `BOOKING_CREATE` (the same permission needed to actually
 * create the booking this previews), not a separate read permission.
 */
export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.BOOKING_CREATE);

    const body = quoteRequestSchema.parse(await request.json());
    const quote = await quoteBooking(user.shopId, body);

    return apiSuccess(quote);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
