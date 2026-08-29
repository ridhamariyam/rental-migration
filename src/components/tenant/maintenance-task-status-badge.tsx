import { Badge } from "@/components/ui/badge";
import type { MaintenanceTask } from "@/lib/db/schema";

const STATUS_META: Record<
  MaintenanceTask["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  in_progress: {
    label: "In progress",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    className: "bg-primary/10 text-primary",
  },
  cancelled: {
    label: "Cancelled",
    className: "text-muted-foreground",
  },
};

/** Shared status-color mapping, mirroring `BookingStatusBadge`/
 * `PaymentStatusBadge`'s pattern. */
export function MaintenanceTaskStatusBadge({
  status,
}: {
  status: MaintenanceTask["status"];
}) {
  const meta = STATUS_META[status];

  return (
    <Badge variant="secondary" className={meta.className}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export function maintenanceTaskStatusLabel(
  status: MaintenanceTask["status"],
): string {
  return STATUS_META[status].label;
}
