import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { staffStatusSchema } from "@/lib/validation/staff";
import { setStaffStatus } from "@/server/staff/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.STAFF_MANAGE);

    const { id } = await params;
    const body = staffStatusSchema.parse(await request.json());
    const staff = await setStaffStatus(user, id, body.isActive);

    return apiSuccess(
      staff,
      body.isActive ? "Staff member activated" : "Staff member deactivated",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
