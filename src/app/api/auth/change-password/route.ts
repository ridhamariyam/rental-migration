import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { changePasswordSchema } from "@/lib/validation/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { changePassword } from "@/server/auth/service";

/**
 * Only reachable by an authenticated session flagged `mustChangePassword`
 * — not a general "change my password" endpoint (that's a separate,
 * not-yet-scoped feature that would require the *current* password).
 * Trusting a plain "am I signed in" check here would let any session skip
 * proving anything at all to set a brand new password.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw AppError.unauthorized("Sign-in required");
    }

    if (!user.mustChangePassword) {
      throw AppError.forbidden("A password reset isn't required right now");
    }

    const body = changePasswordSchema.parse(await request.json());
    await changePassword(user.id, body.newPassword);

    return apiSuccess(null, "Password updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
