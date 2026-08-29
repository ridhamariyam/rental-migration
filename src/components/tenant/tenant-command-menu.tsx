"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  SearchIcon,
  Settings2Icon,
  ShirtIcon,
  SprayCanIcon,
  TagIcon,
  UserCircleIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import {
  hasPermission,
  Permission,
  type UserRole,
} from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";

const allSearchableItems = [
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
 * Tenant-side counterpart to `AdminCommandMenu` — same sidebar search box +
 * Cmd/Ctrl-K palette for jumping between pages, filtered to what the
 * signed-in role can actually reach (mirrors `TenantSidebar`'s own nav
 * filtering, since a palette that offers an unreachable page is worse than
 * not offering it at all).
 */
export function TenantCommandMenu({ role }: { role: UserRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const searchableItems = allSearchableItems
    .filter((item) => item.href !== tenantPaths.dashboard || role !== "staff")
    .filter((item) => !item.permission || hasPermission(role, item.permission))
    .map((item) =>
      // Same "no self-service check-in page" redirect `TenantSidebar` and
      // `dashboard/attendance/page.tsx` apply for the owner/super admin.
      item.href === tenantPaths.attendance &&
      (role === "admin" || role === "super_admin")
        ? { ...item, href: `${tenantPaths.attendance}/team` }
        : item,
    );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // See `AdminCommandMenu` for why this guards `event.key` first.
      if (
        event.key?.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const goTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <SidebarMenuButton
        tooltip="Search"
        onClick={() => setOpen(true)}
        className="h-9 rounded-lg border border-input/70 bg-background/60 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground shadow-2xs"
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground/75" />
        <span className="min-w-0 flex-1 truncate text-left">Search…</span>
        <kbd className="ml-auto inline-flex shrink-0 items-center rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
          ⌘K
        </kbd>
      </SidebarMenuButton>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Jump to a page in your business dashboard"
      >
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Navigate">
              {searchableItems.map((item) => (
                <CommandItem key={item.href} onSelect={() => goTo(item.href)}>
                  <item.icon />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
