import { Badge } from "@/components/ui/badge";
import { ORDER_STAGE_LABEL, type OrderStage } from "@/lib/order-stage";

/**
 * The order's derived stage (see `lib/order-stage.ts`), as distinct from
 * `BookingStatusBadge`, which shows one *item's* physical status. An
 * order can be "Completed" while `bookings.status` still reads
 * `confirmed`, because the finished state is derived from the items
 * rather than stored.
 */
const STAGE_CLASS: Record<OrderStage, string> = {
  draft: "text-muted-foreground",
  confirmed: "bg-primary/10 text-primary",
  active: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-destructive/10 text-destructive",
};

export function OrderStageBadge({ stage }: { stage: OrderStage }) {
  return (
    <Badge variant="secondary" className={STAGE_CLASS[stage]}>
      {ORDER_STAGE_LABEL[stage]}
    </Badge>
  );
}
