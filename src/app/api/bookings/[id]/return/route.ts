import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { returnBookingSchema } from "@/lib/validation/booking-lifecycle";
import { returnBooking } from "@/server/bookings/lifecycle";

/**
 * Records a return + damage/deposit settlement for a booking (doc
 * §14–15). Gated by `BOOKING_RETURN` alone — the settlement's own
 * `deposit_release`/`damage_charge` ledger movements are system-generated
 * side effects of this already-authorized action, not a separate payment
 * a caller picks a type for.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = await params;
    const body = returnBookingSchema.parse(await request.json());
    const result = await returnBooking(user, id, body);

    return apiSuccess(result, "Item returned");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
