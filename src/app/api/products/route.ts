import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  createProductSchema,
  productListQuerySchema,
} from "@/lib/validation/products";
import { createProduct, listProducts } from "@/server/products/service";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_VIEW);

    const { searchParams } = new URL(request.url);
    const query = productListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const result = await listProducts(user.shopId, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const body = createProductSchema.parse(await request.json());
    const product = await createProduct(user.shopId, body);

    return apiSuccess(product, "Product created", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
