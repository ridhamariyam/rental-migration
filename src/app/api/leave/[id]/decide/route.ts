import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { decideLeaveSchema, leaveIdParamSchema } from "@/lib/validation/leave";
import { decideLeave } from "@/server/leave/service";

/** Approves/rejects a pending leave request — gated by `LEAVE_MANAGE`
 * inside `decideLeave()` itself. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = leaveIdParamSchema.parse(await params);
    const body = decideLeaveSchema.parse(await request.json());
    const leave = await decideLeave(user, id, body);

    return apiSuccess(leave, `Leave ${body.status}`);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
