import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AddCategoryButton } from "@/components/tenant/add-category-button";
import { CategoryFilters } from "@/components/tenant/category-filters";
import { CategoriesTable } from "@/components/tenant/categories-table";
import { CategoriesTableSkeleton } from "@/components/tenant/categories-table-skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { categoryListQuerySchema } from "@/lib/validation/categories";

export const metadata = {
  title: "Categories — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.PRODUCT_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.PRODUCT_MANAGE);

  const rawParams = await searchParams;
  const query = categoryListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm">
            Group your products so they&rsquo;re easier to browse and filter.
          </p>
        </div>

        {canManage ? <AddCategoryButton /> : null}
      </div>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <CategoryFilters defaultQuery={query.q ?? ""} />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<CategoriesTableSkeleton />}
        >
          <CategoriesTable shopId={user.shopId} query={query} />
        </Suspense>
      </div>
    </main>
  );
}
