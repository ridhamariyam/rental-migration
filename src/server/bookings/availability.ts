import "server-only";

import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookingItems,
  bookings,
  productVariations,
  type BookingItem,
} from "@/lib/db/schema";
import { BLOCKING_STATUSES } from "@/lib/booking-state";
import { getMaintenanceBlockedQuantity } from "@/server/variations/capacity";
import { eachDayInclusive as eachDate } from "@/lib/date-range";

/**
 * Date-range availability for physical rental items, ported from the
 * legacy backend's `AvailabilityService`. Availability is never decided by
 * `ProductVariation.status` alone: an item is rentable for a window only
 * when its lifecycle state allows renting **and** the number of blocking
 * bookings overlapping that window, plus whatever's tied up in an open
 * maintenance/cleaning task, is below its `quantity` — one unit needing
 * repair no longer parks a whole 10-unit batch as unbookable.
 *
 * There is exactly **one** availability algorithm here (`computeCapacity`),
 * and every caller goes through it. It used to be two: a per-day peak
 * calculation for creating a booking, and a blunter "sum every overlapping
 * row" one behind the quote endpoint and the add/edit-item paths. The
 * blunt version double-counted bookings that overlapped the requested
 * window but not each other, so the quote endpoint told counter staff an
 * item was unavailable on dates the create endpoint would then happily
 * accept. Capacity is a per-day question, so it is answered per day.
 */

/** Statuses that block booking outright, regardless of `quantity` — the
 * item is either gone for good (`retired`) or not physically on-site
 * (`in_transfer`), so there's nothing to count units against. Every other
 * status (`available`/`rented`/`maintenance`/`needs_cleaning`/`cleaning`)
 * is capacity-checked instead: see `getMaintenanceBlockedQuantity`. */
export const HARD_BLOCKED_VARIATION_STATUSES: readonly string[] = [
  "retired",
  "in_transfer",
];

export const MAX_RENTAL_DAYS = 365;

/** Same "inferred from `db.transaction`'s own callback" shape used by the
 * other service modules — every function here runs either against the
 * pooled `db` or inside an open transaction. */
export type AvailabilityExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AvailabilityResult = {
  available: boolean;
  reason: string | null;
  conflictingBookingNumbers: string[];
};

export type CapacityRequest = {
  fromDate: string;
  toDate: string;
  quantity: number;
};

type VariationForAvailability = {
  id: string;
  status: string;
  isAvailable: boolean;
  quantity: number;
};

/** Inclusive day count for `[fromDate, toDate]` — an item returned on the
 * 18th is not handed to another customer the same day, so both ends count. */
export function validateDateRange(fromDate: string, toDate: string): number {
  if (toDate < fromDate) {
    throw new AppError("Return date cannot be before pickup date", 400, [
      { field: "toDate", message: "Return date cannot be before pickup date" },
    ]);
  }

  const totalDays =
    Math.round(
      (new Date(`${toDate}T00:00:00Z`).getTime() -
        new Date(`${fromDate}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;

  if (totalDays > MAX_RENTAL_DAYS) {
    throw new AppError(`A rental cannot exceed ${MAX_RENTAL_DAYS} days`, 400, [
      {
        field: "toDate",
        message: `A rental cannot exceed ${MAX_RENTAL_DAYS} days`,
      },
    ]);
  }

  return totalDays;
}

/**
 * Takes a row lock on each variation for the rest of the enclosing
 * transaction, so a concurrent booking for the same item queues behind
 * this one instead of reading the same "one unit free" and both
 * committing. Must be called *inside* a transaction and *before* the
 * capacity check that decides whether the booking fits.
 *
 * Locks in a stable id order: an order containing two items that another
 * request happens to list the other way round would otherwise be able to
 * grab one lock each and deadlock.
 */
export async function lockVariationsForUpdate(
  tx: AvailabilityExecutor,
  variationIds: string[],
): Promise<void> {
  const unique = [...new Set(variationIds)].sort();
  if (unique.length === 0) return;

  await tx
    .select({ id: productVariations.id })
    .from(productVariations)
    .where(inArray(productVariations.id, unique))
    .orderBy(productVariations.id)
    .for("update");
}

type CapacityOutcome = {
  fits: boolean;
  /** Physical units available across the whole window (stock minus
   * whatever is tied up in an open maintenance/cleaning task). */
  capacity: number;
  /** The highest single-day usage the requests would produce, existing
   * bookings included. */
  peakUsage: number;
  peakDay: string | null;
  /** Units still free on the worst day. Negative when over capacity. */
  remainingAtPeak: number;
  conflictingBookingNumbers: string[];
  blockedForRepair: number;
  /** Set when the variation can't be booked at all, whatever the dates. */
  hardBlockReason: string | null;
};

/**
 * The single authoritative capacity calculation. Sums how many units are
 * in use on **every day** any request covers — persisted blocking
 * bookings plus every request passed in — and compares the worst day
 * against the variation's own stock.
 *
 * Passing several requests at once is what lets one submission book two
 * lines of the same item with only partly overlapping dates: they are
 * measured together rather than each against the database alone.
 */
async function computeCapacity(
  executor: AvailabilityExecutor,
  variation: VariationForAvailability,
  requests: CapacityRequest[],
  excludeItemId?: string,
): Promise<CapacityOutcome> {
  const empty: CapacityOutcome = {
    fits: true,
    capacity: 0,
    peakUsage: 0,
    peakDay: null,
    remainingAtPeak: 0,
    conflictingBookingNumbers: [],
    blockedForRepair: 0,
    hardBlockReason: null,
  };

  if (requests.length === 0) return empty;

  if (HARD_BLOCKED_VARIATION_STATUSES.includes(variation.status)) {
    return {
      ...empty,
      fits: false,
      hardBlockReason: `Item is currently marked '${variation.status.replace("_", " ")}' and cannot be booked`,
    };
  }

  if (!variation.isAvailable) {
    return { ...empty, fits: false, hardBlockReason: "Item is withdrawn from rental" };
  }

  for (const request of requests) {
    validateDateRange(request.fromDate, request.toDate);
  }

  const { maintenanceQty, cleaningQty } = await getMaintenanceBlockedQuantity(
    variation.id,
    executor,
  );
  const blockedForRepair = maintenanceQty + cleaningQty;
  const capacity = Math.max(
    0,
    Math.max(1, variation.quantity || 1) - blockedForRepair,
  );

  const overallFrom = requests.reduce(
    (min, request) => (request.fromDate < min ? request.fromDate : min),
    requests[0].fromDate,
  );
  const overallTo = requests.reduce(
    (max, request) => (request.toDate > max ? request.toDate : max),
    requests[0].toDate,
  );

  const conditions = [
    eq(bookingItems.variationId, variation.id),
    inArray(
      bookingItems.status,
      BLOCKING_STATUSES as unknown as BookingItem["status"][],
    ),
    lte(bookingItems.fromDate, overallTo),
    gte(bookingItems.toDate, overallFrom),
  ];

  if (excludeItemId) {
    conditions.push(ne(bookingItems.id, excludeItemId));
  }

  const persisted = await executor
    .select({
      bookingNumber: bookings.bookingNumber,
      fromDate: bookingItems.fromDate,
      toDate: bookingItems.toDate,
      quantity: bookingItems.quantity,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .where(and(...conditions));

  const usageByDay = new Map<string, number>();
  const bookingsByDay = new Map<string, Set<string>>();

  for (const row of persisted) {
    for (const day of eachDate(row.fromDate, row.toDate)) {
      usageByDay.set(day, (usageByDay.get(day) ?? 0) + row.quantity);
      const forDay = bookingsByDay.get(day) ?? new Set<string>();
      forDay.add(row.bookingNumber);
      bookingsByDay.set(day, forDay);
    }
  }

  for (const request of requests) {
    for (const day of eachDate(request.fromDate, request.toDate)) {
      usageByDay.set(day, (usageByDay.get(day) ?? 0) + request.quantity);
    }
  }

  let peakDay: string | null = null;
  let peakUsage = 0;
  for (const [day, usage] of usageByDay) {
    if (usage > peakUsage) {
      peakUsage = usage;
      peakDay = day;
    }
  }

  const fits = peakUsage <= capacity;

  return {
    fits,
    capacity,
    peakUsage,
    peakDay,
    remainingAtPeak: capacity - peakUsage,
    // Only the bookings actually competing on the worst day are conflicts
    // worth naming — listing every row that merely touches the window is
    // what made the old message misleading.
    conflictingBookingNumbers: fits
      ? []
      : [...(peakDay ? (bookingsByDay.get(peakDay) ?? new Set<string>()) : new Set<string>())],
    blockedForRepair,
    hardBlockReason: null,
  };
}

function capacityReason(outcome: CapacityOutcome, requested: number): string {
  if (outcome.hardBlockReason) return outcome.hardBlockReason;

  const free = Math.max(0, outcome.capacity - (outcome.peakUsage - requested));

  // Name the actual cause. When maintenance/cleaning has taken the whole
  // stock out, "already booked for these dates" sends the counter looking
  // for a booking that does not exist.
  if (outcome.capacity <= 0 && outcome.blockedForRepair > 0) {
    return `Every unit of this item is in maintenance/cleaning (${outcome.blockedForRepair} unit(s))`;
  }

  const note =
    outcome.blockedForRepair > 0
      ? ` (${outcome.blockedForRepair} unit(s) currently in maintenance/cleaning)`
      : "";

  if (free <= 0) {
    return `Item is already booked for these dates${note}`;
  }
  return `Only ${free} unit(s) of this item are free for these dates${note}`;
}

/**
 * Read-only availability for one item over one date range — what the
 * quote endpoint and the availability endpoint answer with. Same
 * calculation as the write path, so the two can no longer disagree.
 */
export async function checkAvailability(
  variation: VariationForAvailability,
  fromDate: string,
  toDate: string,
  excludeItemId?: string,
  requestedQuantity: number = 1,
  executor: AvailabilityExecutor = db,
): Promise<AvailabilityResult> {
  validateDateRange(fromDate, toDate);

  const quantity = Math.max(1, requestedQuantity);
  const outcome = await computeCapacity(
    executor,
    variation,
    [{ fromDate, toDate, quantity }],
    excludeItemId,
  );

  if (outcome.fits) {
    return { available: true, reason: null, conflictingBookingNumbers: [] };
  }

  return {
    available: false,
    reason: capacityReason(outcome, quantity),
    conflictingBookingNumbers: outcome.conflictingBookingNumbers,
  };
}

/**
 * Throwing form of `checkAvailability` for a single line.
 *
 * Pass the transaction as `executor` (after `lockVariationsForUpdate`) on
 * any path that goes on to reserve stock — checking on the pooled handle
 * and writing in a transaction is what let concurrent requests oversell.
 */
export async function assertAvailable(
  variation: VariationForAvailability,
  fromDate: string,
  toDate: string,
  excludeItemId?: string,
  requestedQuantity: number = 1,
  executor: AvailabilityExecutor = db,
): Promise<void> {
  const result = await checkAvailability(
    variation,
    fromDate,
    toDate,
    excludeItemId,
    requestedQuantity,
    executor,
  );

  if (!result.available) {
    const detail = result.conflictingBookingNumbers.length
      ? `${result.reason} (conflicts with ${result.conflictingBookingNumbers.join(", ")})`
      : result.reason || "Item is not available for these dates";
    throw new AppError(detail, 409);
  }
}

/**
 * Capacity check for several requests against the *same* variation in one
 * atomic submission — a customer (or a group of them, e.g. several
 * friends of the groom all wanting the same size for the same wedding)
 * asking for more than one unit, possibly split across more than one cart
 * line with their own, only-partly-overlapping dates.
 *
 * Must run inside the transaction that writes the rows, after
 * `lockVariationsForUpdate`.
 */
export async function assertCapacityAvailable(
  executor: AvailabilityExecutor,
  variation: VariationForAvailability,
  requests: CapacityRequest[],
  excludeItemId?: string,
): Promise<void> {
  const outcome = await computeCapacity(
    executor,
    variation,
    requests,
    excludeItemId,
  );

  if (outcome.fits) return;

  if (outcome.hardBlockReason) {
    throw new AppError(outcome.hardBlockReason, 409);
  }

  throw new AppError(
    `Only ${outcome.capacity} unit(s) of this item exist, but ${outcome.peakUsage} would be needed on ${outcome.peakDay} — reduce the quantity or choose different dates`,
    409,
  );
}

