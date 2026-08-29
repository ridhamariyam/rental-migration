import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { reportDateRangeQuerySchema } from "@/lib/validation/reports";
import { getDailyIncome } from "@/server/reports/service";

/** Daily income for a date range (doc §21 "Daily income") — defaults to
 * the trailing 30 days when no range is given. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = reportDateRangeQuerySchema.parse({
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
    });

    const result = await getDailyIncome(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
