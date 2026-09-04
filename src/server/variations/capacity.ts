import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { bookings, maintenanceTasks, type MaintenanceTask } from "@/lib/db/schema";

/** Same "inferred from `db.transaction`'s own callback" shape used
 * elsewhere (`MaintenanceTx`/`PaymentTx`) — lets every helper here run
 * either against the plain `db` or inside an open transaction. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const OPEN_TASK_STATUSES: MaintenanceTask["status"][] = ["pending", "in_progress"];

export type MaintenanceBlockedQuantity = {
  /** Units tied up in an open repair task. */
  maintenanceQty: number;
  /** Units tied up in an open cleaning task (pending or started). */
  cleaningQty: number;
  /** Whether any of the open cleaning tasks has actually been started —
   * used only to pick `cleaning` vs. `needs_cleaning` for display. */
  cleaningInProgress: boolean;
};

/**
 * How many of a variation's total `quantity` identical units are
 * currently tied up in an open maintenance/cleaning task — a single
 * `productVariations` row can represent several physical units (see
 * `bookings.quantity`'s doc comment), but a maintenance task is opened
 * per *return*, not per unit, so a task raised from a booking counts for
 * that booking's own `quantity`; one raised by hand (no linked booking)
 * counts as a single unit, since there's nothing else to read a count
 * off of.
 */
export async function getMaintenanceBlockedQuantity(
  variationId: string,
  executor: Executor = db,
): Promise<MaintenanceBlockedQuantity> {
  const rows = await executor
    .select({
      taskType: maintenanceTasks.taskType,
      taskStatus: maintenanceTasks.status,
      bookingQuantity: bookings.quantity,
    })
    .from(maintenanceTasks)
    .leftJoin(bookings, eq(maintenanceTasks.bookingId, bookings.id))
    .where(
      and(
        eq(maintenanceTasks.variationId, variationId),
        inArray(maintenanceTasks.status, OPEN_TASK_STATUSES),
      ),
    );

  let maintenanceQty = 0;
  let cleaningQty = 0;
  let cleaningInProgress = false;

  for (const row of rows) {
    const qty = row.bookingQuantity ?? 1;
    if (row.taskType === "maintenance") {
      maintenanceQty += qty;
    } else {
      cleaningQty += qty;
      if (row.taskStatus === "in_progress") cleaningInProgress = true;
    }
  }

  return { maintenanceQty, cleaningQty, cleaningInProgress };
}

/** How many units of this variation are physically out with a customer
 * right now (picked up, not yet returned) — the same "sum `quantity`
 * across rows" every other capacity check in this codebase uses. */
export async function getRentedOutQuantity(
  variationId: string,
  executor: Executor = db,
): Promise<number> {
  const rows = await executor
    .select({ quantity: bookings.quantity })
    .from(bookings)
    .where(and(eq(bookings.variationId, variationId), eq(bookings.status, "rented")));

  return rows.reduce((sum, row) => sum + row.quantity, 0);
}
