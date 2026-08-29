import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { attendanceListQuerySchema } from "@/lib/validation/attendance";
import { listAttendance } from "@/server/attendance/service";

/** Every staff member's attendance, shop-wide (doc §17's "The Shop Owner
 * can review attendance") — gated by `ATTENDANCE_VIEW` inside the service
 * itself. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.ATTENDANCE_VIEW);

    const { searchParams } = new URL(request.url);
    const query = attendanceListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      staffId: searchParams.get("staffId") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
    });

    const result = await listAttendance(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
