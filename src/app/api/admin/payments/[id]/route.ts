import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { resolvePaymentSchema } from "@/lib/validation/admin-billing";
import { resolvePaymentAttention } from "@/server/admin/service";

/** Super admin: mark a flagged ("needs attention") payment as resolved. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const body = resolvePaymentSchema.parse(await request.json());
    const result = await resolvePaymentAttention(id, body);
    return apiSuccess(result, "Payment marked as resolved");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
