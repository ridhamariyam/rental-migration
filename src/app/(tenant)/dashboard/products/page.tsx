import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2Icon, PlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProductFilters } from "@/components/tenant/product-filters";
import { ProductStatsTiles } from "@/components/tenant/product-stats-tiles";
import { ProductsTable } from "@/components/tenant/products-table";
import { ProductsTableSkeleton } from "@/components/tenant/products-table-skeleton";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { productListQuerySchema } from "@/lib/validation/products";
import { listAllCategories } from "@/server/categories/service";
import { getProductStats } from "@/server/products/service";

export const metadata = {
  title: "Products — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsPage({
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
  const justCreated = rawParams.created === "1";
  const query = productListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    categoryId: rawParams.categoryId,
    status: rawParams.status,
  });

  const [stats, categories] = await Promise.all([
    getProductStats(user.shopId),
    listAllCategories(user.shopId),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="text-muted-foreground text-sm">
            Your rental catalogue.
          </p>
        </div>

        {canManage ? (
          <Button
            nativeButton={false}
            render={<Link href={tenantPaths.newProduct} />}
          >
            <PlusIcon />
            Add product
          </Button>
        ) : null}
      </div>

      {justCreated ? (
        <Alert className="border-emerald-500/30 bg-emerald-500/5">
          <CheckCircle2Icon className="text-emerald-600" />
          <AlertDescription className="font-medium text-emerald-700 dark:text-emerald-400">
            Product created — it&rsquo;s listed below, ready to rent.
          </AlertDescription>
        </Alert>
      ) : null}

      <ProductStatsTiles stats={stats} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <ProductFilters
            defaultQuery={query.q ?? ""}
            defaultCategoryId={query.categoryId ?? "all"}
            defaultStatus={query.status}
            categories={categories}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<ProductsTableSkeleton />}
        >
          <ProductsTable shopId={user.shopId} query={query} />
        </Suspense>
      </div>
    </main>
  );
}
