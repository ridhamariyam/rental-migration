import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  createMaintenanceTaskSchema,
  maintenanceListQuerySchema,
} from "@/lib/validation/maintenance";
import {
  createMaintenanceTask,
  listMaintenanceTasks,
} from "@/server/maintenance/service";

/** Cleaning/maintenance work queue (doc §16). List is gated by
 * `MAINTENANCE_VIEW`; manually logging a task requires `MAINTENANCE_MANAGE`. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.MAINTENANCE_VIEW);

    const { searchParams } = new URL(request.url);
    const query = maintenanceListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      taskType: searchParams.get("taskType") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
    });

    const result = await listMaintenanceTasks(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser();

    const body = createMaintenanceTaskSchema.parse(await request.json());
    const created = await createMaintenanceTask(user, body);

    return apiSuccess(created, "Task logged", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
