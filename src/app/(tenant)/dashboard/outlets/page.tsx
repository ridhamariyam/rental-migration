import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { OutletFilters } from "@/components/tenant/outlet-filters";
import { OutletStatsTiles } from "@/components/tenant/outlet-stats-tiles";
import { OutletsTable } from "@/components/tenant/outlets-table";
import { OutletsTableSkeleton } from "@/components/tenant/outlets-table-skeleton";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { outletListQuerySchema } from "@/lib/validation/outlets";
import { getOutletStats } from "@/server/outlets/service";

export const metadata = {
  title: "Outlets — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OutletsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  // Sidebar navigation already hides this link from a `staff` account, but
  // that's cosmetic — a direct visit to the URL must be blocked the same
  // way the API routes are (`requireTenantUser(Permission.OUTLET_VIEW)`).
  if (!hasPermission(user.role, Permission.OUTLET_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.OUTLET_MANAGE);

  const rawParams = await searchParams;
  const query = outletListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    status: rawParams.status,
  });
  const stats = await getOutletStats(user.shopId);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Outlets</h1>
          <p className="text-muted-foreground text-sm">
            The branches your business operates from.
          </p>
        </div>

        {canManage ? (
          <Button
            nativeButton={false}
            render={<Link href={tenantPaths.newOutlet} />}
          >
            <PlusIcon />
            Add outlet
          </Button>
        ) : null}
      </div>

      <OutletStatsTiles stats={stats} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <OutletFilters
            defaultQuery={query.q ?? ""}
            defaultStatus={query.status}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<OutletsTableSkeleton />}
        >
          <OutletsTable shopId={user.shopId} query={query} />
        </Suspense>
      </div>
    </main>
  );
}
