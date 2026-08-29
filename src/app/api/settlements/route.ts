import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { settlementListQuerySchema } from "@/lib/validation/settlements";
import { listSettlements } from "@/server/settlements/service";

/** Every owner settlement, shop-wide (doc §19–21) — gated by
 * `SETTLEMENT_VIEW` inside `listSettlements()` itself. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = settlementListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
      q: searchParams.get("q") ?? undefined,
    });

    const result = await listSettlements(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
