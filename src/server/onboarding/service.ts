import "server-only";

import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, productVariations } from "@/lib/db/schema";
import { getOutletStats } from "@/server/outlets/service";
import { getStaffStats } from "@/server/staff/service";
import { listAllCategories } from "@/server/categories/service";

export type OnboardingStatus = {
  hasOutlet: boolean;
  hasCategory: boolean;
  hasStaff: boolean;
  hasBookableProduct: boolean;
  complete: boolean;
};

/** A product only becomes bookable once it has at least one barcoded
 * physical item — `productVariations` has no `shopId` of its own, so
 * tenant scoping goes through the `products` it belongs to (same join
 * `getDashboardStats` in reports/service.ts uses). */
async function hasAnyBookableProduct(shopId: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(productVariations)
    .innerJoin(products, eq(productVariations.productId, products.id))
    .where(eq(products.shopId, shopId));

  return (row?.value ?? 0) > 0;
}

/**
 * Drives the dashboard's "Get started" checklist — mirrors the initial
 * business setup order from `docs/client-requirment.md` §4 (Create Outlet
 * → Create Categories → Create Staff → Add Products). Every check is a
 * cheap aggregate against data that already exists for other screens,
 * never a new mutable "onboarding complete" flag that could drift from
 * reality.
 */
export async function getOnboardingStatus(
  shopId: string,
): Promise<OnboardingStatus> {
  const [outletStats, categories, staffStats, hasBookableProduct] =
    await Promise.all([
      getOutletStats(shopId),
      listAllCategories(shopId),
      getStaffStats(shopId),
      hasAnyBookableProduct(shopId),
    ]);

  const hasOutlet = outletStats.total > 0;
  const hasCategory = categories.length > 0;
  const hasStaff = staffStats.total > 0;

  return {
    hasOutlet,
    hasCategory,
    hasStaff,
    hasBookableProduct,
    complete: hasOutlet && hasCategory && hasStaff && hasBookableProduct,
  };
}
