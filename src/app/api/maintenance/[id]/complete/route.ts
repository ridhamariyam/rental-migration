import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { completeMaintenanceTaskSchema } from "@/lib/validation/maintenance";
import { completeMaintenanceTask } from "@/server/maintenance/service";

/** Closes a task and releases the item back to `available` once nothing
 * else is open for it. Not gated by a fixed permission at the route level
 * — `completeMaintenanceTask()` itself requires `MAINTENANCE_MANAGE`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = await params;
    const body = completeMaintenanceTaskSchema.parse(
      await request.json().catch(() => ({})),
    );
    const { task, released } = await completeMaintenanceTask(user, id, body);

    return apiSuccess(
      { task, released },
      released ? "Task completed — item is available again" : "Task completed",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
