import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { attendanceIdParamSchema, correctAttendanceSchema } from "@/lib/validation/attendance";
import { correctAttendance } from "@/server/attendance/service";

/** Owner-only edit to a recorded day (doc §17) — gated by
 * `ATTENDANCE_CORRECT` inside `correctAttendance()` itself. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser();

    const { id } = attendanceIdParamSchema.parse(await params);
    const body = correctAttendanceSchema.parse(await request.json());
    const attendance = await correctAttendance(user, id, body);

    return apiSuccess(attendance, "Attendance corrected");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
