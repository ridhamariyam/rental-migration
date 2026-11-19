import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { recordOfflinePaymentSchema } from "@/lib/validation/admin-billing";
import { recordOfflinePayment } from "@/server/admin/service";

/** Super admin: record a payment received outside Razorpay and extend the
 * tenant's subscription by it. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const body = recordOfflinePaymentSchema.parse(await request.json());
    const result = await recordOfflinePayment(id, body);
    return apiSuccess(result, "Payment recorded");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
