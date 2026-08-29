import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuditLogFilters } from "@/components/tenant/audit-log-filters";
import { AuditLogTable } from "@/components/tenant/audit-log-table";
import { AuditLogTableSkeleton } from "@/components/tenant/audit-log-table-skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { auditLogListQuerySchema } from "@/lib/validation/audit";
import type { TenantSessionUser } from "@/server/auth/guard";

export const metadata = {
  title: "Audit Log — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.AUDIT_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const actor = user as TenantSessionUser;
  const rawParams = await searchParams;

  const query = auditLogListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    action: rawParams.action,
    entityType: rawParams.entityType,
    userId: rawParams.userId,
    fromDate: rawParams.fromDate,
    toDate: rawParams.toDate,
  });

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          A record of who did what — role changes, payouts, cancellations,
          and other sensitive actions across your business.
        </p>
      </div>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <AuditLogFilters
            defaultAction={query.action ?? "all"}
            defaultEntityType={query.entityType ?? "all"}
            defaultFromDate={query.fromDate ?? ""}
            defaultToDate={query.toDate ?? ""}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<AuditLogTableSkeleton />}
        >
          <AuditLogTable actor={actor} query={query} />
        </Suspense>
      </div>
    </main>
  );
}
