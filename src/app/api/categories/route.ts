import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  categoryFormSchema,
  categoryListQuerySchema,
} from "@/lib/validation/categories";
import { createCategory, listCategories } from "@/server/categories/service";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_VIEW);

    const { searchParams } = new URL(request.url);
    const query = categoryListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
    });

    const result = await listCategories(user.shopId, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const body = categoryFormSchema.parse(await request.json());
    const category = await createCategory(user.shopId, body);

    return apiSuccess(category, "Category created", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
