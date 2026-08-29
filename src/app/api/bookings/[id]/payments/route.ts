import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { recordPaymentSchema } from "@/lib/validation/payments";
import { recordPayment } from "@/server/payments/service";

/**
 * Records one payment against a booking. Deliberately not gated by a
 * single fixed permission at the route level — `recordPayment()` itself
 * dispatches between `PAYMENT_RECORD` and `PAYMENT_REFUND` based on the
 * submitted `paymentType`, the same "type decides which permission" rule
 * the legacy backend's `PaymentService.record` used.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = await params;
    const body = recordPaymentSchema.parse(await request.json());
    const result = await recordPayment(user, id, body);

    return apiSuccess(result, "Payment recorded", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
