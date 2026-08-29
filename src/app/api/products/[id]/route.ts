import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateProductSchema } from "@/lib/validation/products";
import { getProductById, updateProduct } from "@/server/products/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_VIEW);

    const { id } = await params;
    const product = await getProductById(user.shopId, id);
    if (!product) {
      throw AppError.notFound("Product not found");
    }

    return apiSuccess(product);
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
    const body = updateProductSchema.parse(await request.json());
    const product = await updateProduct(user.shopId, id, body);

    return apiSuccess(product, "Product updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
