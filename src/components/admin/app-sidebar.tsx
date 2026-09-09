"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2Icon, LayoutDashboardIcon } from "lucide-react";
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
import { AdminCommandMenu } from "@/components/admin/admin-command-menu";
import { AdminSignOutButton } from "@/components/admin/admin-sign-out-button";
import { LogoMark } from "@/components/admin/logo-mark";
import { adminPaths } from "@/lib/admin-paths";

const navItems = [
  { href: adminPaths.dashboard, label: "Dashboard", icon: LayoutDashboardIcon },
  { href: adminPaths.tenants, label: "Tenants", icon: Building2Icon },
];

export function AppSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // Tapping a nav item navigates but never closes the mobile off-canvas
  // sheet on its own — close it whenever the route actually changes.
  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href={adminPaths.dashboard} />}
              // The `lg` size variant zeroes padding in icon-collapsed mode
              // (`group-data-[collapsible=icon]:p-0!`), which otherwise left
              // the 24px badge flex-start aligned in the 32px collapsed box
              // — a visible left shift versus the nav icons below, which
              // stay centered via their own (non-zeroed) padding.
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
            <AdminCommandMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === adminPaths.dashboard
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                      // Current-state indicator gets the brand accent
                      // (Restrained color strategy: accent reserved for
                      // primary actions/focus/current-state — see
                      // PRODUCT.md), not the plain gray shadcn default.
                      className={
                        isActive
                          ? "bg-primary/10 text-primary data-active:bg-primary/10 data-active:text-primary hover:bg-primary/15 hover:text-primary"
                          : undefined
                      }
                    >
                      <item.icon />
                      <span className="min-w-0 truncate">{item.label}</span>
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
            <AdminSignOutButton adminEmail={adminEmail} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
