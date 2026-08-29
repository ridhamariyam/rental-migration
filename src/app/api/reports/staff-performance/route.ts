import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { reportDateRangeQuerySchema } from "@/lib/validation/reports";
import { getStaffPerformance } from "@/server/reports/service";

/** Staff performance by booking count/revenue (doc §21 "Staff
 * performance") — attributed by `handledById`, frozen at booking time. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = reportDateRangeQuerySchema.parse({
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
    });

    const rows = await getStaffPerformance(user, query);
    return apiSuccess(rows);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
