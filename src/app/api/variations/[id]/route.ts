import { requireTenantUser } from "@/server/auth/guard";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateVariationSchema } from "@/lib/validation/variations";
import { getVariationById, updateVariation } from "@/server/variations/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_VIEW);

    const { id } = await params;
    const variation = await getVariationById(user.shopId, id);
    if (!variation) {
      throw AppError.notFound("Item not found");
    }

    const canViewCost = hasPermission(user.role, Permission.PRODUCT_COST_VIEW);
    return apiSuccess(
      canViewCost ? variation : { ...variation, buyingPrice: null },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const { id } = await params;
    const body = updateVariationSchema.parse(await request.json());
    // Same server-side guarantee as the create route — a manager/staff
    // actor's raw request can never set the buying price.
    if (!hasPermission(user.role, Permission.PRODUCT_COST_VIEW)) {
      body.buyingPrice = undefined;
    }
    const variation = await updateVariation(user.shopId, id, body);

    return apiSuccess(variation, "Item updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
