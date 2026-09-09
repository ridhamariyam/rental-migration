import { redirect } from "next/navigation";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavCheckInOut } from "@/components/tenant/nav-check-in-out";
import { TenantSidebar } from "@/components/tenant/tenant-sidebar";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { getTodaysAttendance } from "@/server/attendance/service";

/**
 * Protected tenant shell. Phase 6/7 only needed a guard and a bare header
 * (a place to land after login, and to enforce the forced-reset redirect);
 * this phase adds the real navigation — a collapsible sidebar mirroring the
 * admin console's shell exactly (`Sidebar`/`SidebarInset`/`SidebarTrigger`),
 * with nav items filtered by the signed-in user's permissions. A guard here
 * is required in addition to `proxy.ts`'s cookie-presence check: the proxy
 * only checks that a session cookie exists, not that it's still valid
 * (expired, or revoked by a tenant block) — only `getCurrentUser()`
 * actually verifies that.
 *
 * Also enforces Phase 7's forced first-login reset *server-side*, not just
 * as a frontend redirect: every route under this layout is unreachable
 * until `mustChangePassword` clears, no matter how it's navigated to.
 */
export default async function TenantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/reset-password");
  }

  // Only staff/managers self-check-in (see the attendance page's own
  // owner/super-admin redirect) — the header widget mirrors that. Owner
  // roles hold `ATTENDANCE_SELF` too (it's part of `ALL_PERMISSIONS`), so
  // the permission check alone isn't enough to exclude them here.
  const isOwner = user.role === "admin" || user.role === "super_admin";
  const canSelfCheckIn =
    !isOwner && hasPermission(user.role, Permission.ATTENDANCE_SELF);
  const today = canSelfCheckIn ? await getTodaysAttendance(user.id) : null;

  return (
    <SidebarProvider>
      <TenantSidebar
        user={{
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.role,
        }}
      />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-4 print:hidden">
          <SidebarTrigger />
          {canSelfCheckIn ? (
            <div className="ml-auto">
              <NavCheckInOut initialToday={today} />
            </div>
          ) : null}
        </header>
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
