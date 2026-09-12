import type { NotificationLog, NotificationRule } from "@/lib/db/schema";

/**
 * The 10 events actually wired up, one per approved MSG91 template in
 * `template/*.json` (2026-09 rework). This is deliberately the *only*
 * source of truth the admin console/rules/dedup logic iterate — narrower
 * than `notificationEventEnum` in `src/lib/db/schema/enums.ts`, which
 * keeps a few now-unused legacy values only because Postgres enums can't
 * drop values without recreating the type. Adding an 11th template later
 * is: add the value to `notificationEventEnum` (migration), then add it
 * here + `NOTIFICATION_EVENT_LABELS`/`NOTIFICATION_EVENT_SCOPE` — the
 * console needs zero further changes, it iterates these arrays
 * generically.
 */
export const NOTIFICATION_EVENTS = [
  "booking_confirmed",
  "payment_received",
  "pickup_reminder",
  "pickup_confirmed",
  "return_reminder",
  "overdue_reminder",
  "booking_returned",
  "feedback_request",
  "owner_item_booked",
  "owner_item_cancelled",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export type NotificationLogStatus = NotificationLog["status"];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  booking_confirmed: "Booking confirmed",
  payment_received: "Payment received",
  pickup_reminder: "Pickup reminder (1 day before)",
  pickup_confirmed: "Item handed over",
  return_reminder: "Return reminder (1 day before)",
  overdue_reminder: "Return overdue alert",
  booking_returned: "Item returned",
  feedback_request: "Feedback / review request",
  owner_item_booked: "Owner: item booked",
  owner_item_cancelled: "Owner: item cancelled",
};

/**
 * "booking" = one send for the whole order (dedup keys on
 * `bookingId + event`); "item" = one send per `booking_items` row, since
 * a multi-item order's pickup/return dates differ per item (dedup keys on
 * `bookingId + event + bookingItemId`). See
 * `src/server/notifications/service.ts`'s `queueBookingNotification`.
 */
export const NOTIFICATION_EVENT_SCOPE: Record<
  NotificationEvent,
  "booking" | "item"
> = {
  booking_confirmed: "booking",
  payment_received: "booking",
  feedback_request: "booking",
  pickup_reminder: "item",
  pickup_confirmed: "item",
  return_reminder: "item",
  overdue_reminder: "item",
  booking_returned: "item",
  owner_item_booked: "item",
  owner_item_cancelled: "item",
};

export const DEFAULT_ENABLED_NOTIFICATION_EVENTS = new Set<NotificationEvent>([
  "booking_confirmed",
  "payment_received",
  "pickup_reminder",
  "pickup_confirmed",
  "return_reminder",
  "overdue_reminder",
  "booking_returned",
  "feedback_request",
  "owner_item_booked",
  "owner_item_cancelled",
]);

export const NOTIFICATION_VARIABLES = [
  "customer_name",
  "owner_name",
  "booking_number",
  //: One item's product name + size/color, e.g. "Lehanga (M, Red)" — see
  //: `formatItemLabel` in `src/server/notifications/service.ts`. Set on the
  //: item-scoped events (the pickup/return reminders).
  "item",
  //: *Every* line of the order, e.g. "Lehenga (M) x2, Sherwani" — set on
  //: the order-scoped events (booking confirmed, payment received), where
  //: a single `item` would misrepresent a multi-item booking.
  "items",
  "item_count",
  //: Alias of `outlet_name`, for templates that call it the branch.
  "branch",
  "rental_amount",
  "advance_paid",
  "balance_amount",
  "payment_amount",
  "pickup_date",
  "return_date",
  "booking_date",
  "outstanding",
  "damage_charge",
  "deposit_refunded",
  "outlet_name",
  "shop_name",
  "receipt_url",
] as const;

export type NotificationVariable = (typeof NOTIFICATION_VARIABLES)[number];

export function normalizeWhatsAppPhone(
  value: string,
  defaultCountryCode = "91",
): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 10) {
    throw new Error("WhatsApp number must include at least 10 digits");
  }

  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }

  return digits;
}

export function buildTemplateComponents(
  mapping: NotificationRule["variableMapping"],
  context: Record<string, string>,
): Record<string, { type: "text"; value: string }> {
  const components: Record<string, { type: "text"; value: string }> = {};

  for (const [slot, variable] of Object.entries(mapping ?? {})) {
    const value = context[variable] ?? "";
    if (slot.trim() && value) {
      components[slot] = { type: "text", value };
    }
  }

  return components;
}

export function notificationStatusTone(status: NotificationLogStatus) {
  if (status === "read" || status === "delivered" || status === "sent") {
    return "default";
  }
  if (status === "failed" || status === "cancelled") {
    return "destructive";
  }
  return "secondary";
}
