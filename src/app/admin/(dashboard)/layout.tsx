import { redirect } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { isSuperAdminAuthenticated } from "@/lib/auth/admin-session";
import { adminPaths } from "@/lib/admin-paths";
import { env } from "@/lib/env";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isSuperAdminAuthenticated())) {
    redirect(adminPaths.login);
  }

  return (
    <SidebarProvider>
      <AppSidebar adminEmail={env.SUPER_ADMIN_EMAIL} />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4!" />
          <span className="text-sm font-medium">Admin console</span>
        </header>
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
