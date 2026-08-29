import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { resetStaffPassword } from "@/server/staff/service";

/**
 * Admin-initiated password reset for a staff/manager account —
 * `Permission.STAFF_MANAGE` (admin/super_admin only, see `permissions.ts`),
 * same permission `PATCH /api/staff/[id]` already requires. See
 * `resetStaffPassword`'s own doc comment for the full security reasoning
 * (temporary password, forced reset flag, every existing session
 * invalidated).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.STAFF_MANAGE);

    const { id } = await params;
    const result = await resetStaffPassword(user, id);

    return apiSuccess(result, "Password reset");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
