import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateProductSchema } from "@/lib/validation/products";
import {
  deleteProduct,
  getProductById,
  updateProduct,
} from "@/server/products/service";

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

/**
 * Permanent removal, owner-only (`Permission.RECORD_DELETE`). The service
 * decides whether this particular row may go — it refuses whenever
 * deleting would strand history that something else still depends on.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.RECORD_DELETE);

    const { id } = await params;
    await deleteProduct(user, id);

    return apiSuccess(null, "Product deleted");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
