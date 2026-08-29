import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { dashboardQuerySchema } from "@/lib/validation/reports";
import { getDashboardStats } from "@/server/reports/service";

/** The Shop Owner Dashboard's KPI tiles (doc §19) — gated by
 * `REPORT_VIEW` inside the service itself. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = dashboardQuerySchema.parse({
      outletId: searchParams.get("outletId") ?? undefined,
    });

    const stats = await getDashboardStats(user, query);
    return apiSuccess(stats);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
