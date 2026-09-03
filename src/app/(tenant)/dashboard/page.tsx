import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3Icon,
  CalendarClockIcon,
  ContactIcon,
  ShirtIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardAnalyticsSection } from "@/components/tenant/dashboard-analytics-section";
import { DashboardStatsTiles } from "@/components/tenant/dashboard-stats-tiles";
import { DashboardStatsTilesSkeleton } from "@/components/tenant/dashboard-stats-tiles-skeleton";
import { OnboardingChecklist } from "@/components/tenant/onboarding-checklist";
import { OnboardingChecklistSkeleton } from "@/components/tenant/onboarding-checklist-skeleton";
import { RevenueTrendSectionSkeleton } from "@/components/tenant/revenue-trend-section-skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { getTenantById } from "@/server/tenants/service";
import type { TenantSessionUser } from "@/server/auth/guard";

export const metadata = {
  title: "Dashboard — Rentique",
};

// Reads the live session/shop on every load rather than serving a cached
// summary — this is the first screen after signing in, it should never
// show stale identity.
export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  {
    href: tenantPaths.newBooking,
    label: "New booking",
    icon: CalendarClockIcon,
  },
  {
    href: tenantPaths.newCustomer,
    label: "Add customer",
    icon: ContactIcon,
  },
  {
    href: tenantPaths.products,
    label: "Browse catalogue",
    icon: ShirtIcon,
  },
  {
    href: tenantPaths.reports,
    label: "Full reports",
    icon: BarChart3Icon,
  },
] as const;

export default async function TenantDashboardPage() {
  // The layout above already redirects to /login when there's no session —
  // this is just satisfying the type checker for the (unreachable) case
  // where this page somehow renders without it.
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  // Plain staff accounts get no dashboard/overview at all — send them
  // straight to Bookings, the page their day-to-day work actually
  // happens on (see `TenantSidebar`'s matching nav filter).
  if (user.role === "staff") {
    redirect(tenantPaths.bookings);
  }

  const shop = user.shopId ? await getTenantById(user.shopId) : null;
  const canViewReports = hasPermission(user.role, Permission.REPORT_VIEW);

  return (
    <main className="flex flex-1 flex-col gap-4.5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-bold tracking-tight">
            Welcome, {user.firstName}
          </h1>
          <p className="text-muted-foreground text-xs">
            {shop?.name ?? "Your business"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <Button
              key={link.href}
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={link.href} />}
              className="h-8 px-3 text-xs gap-1.5"
            >
              <link.icon className="size-3.5" />
              {link.label}
            </Button>
          ))}
        </div>
      </div>

      {canViewReports ? (
        <>
          <Suspense fallback={<OnboardingChecklistSkeleton />}>
            <OnboardingChecklist shopId={(user as TenantSessionUser).shopId} />
          </Suspense>
          <Suspense fallback={<DashboardStatsTilesSkeleton />}>
            <DashboardStatsTiles actor={user as TenantSessionUser} />
          </Suspense>
          <Suspense fallback={<RevenueTrendSectionSkeleton />}>
            <DashboardAnalyticsSection actor={user as TenantSessionUser} />
          </Suspense>
        </>
      ) : (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="text-base">Your account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">
                {user.firstName} {user.lastName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize">{user.role}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

