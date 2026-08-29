import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateStaffSchema } from "@/lib/validation/staff";
import { getStaffById, updateStaff } from "@/server/staff/service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.STAFF_VIEW);

    const { id } = await params;
    const staff = await getStaffById(user.shopId, id);
    if (!staff) {
      throw AppError.notFound("Staff member not found");
    }

    return apiSuccess(staff);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.STAFF_MANAGE);

    const { id } = await params;
    const body = updateStaffSchema.parse(await request.json());
    const staff = await updateStaff(user, id, body);

    return apiSuccess(staff, "Staff member updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
