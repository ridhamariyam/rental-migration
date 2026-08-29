import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { mostRentedQuerySchema } from "@/lib/validation/reports";
import { getMostRentedProducts } from "@/server/reports/service";

/** Top rented products by booking count (doc §21 "Most rented
 * products") — capped to a `limit` between 1 and 50, default 10. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = mostRentedQuerySchema.parse({
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const rows = await getMostRentedProducts(user, query);
    return apiSuccess(rows);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
