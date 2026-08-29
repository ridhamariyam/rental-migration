import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { variationSearchQuerySchema } from "@/lib/validation/bookings";
import { searchVariationsForBooking } from "@/server/variations/service";

/**
 * Cross-product item search (SKU/barcode/product name), for the booking
 * form's item picker. Guarded by `PRODUCT_VIEW` — this is a catalogue
 * search, not itself a booking action.
 */
export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_VIEW);

    const { searchParams } = new URL(request.url);
    const query = variationSearchQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
    });

    if (!query.q) {
      return apiSuccess([]);
    }

    const results = await searchVariationsForBooking(user.shopId, query.q);
    return apiSuccess(results);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
