import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { StaffFilters } from "@/components/tenant/staff-filters";
import { StaffStatsTiles } from "@/components/tenant/staff-stats-tiles";
import { StaffTable } from "@/components/tenant/staff-table";
import { StaffTableSkeleton } from "@/components/tenant/staff-table-skeleton";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { staffListQuerySchema } from "@/lib/validation/staff";
import { getStaffStats } from "@/server/staff/service";

export const metadata = {
  title: "Staff — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.STAFF_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.STAFF_MANAGE);

  const rawParams = await searchParams;
  const query = staffListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    role: rawParams.role,
    status: rawParams.status,
    outletId: rawParams.outletId,
  });
  const stats = await getStaffStats(user.shopId);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Staff</h1>
          <p className="text-muted-foreground text-sm">
            Managers and staff accounts across your outlets.
          </p>
        </div>

        {canManage ? (
          <Button
            nativeButton={false}
            render={<Link href={tenantPaths.newStaff} />}
          >
            <PlusIcon />
            Add staff
          </Button>
        ) : null}
      </div>

      <StaffStatsTiles stats={stats} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <StaffFilters
            defaultQuery={query.q ?? ""}
            defaultRole={query.role}
            defaultStatus={query.status}
          />
        </div>

        <Suspense key={JSON.stringify(query)} fallback={<StaffTableSkeleton />}>
          <StaffTable shopId={user.shopId} query={query} />
        </Suspense>
      </div>
    </main>
  );
}
