"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2Icon,
  BellIcon,
  BarChart3Icon,
  CalendarClockIcon,
  CalendarOffIcon,
  ContactIcon,
  HandCoinsIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  MapPinCheckIcon,
  Settings2Icon,
  ShirtIcon,
  SprayCanIcon,
  TagIcon,
  UserCircleIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Wordmark } from "@/components/brand/wordmark";
import { TenantAccountButton } from "@/components/tenant/tenant-account-button";
import { TenantCommandMenu } from "@/components/tenant/tenant-command-menu";
import {
  hasPermission,
  Permission,
  type UserRole,
} from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";

const navItems = [
  {
    href: tenantPaths.dashboard,
    label: "Dashboard",
    icon: LayoutDashboardIcon,
    permission: null,
  },
  {
    href: tenantPaths.outlets,
    label: "Outlets",
    icon: Building2Icon,
    permission: Permission.OUTLET_VIEW,
  },
  {
    href: tenantPaths.staff,
    label: "Staff",
    icon: UsersIcon,
    permission: Permission.STAFF_VIEW,
  },
  {
    href: tenantPaths.categories,
    label: "Categories",
    icon: TagIcon,
    permission: Permission.PRODUCT_VIEW,
  },
  {
    href: tenantPaths.products,
    label: "Products",
    icon: ShirtIcon,
    permission: Permission.PRODUCT_VIEW,
  },
  {
    href: tenantPaths.customers,
    label: "Customers",
    icon: ContactIcon,
    permission: Permission.CUSTOMER_VIEW,
  },
  {
    href: tenantPaths.bookings,
    label: "Bookings",
    icon: CalendarClockIcon,
    permission: Permission.BOOKING_VIEW,
  },
  {
    href: tenantPaths.maintenance,
    label: "Cleaning & Maintenance",
    icon: SprayCanIcon,
    permission: Permission.MAINTENANCE_VIEW,
  },
  {
    href: tenantPaths.attendance,
    label: "Attendance",
    icon: MapPinCheckIcon,
    permission: Permission.ATTENDANCE_SELF,
  },
  {
    href: tenantPaths.leave,
    label: "Leave",
    icon: CalendarOffIcon,
    permission: Permission.LEAVE_VIEW,
  },
  {
    href: tenantPaths.salary,
    label: "Salary",
    icon: WalletIcon,
    permission: Permission.SALARY_VIEW,
  },
  {
    href: tenantPaths.revenueShare,
    label: "Revenue Share",
    icon: HandCoinsIcon,
    permission: Permission.SETTLEMENT_VIEW,
  },
  {
    href: tenantPaths.notifications,
    label: "Notifications",
    icon: BellIcon,
    permission: Permission.NOTIFICATION_VIEW,
  },
  {
    href: tenantPaths.reports,
    label: "Reports",
    icon: BarChart3Icon,
    permission: Permission.REPORT_VIEW,
  },
  {
    href: tenantPaths.auditLog,
    label: "Audit Log",
    icon: HistoryIcon,
    permission: Permission.AUDIT_VIEW,
  },
] as const;

const accountNavItems = [
  {
    href: tenantPaths.profile,
    label: "Profile",
    icon: UserCircleIcon,
    permission: null,
  },
  {
    href: tenantPaths.business,
    label: "Business Settings",
    icon: Settings2Icon,
    permission: Permission.SHOP_MANAGE,
  },
] as const;

/**
 * The tenant dashboard shell's navigation, introduced this phase (Phase 6/7
 * only needed a bare header — see plan.md § Phase 6 "Delivered"). Nav items
 * are filtered by the signed-in user's role/permission (`staff` accounts
 * see only "Dashboard", never "Outlets"/"Staff"): this is a UI convenience,
 * not the real access control — every route/API this links to re-checks
 * the same permission server-side via `requireTenantUser()`.
 */
export function TenantSidebar({
  user,
}: {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    role: UserRole;
  };
}) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // Tapping a nav item navigates but (being a plain `Link`, not a submit)
  // never closes the mobile off-canvas sheet on its own — close it
  // whenever the route actually changes instead of wiring every link.
  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isOwner = user.role === "admin" || user.role === "super_admin";
  // Every role now has a dashboard — a staff account's is the day's work
  // at their own outlet rather than the shop's revenue (see
  // `dashboard/page.tsx`), so it is their home like anyone else's.
  const homeHref = tenantPaths.dashboard;
  const items = navItems
    .filter(
      (item) => !item.permission || hasPermission(user.role, item.permission),
    )
    .map((item) =>
      // The owner/super admin has no self-service "check in" page of
      // their own (see `dashboard/attendance/page.tsx`'s redirect) — send
      // them straight to the team view instead of bouncing through it.
      item.href === tenantPaths.attendance && isOwner
        ? { ...item, href: `${tenantPaths.attendance}/team` }
        : item,
    );
  const accountItems = accountNavItems.filter(
    (item) => !item.permission || hasPermission(user.role, item.permission),
  );

  return (
    <Sidebar collapsible="icon" variant="inset" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href={homeHref} />}
              className="mb-3 overflow-visible group-data-[collapsible=icon]:hidden"
            >
              <Wordmark size="sm" />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <TenantCommandMenu role={user.role} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2 py-1">
          <SidebarGroupLabel className="text-muted-foreground/60 px-2 py-1.5 text-[11px] font-semibold tracking-widest uppercase">
            Business
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item) => {
                const isActive =
                  item.href === tenantPaths.dashboard
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                      className={
                        isActive
                          ? "bg-card text-primary hover:bg-card hover:text-primary data-active:bg-card data-active:text-primary h-9 rounded-lg px-2.5 text-sm font-semibold shadow-xs transition-colors data-active:font-semibold"
                          : "text-muted-foreground/90 hover:bg-accent/60 hover:text-foreground h-9 rounded-lg px-2.5 text-sm font-medium transition-colors"
                      }
                    >
                      <Icon
                        className={
                          isActive
                            ? "text-primary size-[18px] shrink-0"
                            : "text-muted-foreground/75 group-hover/menu-button:text-foreground size-[18px] shrink-0 transition-colors"
                        }
                      />
                      <span className="min-w-0 truncate tracking-tight">
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {accountItems.length > 0 ? (
          <SidebarGroup className="px-2 py-1">
            <SidebarGroupLabel className="text-muted-foreground/60 px-2 py-1.5 text-[11px] font-semibold tracking-widest uppercase">
              Account
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {accountItems.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                        className={
                          isActive
                            ? "bg-card text-primary hover:bg-card hover:text-primary data-active:bg-card data-active:text-primary h-9 rounded-lg px-2.5 text-sm font-semibold shadow-xs transition-colors data-active:font-semibold"
                            : "text-muted-foreground/90 hover:bg-accent/60 hover:text-foreground h-9 rounded-lg px-2.5 text-sm font-medium transition-colors"
                        }
                      >
                        <Icon
                          className={
                            isActive
                              ? "text-primary size-[18px] shrink-0"
                              : "text-muted-foreground/75 group-hover/menu-button:text-foreground size-[18px] shrink-0 transition-colors"
                          }
                        />
                        <span className="min-w-0 truncate tracking-tight">
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <TenantAccountButton
              firstName={user.firstName}
              lastName={user.lastName}
              email={user.email}
              avatarUrl={user.avatarUrl}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
