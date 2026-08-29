import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { categoryFormSchema } from "@/lib/validation/categories";
import {
  deleteCategory,
  getCategoryById,
  updateCategory,
} from "@/server/categories/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_VIEW);

    const { id } = await params;
    const category = await getCategoryById(user.shopId, id);
    if (!category) {
      throw AppError.notFound("Category not found");
    }

    return apiSuccess(category);
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
    const body = categoryFormSchema.parse(await request.json());
    const category = await updateCategory(user.shopId, id, body);

    return apiSuccess(category, "Category updated");
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const { id } = await params;
    await deleteCategory(user.shopId, id);

    return apiSuccess(null, "Category deleted");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
