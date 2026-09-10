import type { Booking, BookingItem } from "@/lib/db/schema";
import { isTerminal } from "@/lib/booking-state";

/**
 * The stage an *order* is at, derived from its items (RQ-18).
 *
 * `bookings.status` only ever holds `draft`/`confirmed`/`cancelled` — the
 * physical pickup/return lifecycle is per item, because one lehenga can
 * come back before another. That left no way for the order to say it was
 * finished: a booking whose only item had been returned, settled and sent
 * for cleaning still displayed "Confirmed", still offered "Add another
 * item" and "Cancel", and still headed its summary "Total due at pickup".
 *
 * Rather than add a fourth enum value that every write path would have to
 * remember to maintain, the finished state is *derived*. There is one
 * definition and it cannot drift from the items it describes.
 *
 * Deliberately a plain module (no `server-only`): the booking detail page,
 * the list row and the receipt all need the same answer.
 */
export type OrderStage =
  | "draft"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled";

type StageItem = Pick<BookingItem, "status">;

/** Items physically out with the customer. */
const OUT_WITH_CUSTOMER: readonly BookingItem["status"][] = [
  "rented",
  "return_pending",
  "overdue",
];

export function deriveOrderStage(
  order: Pick<Booking, "status">,
  items: StageItem[],
): OrderStage {
  if (order.status === "cancelled") return "cancelled";

  if (items.length === 0) return order.status === "draft" ? "draft" : "confirmed";

  // Every item finished, and at least one of them actually came back —
  // an order whose items were *all* cancelled is a cancellation, not a
  // completed rental, even when the order row itself was never cancelled.
  const allFinished = items.every((item) => isTerminal(item.status));
  if (allFinished) {
    return items.some((item) => item.status === "returned")
      ? "completed"
      : "cancelled";
  }

  if (items.some((item) => OUT_WITH_CUSTOMER.includes(item.status))) {
    return "active";
  }

  return order.status === "draft" ? "draft" : "confirmed";
}

/** Nothing more can be added to, cancelled from, or picked up on an order
 * that is over. */
export function isOrderClosed(stage: OrderStage): boolean {
  return stage === "completed" || stage === "cancelled";
}

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  active: "Out with customer",
  completed: "Completed",
  cancelled: "Cancelled",
};
