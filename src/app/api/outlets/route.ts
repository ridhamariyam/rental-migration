import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  createOutletSchema,
  outletListQuerySchema,
} from "@/lib/validation/outlets";
import { createOutlet, listOutlets } from "@/server/outlets/service";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.OUTLET_VIEW);

    const { searchParams } = new URL(request.url);
    const query = outletListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const result = await listOutlets(user.shopId, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.OUTLET_MANAGE);

    const body = createOutletSchema.parse(await request.json());
    const outlet = await createOutlet(user.shopId, body);

    return apiSuccess(outlet, "Outlet created", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
