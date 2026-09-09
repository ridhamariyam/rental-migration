import type { Booking } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";

/**
 * Booking lifecycle state machine, ported from the legacy backend's
 * `app/core/booking_state.py` — status only ever moves through
 * `assertTransition()` here, never assigned directly by a route/service
 * (CLAUDE.md rule 6). Simplified to the new schema's enum values only (no
 * `pending`/`picked` legacy aliases — see `enums.ts`'s doc comment).
 *
 * Phase 11 only ever exercises `draft -> cancelled` itself (and editing a
 * still-`draft` booking's dates/pricing); the rest of this table exists so
 * Phases 12/13 don't have to touch this module at all when they start
 * writing `confirmed`/`pickup_pending`/`rented`/etc.
 */
export type BookingStatus = Booking["status"];

const ALLOWED_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  // `rented` is allowed straight from `draft` too — pickup itself always
  // re-checks the outstanding balance (with the counter's own "let them
  // take it anyway" override), so an item shouldn't have to wait on a
  // payment landing first just to be handed over.
  draft: ["confirmed", "rented", "cancelled"],
  confirmed: ["pickup_pending", "rented", "cancelled"],
  pickup_pending: ["rented", "confirmed", "cancelled"],
  rented: ["return_pending", "returned", "overdue"],
  return_pending: ["returned", "overdue"],
  overdue: ["returned", "return_pending"],
  returned: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly BookingStatus[] = [
  "returned",
  "cancelled",
];

/** Dates/pricing may only be edited before the item leaves the counter. */
export const EDITABLE_STATUSES: readonly BookingStatus[] = [
  "draft",
  "confirmed",
  "pickup_pending",
];

export function canTransition(
  current: BookingStatus,
  target: BookingStatus,
): boolean {
  if (current === target) return true;
  return ALLOWED_TRANSITIONS[current].includes(target);
}

export function assertTransition(
  current: BookingStatus,
  target: BookingStatus,
): BookingStatus {
  if (!canTransition(current, target)) {
    throw new AppError(
      `Cannot move a booking from '${current}' to '${target}'`,
      409,
    );
  }
  return target;
}

export function isTerminal(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isEditable(status: BookingStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/** Statuses that still hold a physical item against the availability
 * calendar — everything except `returned`/`cancelled`. */
export const BLOCKING_STATUSES: readonly BookingStatus[] = [
  "draft",
  "confirmed",
  "pickup_pending",
  "rented",
  "return_pending",
  "overdue",
];
