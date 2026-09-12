import "server-only";

import { after } from "next/server";

import { dispatchNotificationsForBooking } from "@/server/notifications/service";

/**
 * Sends a booking's freshly-queued WhatsApp messages as soon as the
 * response is out, so a customer isn't waiting on the next cron tick.
 *
 * `after` is what makes this safe: notifications are queued *inside* the
 * booking/payment transaction, so dispatching inline would risk sending a
 * message for a booking whose transaction then rolls back. Running after
 * the response guarantees the commit has landed, and keeps MSG91's latency
 * off the request path.
 *
 * This is an optimisation, never the delivery guarantee — anything that
 * fails or is scheduled for later is still picked up by
 * `dispatchDueNotifications` via the cron worker.
 *
 * Takes the **booking** id, never a booking *item* id: notifications are
 * claimed per order (`dispatchNotificationsForBooking`). Six of the eight
 * call sites used to hand it the item ids they happened to have on hand,
 * which matched nothing — so a just-placed order's "Booking confirmed"
 * message sat queued until the next cron tick instead of going out with
 * the response. The single-id signature is what keeps that mistake from
 * being expressible.
 */
export function dispatchAfterResponse(bookingId: string): void {
  after(async () => {
    try {
      await dispatchNotificationsForBooking(bookingId);
    } catch (error) {
      console.error(
        `[notifications] immediate dispatch for booking ${bookingId} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  });
}
