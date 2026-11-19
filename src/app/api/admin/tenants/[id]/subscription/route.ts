import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { adminSubscriptionSchema } from "@/lib/validation/billing";
import { setTenantSubscription } from "@/server/billing/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const body = adminSubscriptionSchema.parse(await request.json());
    const tenant = await setTenantSubscription(id, body);
    return apiSuccess(tenant, "Subscription updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
