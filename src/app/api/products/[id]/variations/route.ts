import { requireTenantUser } from "@/server/auth/guard";
import { hasPermission, Permission } from "@/lib/auth/permissions";
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
    const canViewCost = hasPermission(user.role, Permission.PRODUCT_COST_VIEW);
    const sanitized = canViewCost
      ? items
      : items.map((item) => ({ ...item, buyingPrice: null }));

    return apiSuccess(sanitized);
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
    // A manager/staff actor's raw request can never set the buying price,
    // even if they craft the body by hand — the form already hides the
    // field, this is the same guarantee enforced server-side.
    if (!hasPermission(user.role, Permission.PRODUCT_COST_VIEW)) {
      body.buyingPrice = undefined;
    }
    const created = await createVariation(user.shopId, id, body);

    const message =
      created.length > 1 ? `${created.length} items added` : "Item added";

    return apiSuccess(created, message, 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
