import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateProfileSchema } from "@/lib/validation/profile";
import { updateOwnProfile } from "@/server/profile/service";

/**
 * Self-service profile edit — no `Permission` argument, deliberately: this
 * is every signed-in tenant role editing their own name/phone/avatar, not
 * a role-gated management action. `updateOwnProfile` scopes the write to
 * `user.id` from the session, so there's no id in the request body a
 * client could point at someone else's account.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireTenantUser();

    const body = updateProfileSchema.parse(await request.json());
    const profile = await updateOwnProfile(user.id, body);

    return apiSuccess(profile, "Profile updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
