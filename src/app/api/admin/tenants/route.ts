import { requireSuperAdmin } from "@/lib/auth/admin-session";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  createTenantSchema,
  tenantListQuerySchema,
} from "@/lib/validation/tenants";
import { createTenant, listTenants } from "@/server/tenants/service";

export async function GET(request: Request) {
  try {
    await requireSuperAdmin();

    const { searchParams } = new URL(request.url);
    const query = tenantListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const result = await listTenants(query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperAdmin();

    const body = createTenantSchema.parse(await request.json());
    const { tenant, temporaryPassword } = await createTenant(body);

    return apiSuccess({ tenant, temporaryPassword }, "Tenant created", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
