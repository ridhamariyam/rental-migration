import type { TenantSessionUser } from "@/server/auth/guard";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogMaintenanceTaskDialog } from "@/components/tenant/log-maintenance-task-dialog";
import { MaintenanceFilters } from "@/components/tenant/maintenance-filters";
import { MaintenanceStatsTiles } from "@/components/tenant/maintenance-stats-tiles";
import { MaintenanceTasksTable } from "@/components/tenant/maintenance-tasks-table";
import { MaintenanceTasksTableSkeleton } from "@/components/tenant/maintenance-tasks-table-skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { maintenanceListQuerySchema } from "@/lib/validation/maintenance";
import { getMaintenanceStats } from "@/server/maintenance/service";
import { listActiveOutletsForSelect } from "@/server/outlets/service";

export const metadata = {
  title: "Cleaning & Maintenance — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.MAINTENANCE_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.MAINTENANCE_MANAGE);

  const rawParams = await searchParams;
  const query = maintenanceListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    status: rawParams.status,
    taskType: rawParams.taskType,
    outletId: rawParams.outletId,
  });

  const [stats, outlets] = await Promise.all([
    getMaintenanceStats(user.shopId),
    listActiveOutletsForSelect(user.shopId),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Cleaning & Maintenance
          </h1>
          <p className="text-muted-foreground text-sm">
            A returned item stays off the shelf until every task here is
            closed out.
          </p>
        </div>

        {canManage ? <LogMaintenanceTaskDialog /> : null}
      </div>

      <MaintenanceStatsTiles stats={stats} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <MaintenanceFilters
            defaultQuery={query.q ?? ""}
            defaultStatus={query.status}
            defaultTaskType={query.taskType}
            defaultOutletId={query.outletId ?? "all"}
            outlets={outlets}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<MaintenanceTasksTableSkeleton />}
        >
          <MaintenanceTasksTable actor={user as TenantSessionUser} query={query} />
        </Suspense>
      </div>
    </main>
  );
}
