import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { reportDateRangeQuerySchema } from "@/lib/validation/reports";
import { getRevenueByOutlet } from "@/server/reports/service";

/** Revenue by outlet (doc §21 "Revenue by outlet") — every active outlet
 * appears even with zero bookings in the window. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = reportDateRangeQuerySchema.parse({
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
    });

    const rows = await getRevenueByOutlet(user, query);
    return apiSuccess(rows);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
