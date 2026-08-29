import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AttendanceFilters } from "@/components/tenant/attendance-filters";
import { AttendanceStatsTiles } from "@/components/tenant/attendance-stats-tiles";
import { AttendanceTableSkeleton } from "@/components/tenant/attendance-table-skeleton";
import { TeamAttendanceTable } from "@/components/tenant/team-attendance-table";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { attendanceListQuerySchema } from "@/lib/validation/attendance";
import {
  getAttendanceStats,
} from "@/server/attendance/service";
import { listActiveOutletsForSelect } from "@/server/outlets/service";
import { listActiveStaffForSelect } from "@/server/staff/service";
import type { TenantSessionUser } from "@/server/auth/guard";

export const metadata = {
  title: "Team attendance — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TeamAttendancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.ATTENDANCE_VIEW)) {
    redirect(tenantPaths.attendance);
  }

  const canCorrect = hasPermission(user.role, Permission.ATTENDANCE_CORRECT);
  // The owner/super admin has no self-service attendance page of their own
  // (see `../page.tsx` — it redirects them straight back here), so the
  // "My attendance" back-link only makes sense for staff/manager.
  const showMyAttendanceLink = user.role === "staff" || user.role === "manager";

  const rawParams = await searchParams;
  const query = attendanceListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    status: rawParams.status,
    staffId: rawParams.staffId,
    outletId: rawParams.outletId,
    fromDate: rawParams.fromDate,
    toDate: rawParams.toDate,
  });

  const [stats, staffOptions, outlets] = await Promise.all([
    getAttendanceStats(user.shopId),
    listActiveStaffForSelect(user.shopId),
    listActiveOutletsForSelect(user.shopId),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-4">
        {showMyAttendanceLink ? (
          <Link
            href={tenantPaths.attendance}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            My attendance
          </Link>
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Team attendance
          </h1>
          <p className="text-muted-foreground text-sm">
            Every staff member&rsquo;s geofenced check-in/out history.
          </p>
        </div>
      </div>

      <AttendanceStatsTiles stats={stats} />

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <AttendanceFilters
            defaultStaffId={query.staffId ?? "all"}
            defaultOutletId={query.outletId ?? "all"}
            defaultStatus={query.status}
            defaultFromDate={query.fromDate ?? ""}
            defaultToDate={query.toDate ?? ""}
            staffOptions={staffOptions}
            outlets={outlets}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<AttendanceTableSkeleton />}
        >
          <TeamAttendanceTable
            actor={user as TenantSessionUser}
            query={query}
            canCorrect={canCorrect}
          />
        </Suspense>
      </div>
    </main>
  );
}
