import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { tenantStatusSchema } from "@/lib/validation/tenants";
import { setTenantStatus } from "@/server/tenants/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();

    const { id } = await params;
    const body = tenantStatusSchema.parse(await request.json());
    const tenant = await setTenantStatus(id, body.isActive);

    return apiSuccess(
      tenant,
      body.isActive ? "Tenant unblocked" : "Tenant blocked",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
