import type { NotificationLog, NotificationRule } from "@/lib/db/schema";

export const NOTIFICATION_EVENTS = [
  "booking_created",
  "booking_confirmed",
  "payment_received",
  "pickup_reminder",
  "pickup_today",
  "pickup_confirmed",
  "return_reminder",
  "return_due_today",
  "overdue_reminder",
  "booking_returned",
  "booking_cancelled",
  "staff_welcome",
  "owner_item_booked",
  "owner_item_cancelled",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export type NotificationLogStatus = NotificationLog["status"];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  booking_created: "Booking created",
  booking_confirmed: "Booking confirmed",
  payment_received: "Payment received",
  pickup_reminder: "Pickup reminder",
  pickup_today: "Pickup today",
  pickup_confirmed: "Pickup confirmed",
  return_reminder: "Return reminder",
  return_due_today: "Return due today",
  overdue_reminder: "Overdue reminder",
  booking_returned: "Booking returned",
  booking_cancelled: "Booking cancelled",
  staff_welcome: "Staff welcome",
  owner_item_booked: "Owner: item booked",
  owner_item_cancelled: "Owner: item cancelled",
};

export const DEFAULT_ENABLED_NOTIFICATION_EVENTS = new Set<NotificationEvent>([
  "booking_confirmed",
  "payment_received",
  "pickup_reminder",
  "return_reminder",
  "overdue_reminder",
  "booking_returned",
]);

export const NOTIFICATION_VARIABLES = [
  "customer_name",
  "booking_number",
  "product_name",
  "from_date",
  "to_date",
  "outstanding",
  "shop_name",
  "receipt_url",
  "payment_amount",
  "damage_charge",
  "deposit_refunded",
  "outlet_name",
  "staff_name",
  "owner_name",
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
