"use client";

import Link from "next/link";
import { BellIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDateTime } from "@/lib/format";
import { NOTIFICATION_EVENT_LABELS } from "@/lib/notifications";

export type NavNotification = {
  id: string;
  event: string;
  status: string;
  recipientName: string | null;
  recipientPhone: string;
  bookingNumber: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

const TONE: Record<string, string> = {
  sent: "bg-primary/10 text-primary",
  delivered: "bg-primary/10 text-primary",
  read: "bg-primary/10 text-primary",
  queued: "bg-muted text-muted-foreground",
  sending: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "text-muted-foreground",
};

/**
 * The five most recent messages the shop sent, one tap from anywhere.
 *
 * Deliberately the *send log*, not an inbox: this app's notifications are
 * outbound WhatsApp to customers and item owners, so what an owner wants
 * at a glance is "did the messages go out", and especially "did any
 * fail" — which is why a failure count rides on the bell rather than an
 * unread count, and why failures are tinted.
 */
export function NavNotificationsBell({
  notifications,
  failedCount,
}: {
  notifications: NavNotification[];
  /** Failures among the recent ones — the only state worth interrupting
   * someone about. */
  failedCount: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              failedCount > 0
                ? `Notifications — ${failedCount} failed`
                : "Notifications"
            }
            className="relative"
          />
        }
      >
        <BellIcon />
        {failedCount > 0 ? (
          <span className="bg-destructive absolute top-1 right-1 size-2 rounded-full" />
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">Recent notifications</span>
          {failedCount > 0 ? (
            <Badge
              variant="secondary"
              className="bg-destructive/10 text-destructive"
            >
              {failedCount} failed
            </Badge>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            Nothing sent yet. Messages appear here as bookings go out.
          </p>
        ) : (
          <ul className="divide-border/50 divide-y">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="flex flex-col gap-1 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {NOTIFICATION_EVENT_LABELS[
                      notification.event as keyof typeof NOTIFICATION_EVENT_LABELS
                    ] ?? notification.event}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      TONE[notification.status] ??
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {notification.status}
                  </span>
                </div>
                <span className="text-muted-foreground truncate text-xs">
                  {notification.recipientName ?? notification.recipientPhone}
                  {notification.bookingNumber
                    ? ` · ${notification.bookingNumber}`
                    : ""}
                  {" · "}
                  {formatDateTime(
                    notification.sentAt ?? notification.createdAt,
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="w-full justify-center"
            render={<Link href={tenantPaths.notifications} />}
          >
            View all notifications
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
