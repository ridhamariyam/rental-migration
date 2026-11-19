import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updatePlanPricesSchema } from "@/lib/validation/admin-billing";
import { updatePlanPrices } from "@/server/billing/plans";

/** Super admin: set the live price and setup fee of the standard plans. */
export async function PUT(request: Request) {
  try {
    await requireSuperAdmin();
    const body = updatePlanPricesSchema.parse(await request.json());
    const plans = await updatePlanPrices(body);
    return apiSuccess(plans, "Prices updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
