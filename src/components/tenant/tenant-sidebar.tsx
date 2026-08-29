"use client";

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
  ShirtIcon,
  SprayCanIcon,
  TagIcon,
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
} from "@/components/ui/sidebar";
import { LogoMark } from "@/components/admin/logo-mark";
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
    role: UserRole;
  };
}) {
  const pathname = usePathname();
  const isOwner = user.role === "admin" || user.role === "super_admin";
  // Plain staff accounts get no dashboard/overview page at all (see
  // `dashboard/page.tsx`'s matching redirect) — Bookings is their
  // effective "home" instead.
  const homeHref = user.role === "staff" ? tenantPaths.bookings : tenantPaths.dashboard;
  const items = navItems
    .filter((item) => item.href !== tenantPaths.dashboard || user.role !== "staff")
    .filter((item) => !item.permission || hasPermission(user.role, item.permission))
    .map((item) =>
      // The owner/super admin has no self-service "check in" page of
      // their own (see `dashboard/attendance/page.tsx`'s redirect) — send
      // them straight to the team view instead of bouncing through it.
      item.href === tenantPaths.attendance && isOwner
        ? { ...item, href: `${tenantPaths.attendance}/team` }
        : item,
    );

  return (
    <Sidebar collapsible="icon" variant="inset" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href={homeHref} />}
              className="mb-3 overflow-visible group-data-[collapsible=icon]:justify-center"
            >
              <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                <LogoMark className="size-7 object-contain" />
              </span>
              <span className="font-script text-[22px] font-bold tracking-wide overflow-visible px-1 py-0.5 inline-block group-data-[collapsible=icon]:hidden">
                Rentique
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <TenantCommandMenu role={user.role} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2 py-1">
          <SidebarGroupLabel className="px-2 py-1.5 text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60">
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
                          ? "h-9 rounded-lg bg-primary/10 px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 hover:text-primary data-active:bg-primary/10 data-active:font-semibold data-active:text-primary"
                          : "h-9 rounded-lg px-2.5 text-sm font-medium text-muted-foreground/90 transition-colors hover:bg-accent/60 hover:text-foreground"
                      }
                    >
                      <Icon
                        className={
                          isActive
                            ? "size-[18px] shrink-0 text-primary"
                            : "size-[18px] shrink-0 text-muted-foreground/75 transition-colors group-hover/menu-button:text-foreground"
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
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <TenantAccountButton
              firstName={user.firstName}
              lastName={user.lastName}
              email={user.email}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
