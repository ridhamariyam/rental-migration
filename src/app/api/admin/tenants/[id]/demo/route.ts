import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { adminDemoSchema } from "@/lib/validation/billing";
import { setTenantDemo } from "@/server/billing/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const body = adminDemoSchema.parse(await request.json());
    const tenant = await setTenantDemo(id, body.isDemo);
    return apiSuccess(tenant, body.isDemo ? "Demo account set" : "Demo account removed");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
