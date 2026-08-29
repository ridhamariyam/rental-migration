import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { cancelMaintenanceTaskSchema } from "@/lib/validation/maintenance";
import { cancelMaintenanceTask } from "@/server/maintenance/service";

/** Cancels an open task (e.g. logged in error). Not gated by a fixed
 * permission at the route level — `cancelMaintenanceTask()` itself
 * requires `MAINTENANCE_MANAGE`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = await params;
    const body = cancelMaintenanceTaskSchema.parse(
      await request.json().catch(() => ({})),
    );
    const task = await cancelMaintenanceTask(user, id, body);

    return apiSuccess(task, "Task cancelled");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
