import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { productStatusSchema } from "@/lib/validation/products";
import { setProductStatus } from "@/server/products/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const { id } = await params;
    const body = productStatusSchema.parse(await request.json());
    const product = await setProductStatus(user.shopId, id, body.isActive);

    return apiSuccess(
      product,
      body.isActive ? "Product activated" : "Product deactivated",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
