import { requireTenantUser } from "@/server/auth/guard";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { activeBookingsQuerySchema } from "@/lib/validation/reports";
import { listActiveBookings } from "@/server/reports/service";

/** Bookings currently out with a customer (doc §21 "Pending returns"/
 * "Pending deposits") — `kind=returns` sorts by how overdue;
 * `kind=deposits` filters to ones holding a security deposit and sorts by
 * amount. Paginated: an established shop's "currently out" list can grow
 * past what's worth loading in one page. */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(request.url);
    const query = activeBookingsQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      outletId: searchParams.get("outletId") ?? undefined,
      kind: searchParams.get("kind") ?? undefined,
    });

    const result = await listActiveBookings(user, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
