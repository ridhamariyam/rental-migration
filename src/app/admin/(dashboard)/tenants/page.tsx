import { Suspense } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { TenantFilters } from "@/components/admin/tenant-filters";
import { TenantStatsTiles } from "@/components/admin/tenant-stats-tiles";
import { TenantsTable } from "@/components/admin/tenants-table";
import { TenantsTableSkeleton } from "@/components/admin/tenants-table-skeleton";
import { Button } from "@/components/ui/button";
import { adminPaths } from "@/lib/admin-paths";
import { tenantListQuerySchema } from "@/lib/validation/tenants";
import { getTenantStats } from "@/server/tenants/service";

export const metadata = {
  title: "Tenants — Rentique Admin",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = await searchParams;
  const query = tenantListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    status: rawParams.status,
  });
  const stats = await getTenantStats();

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground text-sm">
            The businesses running on the platform.
          </p>
        </div>

        <Button
          nativeButton={false}
          render={<Link href={adminPaths.newTenant} />}
        >
          <PlusIcon />
          Add tenant
        </Button>
      </div>

      <TenantStatsTiles stats={stats} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <TenantFilters
            defaultQuery={query.q ?? ""}
            defaultStatus={query.status}
          />
        </div>

        {/* Keyed by the query so a filter/page change remounts this
            boundary and shows a fresh skeleton, instead of the default
            soft-navigation behavior of leaving stale rows visible until
            new data arrives. */}
        <Suspense
          key={JSON.stringify(query)}
          fallback={<TenantsTableSkeleton />}
        >
          <TenantsTable query={query} />
        </Suspense>
      </div>
    </main>
  );
}
