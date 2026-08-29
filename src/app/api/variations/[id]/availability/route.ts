import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { variationAvailabilitySchema } from "@/lib/validation/variations";
import { setVariationAvailability } from "@/server/variations/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const { id } = await params;
    const body = variationAvailabilitySchema.parse(await request.json());
    const variation = await setVariationAvailability(
      user.shopId,
      id,
      body.isAvailable,
    );

    return apiSuccess(
      variation,
      body.isAvailable ? "Listed for rental" : "Unlisted from rental",
    );
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
