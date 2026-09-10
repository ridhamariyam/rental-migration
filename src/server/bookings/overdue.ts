import "server-only";

import { and, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bookingItems } from "@/lib/db/schema";
import { canTransition } from "@/lib/booking-state";
import { toDateString } from "@/lib/format";

/**
 * Moves items whose return date has passed into `overdue` (RQ-10).
 *
 * `overdue` existed in the enum, in the state machine, in the reports'
 * `ACTIVE_STATUSES` and in the overdue-reminder scan — but nothing ever
 * wrote it, so an item three weeks late still read `rented` and no report
 * could tell late from current. Reminders went out while the status never
 * moved.
 *
 * Driven by the same cron tick as the reminders (see
 * `dispatchDueNotifications`) so the two can never disagree about which
 * items are late.
 *
 * Only `rented` and `return_pending` are promoted: those are the states
 * where the customer physically has the item. `returned` and `cancelled`
 * are terminal and must never become overdue; `draft`/`confirmed`/
 * `pickup_pending` were never picked up, so they are late to *collect*,
 * not late to return.
 */
const OVERDUE_ELIGIBLE_STATUSES = ["rented", "return_pending"] as const;

export async function markOverdueItems(now = new Date()): Promise<number> {
  const today = toDateString(now);

  const updated = await db
    .update(bookingItems)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        inArray(bookingItems.status, [...OVERDUE_ELIGIBLE_STATUSES]),
        lt(bookingItems.toDate, today),
      ),
    )
    .returning({ id: bookingItems.id });

  return updated.length;
}

/** Both eligible statuses must actually be allowed to reach `overdue` —
 * a state-machine change that broke this would otherwise only show up as
 * items silently never being marked late. */
export function assertOverdueTransitionsAreValid(): void {
  for (const status of OVERDUE_ELIGIBLE_STATUSES) {
    if (!canTransition(status, "overdue")) {
      throw new Error(
        `booking-state no longer allows '${status}' -> 'overdue'; markOverdueItems would silently stop working`,
      );
    }
  }
}

export { OVERDUE_ELIGIBLE_STATUSES };
