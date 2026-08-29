import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { createVariationSchema } from "@/lib/validation/variations";
import { getProductById } from "@/server/products/service";
import {
  createVariation,
  listVariationsForProduct,
} from "@/server/variations/service";

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

    const items = await listVariationsForProduct(user.shopId, id);
    return apiSuccess(items);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const { id } = await params;
    const body = createVariationSchema.parse(await request.json());
    const created = await createVariation(user.shopId, id, body);

    const message =
      created.length > 1 ? `${created.length} items added` : "Item added";

    return apiSuccess(created, message, 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
