import "server-only";

import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { bookingItems, bookings, type BookingItem } from "@/lib/db/schema";
import { BLOCKING_STATUSES } from "@/lib/booking-state";
import { getMaintenanceBlockedQuantity } from "@/server/variations/capacity";

/**
 * Date-range availability for physical rental items, ported from the
 * legacy backend's `AvailabilityService`. Availability is never decided by
 * `ProductVariation.status` alone: an item is rentable for a window only
 * when its lifecycle state allows renting **and** the number of blocking
 * bookings overlapping that window, plus whatever's tied up in an open
 * maintenance/cleaning task, is below its `quantity` — one unit needing
 * repair no longer parks a whole 10-unit batch as unbookable.
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

export type AvailabilityResult = {
  available: boolean;
  reason: string | null;
  conflictingBookingNumbers: string[];
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

type VariationForAvailability = {
  id: string;
  status: string;
  isAvailable: boolean;
  quantity: number;
};

async function overlappingBookings(
  variationId: string,
  fromDate: string,
  toDate: string,
  excludeItemId?: string,
): Promise<{ bookingNumber: string; quantity: number }[]> {
  const conditions = [
    eq(bookingItems.variationId, variationId),
    inArray(
      bookingItems.status,
      BLOCKING_STATUSES as unknown as BookingItem["status"][],
    ),
    lte(bookingItems.fromDate, toDate),
    gte(bookingItems.toDate, fromDate),
  ];

  if (excludeItemId) {
    conditions.push(ne(bookingItems.id, excludeItemId));
  }

  return db
    .select({
      bookingNumber: bookings.bookingNumber,
      quantity: bookingItems.quantity,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .where(and(...conditions));
}

export async function checkAvailability(
  variation: VariationForAvailability,
  fromDate: string,
  toDate: string,
  excludeItemId?: string,
  requestedQuantity: number = 1,
): Promise<AvailabilityResult> {
  validateDateRange(fromDate, toDate);

  if (HARD_BLOCKED_VARIATION_STATUSES.includes(variation.status)) {
    return {
      available: false,
      reason: `Item is currently marked '${variation.status.replace("_", " ")}' and cannot be booked`,
      conflictingBookingNumbers: [],
    };
  }

  if (!variation.isAvailable) {
    return {
      available: false,
      reason: "Item is withdrawn from rental",
      conflictingBookingNumbers: [],
    };
  }

  const conflicts = await overlappingBookings(
    variation.id,
    fromDate,
    toDate,
    excludeItemId,
  );

  const { maintenanceQty, cleaningQty } =
    await getMaintenanceBlockedQuantity(variation.id);
  const capacity = Math.max(
    0,
    Math.max(1, variation.quantity || 1) - maintenanceQty - cleaningQty,
  );
  const conflictingQuantity = conflicts.reduce(
    (sum, conflict) => sum + conflict.quantity,
    0,
  );
  const remaining = capacity - conflictingQuantity;

  // `requestedQuantity` lets one booking ask for several identical units
  // at once (e.g. the same size booked for several friends attending the
  // same wedding) — it's still available only when *all* of them fit
  // within what's left of the physical stock for these dates.
  if (remaining < Math.max(1, requestedQuantity)) {
    const blockedForRepair = maintenanceQty + cleaningQty;
    const note =
      blockedForRepair > 0
        ? ` (${blockedForRepair} unit(s) currently in maintenance/cleaning)`
        : "";
    return {
      available: false,
      reason:
        remaining <= 0
          ? `Item is already booked for these dates${note}`
          : `Only ${remaining} unit(s) of this item are free for these dates${note}`,
      conflictingBookingNumbers: conflicts.map((conflict) => conflict.bookingNumber),
    };
  }

  return { available: true, reason: null, conflictingBookingNumbers: [] };
}

export async function assertAvailable(
  variation: VariationForAvailability,
  fromDate: string,
  toDate: string,
  excludeItemId?: string,
  requestedQuantity: number = 1,
): Promise<void> {
  const result = await checkAvailability(
    variation,
    fromDate,
    toDate,
    excludeItemId,
    requestedQuantity,
  );

  if (!result.available) {
    const detail = result.conflictingBookingNumbers.length
      ? `${result.reason} (conflicts with ${result.conflictingBookingNumbers.join(", ")})`
      : result.reason || "Item is not available for these dates";
    throw new AppError(detail, 409);
  }
}

export type CapacityRequest = {
  fromDate: string;
  toDate: string;
  quantity: number;
};

/** One calendar day per step between two inclusive `YYYY-MM-DD` bounds. */
function* eachDate(fromDate: string, toDate: string): Generator<string> {
  let cursor = fromDate;
  while (cursor <= toDate) {
    yield cursor;
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
}

/**
 * Capacity check for **several** requests against the *same* variation in
 * one atomic booking submission — the case a single `checkAvailability`
 * call can't see: a customer (or a group of them, e.g. several friends of
 * the groom all wanting the same size for the same wedding) asking for
 * more than one unit, possibly split across more than one cart line with
 * their own, only-partly-overlapping dates. Rather than rejecting *any*
 * second line that touches the same variation (the old, blunter rule),
 * this sums how many units would be in use on every day any request
 * covers — existing persisted bookings plus every request passed in here
 * — and only fails if that ever exceeds the variation's own `quantity`.
 */
export async function assertCapacityAvailable(
  variation: VariationForAvailability,
  requests: CapacityRequest[],
  excludeItemId?: string,
): Promise<void> {
  if (requests.length === 0) return;

  if (HARD_BLOCKED_VARIATION_STATUSES.includes(variation.status)) {
    throw new AppError(
      `Item is currently marked '${variation.status.replace("_", " ")}' and cannot be booked`,
      409,
    );
  }

  if (!variation.isAvailable) {
    throw new AppError("Item is withdrawn from rental", 409);
  }

  for (const request of requests) {
    validateDateRange(request.fromDate, request.toDate);
  }

  const { maintenanceQty, cleaningQty } =
    await getMaintenanceBlockedQuantity(variation.id);
  const capacity = Math.max(
    0,
    Math.max(1, variation.quantity || 1) - maintenanceQty - cleaningQty,
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

  const persisted = await db
    .select({
      fromDate: bookingItems.fromDate,
      toDate: bookingItems.toDate,
      quantity: bookingItems.quantity,
    })
    .from(bookingItems)
    .where(and(...conditions));

  const usageByDay = new Map<string, number>();
  for (const row of persisted) {
    for (const day of eachDate(row.fromDate, row.toDate)) {
      usageByDay.set(day, (usageByDay.get(day) ?? 0) + row.quantity);
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

  if (peakUsage > capacity) {
    throw new AppError(
      `Only ${capacity} unit(s) of this item exist, but ${peakUsage} would be needed on ${peakDay} — reduce the quantity or choose different dates`,
      409,
    );
  }
}
