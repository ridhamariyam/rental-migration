import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { attendanceListQuerySchema } from "@/lib/validation/attendance";
import { getMyAttendance, getTodaysAttendance } from "@/server/attendance/service";

/** The caller's own attendance history + today's check-in/out state —
 * never gated by `ATTENDANCE_VIEW`, only `ATTENDANCE_SELF` (a plain staff
 * account reading their own records, same as the legacy backend's
 * `get_my_attendance`). */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.ATTENDANCE_SELF);

    const { searchParams } = new URL(request.url);
    const query = attendanceListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
    });

    const [history, today] = await Promise.all([
      getMyAttendance(user.shopId, user.id, query),
      getTodaysAttendance(user.id),
    ]);

    return apiSuccess({ ...history, today });
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
