import { redirect } from "next/navigation";
import {
  BellIcon,
  ClockIcon,
  MessageCircleIcon,
  SendIcon,
  SettingsIcon,
  XCircleIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";

export const metadata = {
  title: "Notifications — Rentique",
};

/**
 * UI-only preview for Phase 17 (doc §11/§13's "WhatsApp Confirmation"/
 * "automatic notifications") — no outbox, no worker, no API route yet
 * (see plan.md's open design question on the delivery mechanism, still
 * undecided). Every control here is deliberately `disabled` and every
 * number is a static placeholder: this page previews the eventual shape
 * (stat tiles, filters, a log table) without pretending any of it is
 * live. Wiring it up to a real `notification_logs` outbox + worker is a
 * separate, later pass.
 */
const STAT_TILES = [
  { label: "Queued", value: "—", icon: ClockIcon },
  { label: "Sent", value: "—", icon: SendIcon },
  { label: "Failed", value: "—", icon: XCircleIcon },
] as const;

const PREVIEW_COLUMNS = [
  "Date",
  "Customer",
  "Booking",
  "Type",
  "Channel",
  "Status",
] as const;

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.NOTIFICATION_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              Notifications
            </h1>
            <Badge variant="outline" className="text-muted-foreground">
              <ClockIcon />
              Coming soon
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-xl text-sm">
            Booking confirmations, pickup/return reminders, and payment
            receipts will be delivered here automatically over WhatsApp —
            queued and retried without holding up your team&rsquo;s work.
          </p>
        </div>

        <Button size="sm" variant="outline" disabled>
          <SettingsIcon />
          Configure WhatsApp
        </Button>
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-3 opacity-60 sm:grid-cols-3"
      >
        {STAT_TILES.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex items-center gap-3 px-4">
              <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
                <tile.icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {tile.label}
                </span>
                <span className="text-lg font-semibold tracking-tight">
                  {tile.value}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <div
          aria-hidden="true"
          className="flex flex-col gap-3 border-b p-4 opacity-60 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <Input
            disabled
            placeholder="Search by customer or booking…"
            aria-label="Search notifications"
            className="sm:max-w-xs sm:flex-1"
          />
          <Select defaultValue="all" disabled>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue>All statuses</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all" disabled>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue>All channels</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div aria-hidden="true" className="opacity-40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {PREVIEW_COLUMNS.map((column) => (
                  <TableHead
                    key={column}
                    className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase"
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody />
          </Table>
        </div>

        <Empty className="border-t border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageCircleIcon />
            </EmptyMedia>
            <EmptyTitle>WhatsApp notifications are coming soon</EmptyTitle>
            <EmptyDescription>
              This log will show every booking confirmation, reminder, and
              receipt queued for delivery, along with its delivery status.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" variant="outline" disabled>
              <BellIcon />
              Notify me when it&rsquo;s ready
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </main>
  );
}
