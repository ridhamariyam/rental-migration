import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { changeOwnPasswordSchema } from "@/lib/validation/profile";
import { changeOwnPassword } from "@/server/profile/service";

/**
 * Genuine self-service password change (requires the current password) —
 * distinct from `POST /api/auth/change-password`, which only serves the
 * forced first-login reset and deliberately has no current-password field
 * (see that route's own doc comment).
 */
export async function POST(request: Request) {
  try {
    const user = await requireTenantUser();

    const body = changeOwnPasswordSchema.parse(await request.json());
    await changeOwnPassword(user.id, body);

    return apiSuccess(null, "Password updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
