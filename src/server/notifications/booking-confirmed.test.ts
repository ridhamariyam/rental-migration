/**
 * RQ-07 regression: "Booking Confirmed" must not go out for a draft.
 *
 * `createBooking` queued `booking_confirmed` on both branches — including
 * the one where no advance was taken and the order stayed `draft`. The
 * customer was told their booking was confirmed before it was and before a
 * rupee had changed hands. It is now queued at the real
 * `draft -> confirmed` transition, wherever that happens.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";

import { db, resetDatabase, seedShop, seedVariation, type Fixture } from "@/test/db";
import {
  notificationLogs,
  notificationRules,
  whatsappNumbers,
  whatsappTemplates,
} from "@/lib/db/schema";
import { createBooking } from "@/server/bookings/service";
import { recordPayment } from "@/server/payments/service";
import { ensureDefaultNotificationRules } from "@/server/notifications/service";

/**
 * A rule only produces a log row once it has a number and a template, so
 * the shop has to be fully wired for these assertions to mean anything —
 * otherwise every case would pass by producing nothing at all.
 */
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
      name: "booking_confirmed",
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

async function confirmationsFor(bookingId: string): Promise<number> {
  const rows = await db
    .select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.bookingId, bookingId),
        eq(notificationLogs.event, "booking_confirmed"),
      ),
    );
  return rows.length;
}

async function bookWithoutAdvance(fixture: Fixture) {
  const variation = await seedVariation(fixture, { quantity: 2 });
  return createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      {
        variationId: variation.id,
        fromDate: "2030-11-01",
        toDate: "2030-11-03",
        quantity: "1",
      },
    ],
  } as Parameters<typeof createBooking>[1]);
}

test("a draft booking queues no confirmation", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const created = await bookWithoutAdvance(fixture);

  assert.equal(created.booking.status, "draft");
  assert.equal(
    await confirmationsFor(created.booking.id),
    0,
    "nothing is confirmed yet, so nothing should have been sent",
  );
});

test("the payment that confirms a draft is what queues the confirmation", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const created = await bookWithoutAdvance(fixture);
  assert.equal(await confirmationsFor(created.booking.id), 0);

  await recordPayment(fixture.admin, created.booking.id, {
    amount: "500.00",
    paymentType: "advance",
    paymentMethod: "cash",
  } as Parameters<typeof recordPayment>[2]);

  assert.equal(
    await confirmationsFor(created.booking.id),
    1,
    "queued at the real draft -> confirmed transition",
  );
});

test("a booking created with an advance is confirmed and notified once", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const variation = await seedVariation(fixture, { quantity: 2 });
  const created = await createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      {
        variationId: variation.id,
        fromDate: "2030-11-01",
        toDate: "2030-11-03",
        quantity: "1",
      },
    ],
    advanceAmount: "500.00",
    advancePaymentMethod: "cash",
  } as Parameters<typeof createBooking>[1]);

  assert.equal(created.booking.status, "confirmed");
  assert.equal(await confirmationsFor(created.booking.id), 1);
});

test("further payments on an already-confirmed booking do not re-confirm it", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await wireNotifications(fixture);

  const created = await bookWithoutAdvance(fixture);
  await recordPayment(fixture.admin, created.booking.id, {
    amount: "500.00",
    paymentType: "advance",
    paymentMethod: "cash",
  } as Parameters<typeof recordPayment>[2]);
  await recordPayment(fixture.admin, created.booking.id, {
    amount: "500.00",
    paymentType: "balance",
    paymentMethod: "cash",
  } as Parameters<typeof recordPayment>[2]);

  assert.equal(
    await confirmationsFor(created.booking.id),
    1,
    "one confirmation per booking, not one per payment",
  );
});

test("default notification rules survive concurrent seeding", async () => {
  await resetDatabase();
  const fixture = await seedShop();

  // Two requests for a shop with no rules yet both read an empty set and
  // both insert — they used to collide on the unique index and fail
  // whichever booking transaction was seeding them.
  await Promise.all([
    ensureDefaultNotificationRules(fixture.shopId),
    ensureDefaultNotificationRules(fixture.shopId),
    ensureDefaultNotificationRules(fixture.shopId),
  ]);

  const rows = await db
    .select({ event: notificationRules.event })
    .from(notificationRules)
    .where(eq(notificationRules.shopId, fixture.shopId));

  const unique = new Set(rows.map((row) => row.event));
  assert.equal(rows.length, unique.size, "no duplicate rules");
  assert.ok(rows.length > 0, "the defaults were actually seeded");
});
