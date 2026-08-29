import { Badge } from "@/components/ui/badge";
import type { Attendance } from "@/lib/db/schema";

const STATUS_META: Record<
  Attendance["status"],
  { label: string; className: string }
> = {
  present: { label: "Present", className: "bg-primary/10 text-primary" },
  corrected: {
    label: "Corrected",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  absent: {
    label: "Absent",
    className: "bg-destructive/10 text-destructive",
  },
};

/** Shared status-color mapping, mirroring `BookingStatusBadge`'s pattern. */
export function AttendanceStatusBadge({
  status,
}: {
  status: Attendance["status"];
}) {
  const meta = STATUS_META[status];

  return (
    <Badge variant="secondary" className={meta.className}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export function attendanceStatusLabel(status: Attendance["status"]): string {
  return STATUS_META[status].label;
}
