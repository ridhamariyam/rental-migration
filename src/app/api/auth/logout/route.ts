import { destroySession } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";

export async function POST() {
  try {
    await destroySession();
    return apiSuccess(null, "Signed out successfully");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
