import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { resetOwnerPasswordSchema } from "@/lib/validation/admin-billing";
import { resetOwnerPassword } from "@/server/admin/service";

/** Super admin: issue a tenant owner a one-time temporary password. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const body = resetOwnerPasswordSchema.parse(await request.json());
    const result = await resetOwnerPassword(id, body.userId);
    return apiSuccess(result, "Password reset");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
