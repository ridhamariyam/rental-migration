import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { createLeaveSchema, leaveListQuerySchema } from "@/lib/validation/leave";
import { createLeave, listLeaves } from "@/server/leave/service";

/** Leave requests (doc §18). Not gated by a single fixed permission at the
 * route level — the service scopes the list to the caller's own requests
 * unless they hold `LEAVE_MANAGE`, and `createLeave()` itself enforces
 * that permission when recording leave for someone else. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = leaveListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      staffId: searchParams.get("staffId") ?? undefined,
    });

    const result = await listLeaves(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser();

    const body = createLeaveSchema.parse(await request.json());
    const created = await createLeave(user, body);

    return apiSuccess(created, "Leave requested", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
