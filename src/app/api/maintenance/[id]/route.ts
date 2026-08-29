import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { AppError } from "@/lib/errors/app-error";
import { getMaintenanceTaskById } from "@/server/maintenance/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.MAINTENANCE_VIEW);

    const { id } = await params;
    const task = await getMaintenanceTaskById(user.shopId, id);
    if (!task) {
      throw AppError.notFound("Task not found");
    }

    return apiSuccess(task);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
