import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateOutletSchema } from "@/lib/validation/outlets";
import { getOutletById, updateOutlet } from "@/server/outlets/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.OUTLET_VIEW);

    const { id } = await params;
    const outlet = await getOutletById(user.shopId, id);
    if (!outlet) {
      throw AppError.notFound("Outlet not found");
    }

    return apiSuccess(outlet);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.OUTLET_MANAGE);

    const { id } = await params;
    const body = updateOutletSchema.parse(await request.json());
    const outlet = await updateOutlet(user.shopId, id, body);

    return apiSuccess(outlet, "Outlet updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
