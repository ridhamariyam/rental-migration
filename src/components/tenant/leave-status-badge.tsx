import { Badge } from "@/components/ui/badge";
import type { StaffLeave } from "@/lib/db/schema";

const STATUS_META: Record<
  StaffLeave["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  approved: { label: "Approved", className: "bg-primary/10 text-primary" },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/10 text-destructive",
  },
};

/** Shared status-color mapping, mirroring `BookingStatusBadge`'s pattern. */
export function LeaveStatusBadge({ status }: { status: StaffLeave["status"] }) {
  const meta = STATUS_META[status];

  return (
    <Badge variant="secondary" className={meta.className}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export function leaveStatusLabel(status: StaffLeave["status"]): string {
  return STATUS_META[status].label;
}
