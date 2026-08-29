import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { updateBusinessSchema } from "@/lib/validation/business";
import { getOwnShop, updateOwnShop } from "@/server/business/service";

/**
 * "Business Settings" — admin-only (`Permission.SHOP_MANAGE`, granted to
 * `admin`/`super_admin` only, see `permissions.ts`). This is the tenant-
 * dashboard fix for the legacy backend gap CLAUDE.md documents: a shop
 * owner previously had no way at all to edit their own business profile.
 */
export async function GET() {
  try {
    const user = await requireTenantUser(Permission.SHOP_MANAGE);
    const shop = await getOwnShop(user.shopId);
    return apiSuccess(shop);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireTenantUser(Permission.SHOP_MANAGE);

    const body = updateBusinessSchema.parse(await request.json());
    const shop = await updateOwnShop(user, body);

    return apiSuccess(shop, "Business settings updated");
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
