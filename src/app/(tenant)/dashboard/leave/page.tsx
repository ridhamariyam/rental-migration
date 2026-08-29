import { Suspense } from "react";
import { LeaveFilters } from "@/components/tenant/leave-filters";
import { LeaveTable } from "@/components/tenant/leave-table";
import { LeaveTableSkeleton } from "@/components/tenant/leave-table-skeleton";
import { RequestLeaveDialog } from "@/components/tenant/request-leave-dialog";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { leaveListQuerySchema } from "@/lib/validation/leave";
import { listActiveStaffForSelect } from "@/server/staff/service";
import type { TenantSessionUser } from "@/server/auth/guard";

export const metadata = {
  title: "Leave — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LeavePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  const canManage = hasPermission(user.role, Permission.LEAVE_MANAGE);
  // The owner/super admin reviews and decides leave requests but has no
  // outlet shift of their own to request leave from.
  const canRequestLeave = user.role !== "admin" && user.role !== "super_admin";

  const rawParams = await searchParams;
  const query = leaveListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    status: rawParams.status,
    staffId: rawParams.staffId,
  });

  const staffOptions = canManage
    ? await listActiveStaffForSelect(user.shopId)
    : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Leave</h1>
          <p className="text-muted-foreground text-sm">
            {canManage
              ? "Every staff member's leave requests."
              : "Your own leave requests."}
          </p>
        </div>

        {canRequestLeave ? <RequestLeaveDialog /> : null}
      </div>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <LeaveFilters
            defaultStatus={query.status}
            defaultStaffId={query.staffId ?? "all"}
            staffOptions={staffOptions}
          />
        </div>

        <Suspense
          key={JSON.stringify(query)}
          fallback={<LeaveTableSkeleton showStaffColumn={canManage} />}
        >
          <LeaveTable
            actor={user as TenantSessionUser}
            query={query}
            canManage={canManage}
          />
        </Suspense>
      </div>
    </main>
  );
}
