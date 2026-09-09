import { Badge } from "@/components/ui/badge";
import type { BookingItem } from "@/lib/db/schema";

type ReturnCondition = NonNullable<BookingItem["returnCondition"]>;

const CONDITION_META: Record<ReturnCondition, { label: string; className: string }> = {
  good: { label: "Good", className: "bg-primary/10 text-primary" },
  minor_damage: {
    label: "Minor damage",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  major_damage: {
    label: "Major damage",
    className: "bg-destructive/10 text-destructive",
  },
};

/** Shared return-condition-color mapping, mirroring `BookingStatusBadge`/
 * `PaymentStatusBadge`'s pattern. */
export function ReturnConditionBadge({
  condition,
}: {
  condition: ReturnCondition;
}) {
  const meta = CONDITION_META[condition];

  return (
    <Badge variant="secondary" className={meta.className}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}
