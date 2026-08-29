import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkInOutSchema } from "@/lib/validation/attendance";
import { checkOut } from "@/server/attendance/service";

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.ATTENDANCE_SELF);

    const body = checkInOutSchema.parse(await request.json());
    const attendance = await checkOut(user, body);

    return apiSuccess(attendance, "Checked out");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
