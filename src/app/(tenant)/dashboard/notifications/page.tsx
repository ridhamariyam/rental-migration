import { redirect } from "next/navigation";
import { NotificationsConsole } from "@/components/tenant/notifications-console";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { notificationListQuerySchema } from "@/lib/validation/notifications";
import { getNotificationDashboard } from "@/server/notifications/service";

export const metadata = {
  title: "Notifications — Rentique",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.NOTIFICATION_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const query = notificationListQuerySchema.parse({
    page: first(params.page),
    pageSize: first(params.pageSize),
    q: first(params.q),
    status: first(params.status),
    event: first(params.event),
  });

  const dashboard = await getNotificationDashboard(user.shopId, query);

  return (
    <NotificationsConsole
      dashboard={dashboard}
      canManage={hasPermission(user.role, Permission.NOTIFICATION_MANAGE)}
    />
  );
}
