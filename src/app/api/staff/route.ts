import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  createStaffSchema,
  staffListQuerySchema,
} from "@/lib/validation/staff";
import { createStaff, listStaff } from "@/server/staff/service";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.STAFF_VIEW);

    const { searchParams } = new URL(request.url);
    const query = staffListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      role: searchParams.get("role") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
    });

    const result = await listStaff(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.STAFF_MANAGE);

    const body = createStaffSchema.parse(await request.json());
    const { staff, temporaryPassword } = await createStaff(user, body);

    return apiSuccess(
      { staff, temporaryPassword },
      "Staff member created",
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
