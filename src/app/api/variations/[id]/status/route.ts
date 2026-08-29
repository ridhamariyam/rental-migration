import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { variationStatusSchema } from "@/lib/validation/variations";
import { setVariationStatus } from "@/server/variations/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const { id } = await params;
    const body = variationStatusSchema.parse(await request.json());
    const variation = await setVariationStatus(user.shopId, id, body.status);

    return apiSuccess(variation, "Status updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
