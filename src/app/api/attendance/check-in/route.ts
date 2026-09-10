import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { checkInOutSchema } from "@/lib/validation/attendance";
import { readImageUpload } from "@/lib/uploads/read-image-upload";
import { checkIn } from "@/server/attendance/service";

/** Geofenced check-in (doc §17) — gated by `ATTENDANCE_SELF` inside
 * `checkIn()` itself, not at the route level (matches every other
 * lifecycle action in this app).
 *
 * Unlike check-out this takes `multipart/form-data`, because a check-in
 * now carries the live camera capture alongside its coordinates. Sending
 * both in one request is what keeps them bound together: there is no
 * intermediate "upload a photo, get a key" step whose key could be
 * replayed onto a different check-in, and a check-in that fails validation
 * never leaves a stored object behind. */
export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.ATTENDANCE_SELF);

    const formData = await request.formData();
    const body = checkInOutSchema.parse({
      latitude: formData.get("latitude"),
      longitude: formData.get("longitude"),
    });
    const photo = await readImageUpload(formData.get("photo"), "photo");

    const attendance = await checkIn(user, { ...body, photo });

    return apiSuccess(attendance, "Checked in", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
