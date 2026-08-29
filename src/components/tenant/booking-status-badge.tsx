import { Badge } from "@/components/ui/badge";
import type { Booking } from "@/lib/db/schema";

const STATUS_META: Record<
  Booking["status"],
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "text-muted-foreground" },
  confirmed: { label: "Confirmed", className: "bg-primary/10 text-primary" },
  pickup_pending: {
    label: "Pickup pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  rented: {
    label: "Rented",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  return_pending: {
    label: "Return pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  returned: {
    label: "Returned",
    className: "bg-primary/10 text-primary",
  },
  overdue: {
    label: "Overdue",
    className: "bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    className: "text-muted-foreground",
  },
};

/** Shared status-color mapping so the list, detail page and any future
 * screen never disagree on what each booking status looks like. */
export function BookingStatusBadge({ status }: { status: Booking["status"] }) {
  const meta = STATUS_META[status];

  return (
    <Badge variant="secondary" className={meta.className}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export function bookingStatusLabel(status: Booking["status"]): string {
  return STATUS_META[status].label;
}
