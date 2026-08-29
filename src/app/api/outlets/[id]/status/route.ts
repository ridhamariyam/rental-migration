import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { outletStatusSchema } from "@/lib/validation/outlets";
import { setOutletStatus } from "@/server/outlets/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.OUTLET_MANAGE);

    const { id } = await params;
    const body = outletStatusSchema.parse(await request.json());
    const outlet = await setOutletStatus(user.shopId, id, body.isActive);

    return apiSuccess(
      outlet,
      body.isActive ? "Outlet activated" : "Outlet deactivated",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
