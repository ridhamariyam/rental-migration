import { destroyAdminSession } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";

export async function POST() {
  try {
    await destroyAdminSession();
    return apiSuccess(null, "Signed out successfully");
  } catch (error) {
    return apiError(error);
  }
}
