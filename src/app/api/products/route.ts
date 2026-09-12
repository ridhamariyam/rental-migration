import { outletScopeFor, requireTenantUser } from "@/server/auth/guard";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import {
  createProductRequestSchema,
  productListQuerySchema,
} from "@/lib/validation/products";
import {
  createProduct,
  createProductWithItem,
  listProducts,
} from "@/server/products/service";

export async function GET(request: Request) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_VIEW);

    const { searchParams } = new URL(request.url);
    const query = productListQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const result = await listProducts(user.shopId, query);
    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Creates the catalogue entry and, when the body carries one, its first
 * barcoded item in the same transaction — the "Add product" form sends
 * both together (see `createProductWithItemSchema`). The item is omitted
 * only by a shop with no active outlet to stock it at, which falls back to
 * a catalogue-only row it can add items to later.
 */
export async function POST(request: Request) {
  try {
    const user = await requireTenantUser(Permission.PRODUCT_MANAGE);

    const body = createProductRequestSchema.parse(await request.json());

    if (!body.item) {
      const product = await createProduct(user.shopId, body);
      return apiSuccess(product, "Product created", 201);
    }

    // Same two server-side guarantees `POST /api/products/[id]/variations`
    // enforces on the item half, for the same reason: the form already
    // hides the buying price from a non-admin and only offers an
    // outlet-scoped actor their own outlet, but a hand-crafted request
    // would not.
    if (!hasPermission(user.role, Permission.PRODUCT_COST_VIEW)) {
      body.item.buyingPrice = undefined;
    }
    // `outletScopeFor`, not `user.outletId`: only a manager/staff account is
    // outlet-scoped. An admin may legitimately carry an `outletId` (their
    // home branch) and must still be able to stock every outlet — reading
    // the raw column locked owners out of their own other branches.
    const scopedOutletId = outletScopeFor(user);
    if (
      scopedOutletId &&
      body.item.outletIds.some((outletId) => outletId !== scopedOutletId)
    ) {
      throw AppError.forbidden("You can only add items to your own outlet");
    }

    const product = await createProductWithItem(user.shopId, {
      ...body,
      item: body.item,
    });

    return apiSuccess(product, "Product created", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
