import { Badge } from "@/components/ui/badge";
import type { Booking } from "@/lib/db/schema";

const STATUS_META: Record<
  Booking["paymentStatus"],
  { label: string; className: string }
> = {
  unpaid: {
    label: "Unpaid",
    className: "bg-destructive/10 text-destructive",
  },
  partial: {
    label: "Partially paid",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  paid: { label: "Paid", className: "bg-primary/10 text-primary" },
  refunded: { label: "Refunded", className: "text-muted-foreground" },
};

/** Shared payment-status-color mapping, mirroring `BookingStatusBadge`'s
 * pattern so the two badges read as one family wherever they appear
 * together on the booking detail page. */
export function PaymentStatusBadge({
  status,
}: {
  status: Booking["paymentStatus"];
}) {
  const meta = STATUS_META[status];

  return (
    <Badge variant="secondary" className={meta.className}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

export function paymentStatusLabel(status: Booking["paymentStatus"]): string {
  return STATUS_META[status].label;
}
