import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { getTenantById } from "@/server/tenants/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();

    const { id } = await params;
    const tenant = await getTenantById(id);

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    return apiSuccess(tenant);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
