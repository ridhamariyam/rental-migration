import { Badge } from "@/components/ui/badge";
import type { OwnerSettlement } from "@/lib/db/schema";

const STATUS_META: Record<
  OwnerSettlement["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  paid: { label: "Paid", className: "bg-primary/10 text-primary" },
  cancelled: {
    label: "Cancelled",
    className: "text-muted-foreground",
  },
};

/** Same badge treatment as `PaymentStatusBadge`/`MaintenanceTaskStatusBadge`
 * — a settlement's payout status (doc §19–21). */
export function SettlementStatusBadge({
  status,
}: {
  status: OwnerSettlement["status"];
}) {
  const meta = STATUS_META[status];

  return (
    <Badge variant="secondary" className={meta.className}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export function settlementStatusLabel(status: OwnerSettlement["status"]): string {
  return STATUS_META[status].label;
}
