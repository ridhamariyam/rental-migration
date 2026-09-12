import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OwnerItemsCard } from "@/components/tenant/owner-items-card";
import { SettlementFilters } from "@/components/tenant/settlement-filters";
import { SettlementStatsTiles } from "@/components/tenant/settlement-stats-tiles";
import { SettlementsTable } from "@/components/tenant/settlements-table";
import { SettlementsTableSkeleton } from "@/components/tenant/settlements-table-skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { settlementListQuerySchema } from "@/lib/validation/settlements";
import { getSettlementSummary } from "@/server/settlements/service";
import { listActiveOutletsForSelect } from "@/server/outlets/service";
import type { TenantSessionUser } from "@/server/auth/guard";

export const metadata = {
  title: "Revenue Share — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RevenueSharePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.SETTLEMENT_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const actor = user as TenantSessionUser;
  const canManage = hasPermission(user.role, Permission.SETTLEMENT_MANAGE);

  const rawParams = await searchParams;
  const query = settlementListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    status: rawParams.status,
    outletId: rawParams.outletId,
    q: rawParams.q,
  });

  const [summary, outlets] = await Promise.all([
    getSettlementSummary(actor),
    listActiveOutletsForSelect(user.shopId),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Revenue Share</h1>
        <p className="text-muted-foreground text-sm">
          Payouts owed to customers whose own items are listed for rent.
        </p>
      </div>

      <SettlementStatsTiles summary={summary} />

      {/* The register first, the money ledger second: an owner's item is
          visible here from the moment it is listed, while a settlement row
          only exists once a rental has come back. */}
      <Suspense fallback={null}>
        <OwnerItemsCard actor={actor} outletId={query.outletId} q={query.q} />
      </Suspense>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <SettlementFilters
            defaultQuery={query.q ?? ""}
            defaultStatus={query.status}
            defaultOutletId={query.outletId ?? "all"}
            outlets={outlets}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<SettlementsTableSkeleton canManage={canManage} />}
        >
          <SettlementsTable
            actor={actor}
            query={query}
            canManage={canManage}
            basePath={tenantPaths.revenueShare}
          />
        </Suspense>
      </div>
    </main>
  );
}
