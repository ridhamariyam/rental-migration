import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkInOutSchema } from "@/lib/validation/attendance";
import { checkIn } from "@/server/attendance/service";

/** Geofenced check-in (doc §17) — gated by `ATTENDANCE_SELF` inside
 * `checkIn()` itself, not at the route level (matches every other
 * lifecycle action in this app). */
export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.ATTENDANCE_SELF);

    const body = checkInOutSchema.parse(await request.json());
    const attendance = await checkIn(user, body);

    return apiSuccess(attendance, "Checked in", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
