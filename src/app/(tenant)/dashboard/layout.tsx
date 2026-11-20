import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavCheckInOut } from "@/components/tenant/nav-check-in-out";
import {
  DemoUpgradeBanner,
  DemoUpgradeHeaderButton,
} from "@/components/tenant/demo-upgrade-banner";
import { NavNotifications } from "@/components/tenant/nav-notifications";
import {
  SubscriptionBanner,
  SubscriptionLockScreen,
} from "@/components/tenant/subscription-notice";
import { TenantSidebar } from "@/components/tenant/tenant-sidebar";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops } from "@/lib/db/schema";
import { subscriptionState } from "@/lib/plans";
import { getTodaysAttendance } from "@/server/attendance/service";
import { getPlans } from "@/server/billing/plans";
import { isRazorpayConfigured } from "@/server/billing/razorpay";
import type { TenantSessionUser } from "@/server/auth/guard";

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

  // Platform subscription. The demo shop never locks; a locked shop sees
  // the renew screen instead of any dashboard page (its API calls are
  // refused anyway — see `requireTenantUser`). Only the owner can pay.
  const subscription = user.shopIsDemo ? "none" : subscriptionState(user.subscriptionEndsAt);
  const isShopOwner = user.role === "admin";
  const locked = subscription === "locked" && user.subscriptionEndsAt !== null;
  const [lockPlans, lockShop] = locked
    ? await Promise.all([
        isShopOwner ? getPlans() : Promise.resolve(null),
        db
          .select({ name: shops.name, plan: shops.plan })
          .from(shops)
          .where(eq(shops.id, user.shopId!))
          .limit(1)
          .then((rows) => rows[0] ?? null),
      ])
    : [null, null];

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
          <div className="ml-auto flex items-center gap-2">
            {user.shopIsDemo ? <DemoUpgradeHeaderButton /> : null}
            {canSelfCheckIn ? <NavCheckInOut initialToday={today} /> : null}
            {/* Suspended on its own: the header frame paints immediately,
                the bell fills in when its query lands. */}
            <Suspense fallback={null}>
              <NavNotifications user={user as TenantSessionUser} />
            </Suspense>
          </div>
        </header>
        <div className="flex flex-1 flex-col overflow-y-auto">
          {user.shopIsDemo ? <DemoUpgradeBanner /> : null}
          {user.subscriptionEndsAt && !locked ? (
            <SubscriptionBanner
              state={subscription}
              endsAt={user.subscriptionEndsAt}
              isOwner={isShopOwner}
            />
          ) : null}
          {locked && user.subscriptionEndsAt ? (
            <SubscriptionLockScreen
              isOwner={isShopOwner}
              endsAt={user.subscriptionEndsAt}
              businessName={lockShop?.name ?? "Your business"}
              plans={lockPlans}
              currentPlan={lockShop?.plan ?? null}
              razorpayEnabled={isRazorpayConfigured()}
            />
          ) : (
            children
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
