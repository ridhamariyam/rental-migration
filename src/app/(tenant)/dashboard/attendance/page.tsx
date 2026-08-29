import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { CheckInOutCard } from "@/components/tenant/check-in-out-card";
import { MyAttendanceTable } from "@/components/tenant/my-attendance-table";
import { AttendanceTableSkeleton } from "@/components/tenant/attendance-table-skeleton";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { attendanceListQuerySchema } from "@/lib/validation/attendance";
import { getTodaysAttendance } from "@/server/attendance/service";
import { getOutletById } from "@/server/outlets/service";

export const metadata = {
  title: "Attendance — Rentique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  const canViewTeam = hasPermission(user.role, Permission.ATTENDANCE_VIEW);

  // The owner/super admin never does outlet work themselves — there's
  // nothing for them to self-check-in for, so this self-service page
  // (built for staff/manager) sends them straight to the team view they
  // actually want instead of showing an empty "Check in" card.
  if (user.role === "admin" || user.role === "super_admin") {
    redirect(`${tenantPaths.attendance}/team`);
  }

  const rawParams = await searchParams;
  const query = attendanceListQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
  });

  const today = await getTodaysAttendance(user.id);
  const outlet = user.outletId
    ? await getOutletById(user.shopId, user.outletId)
    : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground text-sm">
            Check in when your day starts, check out when it ends.
          </p>
        </div>

        {canViewTeam ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`${tenantPaths.attendance}/team`} />}
          >
            <UsersIcon />
            Team attendance
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <CheckInOutCard initialToday={today} outlet={outlet} />
        </div>

        <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1 lg:col-span-2">
          <div className="border-b p-4">
            <h2 className="text-sm font-medium">My attendance</h2>
          </div>
          <Suspense
            key={JSON.stringify(query)}
            fallback={<AttendanceTableSkeleton showStaffColumn={false} />}
          >
            <MyAttendanceTable shopId={user.shopId} userId={user.id} query={query} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
