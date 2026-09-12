/**
 * The three booking messages, and when each one may leave.
 *
 * Confirming a booking used to fire the pickup and return reminders too:
 * they were queued at booking time with a `scheduledFor` derived from the
 * dates, so a booking taken inside the reminder window had a send time
 * already in the past and the dispatcher sent it immediately. These tests
 * pin down the replacement — reminders are queued by a dated scan on the
 * day they are due, and confirmation queues nothing but the confirmation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import {
  db,
  resetDatabase,
  seedShop,
  seedVariation,
  type Fixture,
} from "@/test/db";
import {
  notificationLogs,
  notificationRules,
  whatsappNumbers,
  whatsappTemplates,
} from "@/lib/db/schema";
import { createBooking } from "@/server/bookings/service";
import {
  ensureDefaultNotificationRules,
  queuePickupReminders,
  queueReturnReminders,
} from "@/server/notifications/service";

async function wireNotifications(fixture: Fixture): Promise<void> {
  await ensureDefaultNotificationRules(fixture.shopId);

  const [number] = await db
    .insert(whatsappNumbers)
    .values({
      shopId: fixture.shopId,
      integratedNumber: "919876543210",
      isDefault: true,
    })
    .returning();

  const [template] = await db
    .insert(whatsappTemplates)
    .values({
      shopId: fixture.shopId,
      whatsappNumberId: number.id,
      integratedNumber: number.integratedNumber,
      name: "booking_template",
      language: "en",
      status: "approved",
    })
    .returning();

  await db
    .update(notificationRules)
    .set({
      whatsappNumberId: number.id,
      templateId: template.id,
      isEnabled: true,
    })
    .where(eq(notificationRules.shopId, fixture.shopId));
}

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

type ReminderEvent =
  "booking_confirmed" | "pickup_reminder" | "return_reminder";

async function logsFor(bookingId: string, event: ReminderEvent) {
  return db
    .select({ id: notificationLogs.id, status: notificationLogs.status })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.bookingId, bookingId),
        eq(notificationLogs.event, event),
      ),
    );
}

/** A confirmed booking (an advance takes it out of draft) whose pickup and
 * return dates are `fromIn`/`toIn` days away. */
async function confirmedBooking(
  fixture: Fixture,
  fromIn: number,
  toIn: number,
) {
  const variation = await seedVariation(fixture, { quantity: 2 });
  return createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      {
        variationId: variation.id,
        fromDate: isoInDays(fromIn),
        toDate: isoInDays(toIn),
        quantity: "1",
      },
    ],
    advanceAmount: "500.00",
    advancePaymentMethod: "cash",
  } as Parameters<typeof createBooking>[1]);
}

test("confirming a booking queues the confirmation and nothing else", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  // Deliberately inside both reminder windows — the case that used to send
  // all three messages at once.
  const created = await confirmedBooking(fixture, 1, 2);

  assert.equal(created.booking.status, "confirmed");
  assert.equal(
    (await logsFor(created.booking.id, "booking_confirmed")).length,
    1,
  );
  assert.equal(
    (await logsFor(created.booking.id, "pickup_reminder")).length,
    0,
    "a pickup reminder must not be queued by confirming a booking",
  );
  assert.equal(
    (await logsFor(created.booking.id, "return_reminder")).length,
    0,
    "a return reminder must not be queued by confirming a booking",
  );
});

test("the pickup reminder is queued exactly two days before pickup", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const created = await confirmedBooking(fixture, 2, 5);

  // Three days out: not yet.
  await queuePickupReminders(new Date(Date.now() - 86_400_000));
  assert.equal(
    (await logsFor(created.booking.id, "pickup_reminder")).length,
    0,
    "three days before pickup is too early",
  );

  await queuePickupReminders();
  assert.equal(
    (await logsFor(created.booking.id, "pickup_reminder")).length,
    1,
    "two days before pickup is the day it goes out",
  );
});

test("the return reminder is queued exactly one day before return", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const created = await confirmedBooking(fixture, 1, 1);

  await queueReturnReminders(new Date(Date.now() - 86_400_000));
  assert.equal(
    (await logsFor(created.booking.id, "return_reminder")).length,
    0,
    "two days before the return is too early",
  );

  await queueReturnReminders();
  assert.equal(
    (await logsFor(created.booking.id, "return_reminder")).length,
    1,
  );
});

test("a reminder is queued once however often the scan runs", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const created = await confirmedBooking(fixture, 2, 3);

  // A cron on a 30s cadence hits this many times a day.
  await queuePickupReminders();
  await queuePickupReminders();
  await queuePickupReminders();

  assert.equal(
    (await logsFor(created.booking.id, "pickup_reminder")).length,
    1,
    "duplicate protection: one reminder per item per event",
  );
});

test("a booking taken inside the reminder window gets no late reminder", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  // Picked up tomorrow: the "two days before" day has already passed.
  const created = await confirmedBooking(fixture, 1, 4);

  await queuePickupReminders();

  assert.equal(
    (await logsFor(created.booking.id, "pickup_reminder")).length,
    0,
    "there is no day left on which this reminder is two days early",
  );
});

test("the confirmation carries the whole order, not just its number", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const created = await confirmedBooking(fixture, 6, 8);

  const [log] = await db
    .select({ payload: notificationLogs.payload })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.bookingId, created.booking.id),
        eq(notificationLogs.event, "booking_confirmed"),
      ),
    );

  const values =
    (log.payload as { context?: Record<string, string> }).context ?? {};
  for (const key of [
    "booking_number",
    "items",
    "rental_amount",
    "advance_paid",
    "balance_amount",
    "pickup_date",
    "return_date",
    "branch",
  ]) {
    assert.ok(values[key], `the confirmation context is missing ${key}`);
  }
  assert.equal(values.item_count, "1");
});

test("a booking collected the same day it is taken gets no pickup reminder", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  // Booked and collected today: the customer is standing at the counter.
  const created = await confirmedBooking(fixture, 0, 3);

  // Run the scan as if it were two days ago, which is the only day this
  // booking's pickup date could ever match on.
  await queuePickupReminders(new Date(Date.now() - 2 * 86_400_000));

  assert.equal(
    (await logsFor(created.booking.id, "pickup_reminder")).length,
    0,
    "same-day bookings are not reminded about their own pickup",
  );
});
