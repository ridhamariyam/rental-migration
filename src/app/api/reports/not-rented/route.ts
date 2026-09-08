import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { notRentedQuerySchema } from "@/lib/validation/reports";
import { getNotRentedProducts } from "@/server/reports/service";

/** Active products with zero bookings in the window — the inverse of
 * `/api/reports/most-rented`. Capped to a `limit` between 1 and 50,
 * default 10. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = notRentedQuerySchema.parse({
      fromDate: searchParams.get("fromDate") ?? undefined,
      toDate: searchParams.get("toDate") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const rows = await getNotRentedProducts(user, query);
    return apiSuccess(rows);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
