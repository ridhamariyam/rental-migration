import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { leaveIdParamSchema } from "@/lib/validation/leave";
import { deleteLeave } from "@/server/leave/service";

/** Withdraws a leave request — gated inside `deleteLeave()` itself (the
 * requester's own *pending* request, or any request at all for
 * `LEAVE_MANAGE`). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = leaveIdParamSchema.parse(await params);
    await deleteLeave(user, id);

    return apiSuccess(null, "Leave request withdrawn");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
