import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { startMaintenanceTaskSchema } from "@/lib/validation/maintenance";
import { startMaintenanceTask } from "@/server/maintenance/service";

/** Starts a pending task (`pending -> in_progress`). Not gated by a fixed
 * permission at the route level — `startMaintenanceTask()` itself requires
 * `MAINTENANCE_MANAGE`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = await params;
    const body = startMaintenanceTaskSchema.parse(
      await request.json().catch(() => ({})),
    );
    const task = await startMaintenanceTask(user, id, body);

    return apiSuccess(task, "Task started");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
