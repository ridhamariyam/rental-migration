import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { getSettlementSummary } from "@/server/settlements/service";

/** Pending/paid/all-time owner-payout totals, for the Revenue Share page's
 * stat tiles — gated by `SETTLEMENT_VIEW` inside the service itself. */
export async function GET() {
  try {
    const user = await requireTenantUser();
    const summary = await getSettlementSummary(user);
    return apiSuccess(summary);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
