import { hasPermission, Permission } from "@/lib/auth/permissions";
import { listNotificationLogs } from "@/server/notifications/service";
import type { TenantSessionUser } from "@/server/auth/guard";
import { NavNotificationsBell } from "@/components/tenant/nav-notifications-bell";

/**
 * Server half of the navbar bell: reads the five most recent sends for
 * this shop and hands them to the dropdown. Rendered inside the dashboard
 * header's own `Suspense` so a slow query never holds up the page frame.
 *
 * Only for roles that may see the notification console at all — a staff
 * account has no business reading the shop's message log, so the bell is
 * simply absent for them rather than present and empty.
 */
export async function NavNotifications({ user }: { user: TenantSessionUser }) {
  if (!hasPermission(user.role, Permission.NOTIFICATION_VIEW)) {
    return null;
  }

  const { items } = await listNotificationLogs(user.shopId, {
    page: 1,
    pageSize: 5,
    q: undefined,
    status: "all",
    event: "all",
  });

  return (
    <NavNotificationsBell
      notifications={items.map((item) => ({
        id: item.id,
        event: item.event,
        status: item.status,
        recipientName: item.recipientName,
        recipientPhone: item.recipientPhone,
        bookingNumber: item.bookingNumber,
        createdAt: item.createdAt,
        sentAt: item.sentAt,
      }))}
      failedCount={items.filter((item) => item.status === "failed").length}
    />
  );
}
