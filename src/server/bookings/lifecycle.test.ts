/**
 * End-to-end money tests through the real services, against a real
 * database — the unit tests in `payments/settlement.test.ts` pin the
 * arithmetic, these pin the rows the services actually write.
 *
 * Covers RQ-01 (deposit applied to damage) and RQ-08 (cancelling a paid
 * booking must not strand the customer's money).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import {
  db,
  resetDatabase,
  seedShop,
  seedVariation,
  type Fixture,
} from "@/test/db";
import { bookings, payments, productVariations } from "@/lib/db/schema";
import {
  cancelBookingItem,
  cancelBookingOrder,
  createBooking,
} from "@/server/bookings/service";
import { confirmPickup, returnBooking } from "@/server/bookings/lifecycle";
import { recordPayment } from "@/server/payments/service";

async function bookAndPay(
  fixture: Fixture,
  options: {
    rentPrice?: string;
    deposit?: string;
    payRent?: string;
    payDeposit?: string;
  } = {},
) {
  const variation = await seedVariation(fixture, {
    quantity: 1,
    rentPrice: options.rentPrice ?? "3000.00",
  });

  const created = await createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      {
        variationId: variation.id,
        fromDate: "2030-09-11",
        toDate: "2030-09-13",
        quantity: "1",
      },
    ],
    securityDeposit: options.deposit ?? "2000.00",
  } as Parameters<typeof createBooking>[1]);

  if (options.payRent && options.payRent !== "0.00") {
    await recordPayment(fixture.admin, created.booking.id, {
      amount: options.payRent,
      paymentType: "advance",
      paymentMethod: "cash",
    } as Parameters<typeof recordPayment>[2]);
  }
  if (options.payDeposit && options.payDeposit !== "0.00") {
    await recordPayment(fixture.admin, created.booking.id, {
      amount: options.payDeposit,
      paymentType: "security_deposit",
      paymentMethod: "cash",
    } as Parameters<typeof recordPayment>[2]);
  }

  return { variation, booking: created.booking, item: created.items[0] };
}

async function ledger(bookingId: string) {
  const rows = await db
    .select({ type: payments.paymentType, amount: payments.amount })
    .from(payments)
    .where(eq(payments.bookingId, bookingId));
  return rows;
}

function totalOf(rows: { type: string; amount: string }[], type: string): number {
  return rows
    .filter((r) => r.type === type)
    .reduce((sum, r) => sum + Number(r.amount), 0);
}

test("RQ-01 end to end: damage over the deposit leaves only the shortfall owed", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { variation, booking, item } = await bookAndPay(fixture, {
    payRent: "3000.00",
    payDeposit: "2000.00",
  });

  const fresh = await db
    .select()
    .from(productVariations)
    .where(eq(productVariations.id, variation.id))
    .limit(1);

  await confirmPickup(fixture.admin, booking.id, item.id, {
    barcode: fresh[0].barcode,
    paymentMethod: "cash",
    allowPendingBalance: true,
  } as Parameters<typeof confirmPickup>[3]);

  const { summary } = await returnBooking(fixture.admin, booking.id, item.id, {
    returnCondition: "major_damage",
    damageCharge: "5000.00",
    damageNotes: "Torn zari",
    cleaningRequired: true,
    maintenanceRequired: true,
    refundMethod: "cash",
  } as Parameters<typeof returnBooking>[3]);

  assert.equal(summary.rentPayable, "8000.00", "rent 3000 + damage 5000");
  assert.equal(summary.depositAppliedToDamage, "2000.00");
  assert.equal(summary.depositReturned, "0.00");
  assert.equal(summary.depositHeld, "0.00");
  assert.equal(
    summary.outstanding,
    "3000.00",
    "only the damage the deposit did not cover",
  );

  const rows = await ledger(booking.id);
  assert.equal(totalOf(rows, "deposit_applied"), 2000, "one deposit_applied row");
  assert.equal(
    totalOf(rows, "deposit_release"),
    0,
    "nothing was handed back, so nothing is a release",
  );

  // The reconciliation the audit failed: cash in + still owed == the bill.
  const cashIn = totalOf(rows, "advance") + totalOf(rows, "security_deposit");
  assert.equal(cashIn + Number(summary.outstanding), 8000);
});

test("RQ-01 end to end: damage under the deposit returns the remainder", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { variation, booking, item } = await bookAndPay(fixture, {
    payRent: "3000.00",
    payDeposit: "2000.00",
  });

  const fresh = await db
    .select()
    .from(productVariations)
    .where(eq(productVariations.id, variation.id))
    .limit(1);

  await confirmPickup(fixture.admin, booking.id, item.id, {
    barcode: fresh[0].barcode,
    paymentMethod: "cash",
    allowPendingBalance: true,
  } as Parameters<typeof confirmPickup>[3]);

  const { summary } = await returnBooking(fixture.admin, booking.id, item.id, {
    returnCondition: "minor_damage",
    damageCharge: "500.00",
    cleaningRequired: false,
    maintenanceRequired: false,
    refundMethod: "cash",
  } as Parameters<typeof returnBooking>[3]);

  assert.equal(summary.depositAppliedToDamage, "500.00");
  assert.equal(summary.depositReturned, "1500.00", "the rest goes back");
  assert.equal(summary.depositHeld, "0.00");
  assert.equal(summary.outstanding, "0.00", "the deposit covered the damage");
});

test("RQ-08: cancelling an unpaid booking writes no refund", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { booking } = await bookAndPay(fixture);

  const cancelled = await cancelBookingOrder(
    fixture.admin,
    booking.id,
    "Customer changed their mind",
  );

  assert.equal(cancelled.status, "cancelled");
  const rows = await ledger(booking.id);
  assert.equal(rows.length, 0, "nothing was ever collected, so nothing is owed back");
  assert.equal(cancelled.paymentStatus, "unpaid");
});

test("RQ-08: cancelling a fully paid booking refunds the rent and returns the deposit", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { booking } = await bookAndPay(fixture, {
    payRent: "3000.00",
    payDeposit: "2000.00",
  });

  await cancelBookingOrder(fixture.admin, booking.id, "Event called off");

  const rows = await ledger(booking.id);
  assert.equal(
    totalOf(rows, "deposit_release"),
    2000,
    "the deposit must be handed back",
  );
  assert.equal(
    totalOf(rows, "refund"),
    3000,
    "the rent already paid must be refunded",
  );

  const [after] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, booking.id))
    .limit(1);

  assert.notEqual(
    after.paymentStatus,
    "paid",
    "a cancelled, refunded booking is not 'paid'",
  );

  const cashIn = totalOf(rows, "advance") + totalOf(rows, "security_deposit");
  const cashOut = totalOf(rows, "refund") + totalOf(rows, "deposit_release");
  assert.equal(cashIn - cashOut, 0, "the customer is square");
});

test("RQ-08: cancelling a partially paid booking refunds only what was taken", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { booking } = await bookAndPay(fixture, { payRent: "1000.00" });

  await cancelBookingOrder(fixture.admin, booking.id, "Double booked");

  const rows = await ledger(booking.id);
  assert.equal(totalOf(rows, "refund"), 1000);
  assert.equal(totalOf(rows, "deposit_release"), 0, "no deposit was ever taken");
});

test("RQ-08: cancelling a deposit-only booking returns the deposit", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { booking } = await bookAndPay(fixture, { payDeposit: "2000.00" });

  await cancelBookingOrder(fixture.admin, booking.id, "Item unavailable");

  const rows = await ledger(booking.id);
  assert.equal(totalOf(rows, "deposit_release"), 2000);
  assert.equal(totalOf(rows, "refund"), 0, "no rent had been paid");
});

test("RQ-08: settlement is idempotent — a second cancel cannot double-refund", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { booking } = await bookAndPay(fixture, {
    payRent: "3000.00",
    payDeposit: "2000.00",
  });

  await cancelBookingOrder(fixture.admin, booking.id, "Event called off");
  await assert.rejects(
    () => cancelBookingOrder(fixture.admin, booking.id, "again"),
    /already cancelled/i,
  );

  const rows = await ledger(booking.id);
  assert.equal(totalOf(rows, "refund"), 3000, "still just the one refund");
  assert.equal(totalOf(rows, "deposit_release"), 2000);
});

test("RQ-08: a cancellation reason is required", async () => {
  const { cancelBookingSchema } = await import("@/lib/validation/bookings");
  assert.equal(cancelBookingSchema.safeParse({}).success, false);
  assert.equal(cancelBookingSchema.safeParse({ reason: "  " }).success, false);
  assert.equal(
    cancelBookingSchema.safeParse({ reason: "Customer cancelled" }).success,
    true,
  );
});

test("RQ-08: cancelling the last live item settles the order's money too", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const { booking, item } = await bookAndPay(fixture, {
    payRent: "3000.00",
    payDeposit: "2000.00",
  });

  await cancelBookingItem(
    fixture.admin,
    booking.id,
    item.id,
    "Only item withdrawn",
  );

  const rows = await ledger(booking.id);
  assert.equal(totalOf(rows, "deposit_release"), 2000);
  assert.equal(totalOf(rows, "refund"), 3000);
});

test("an item cancelled while a sibling is still live does not refund the order", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const first = await seedVariation(fixture, { quantity: 1, rentPrice: "1000.00" });
  const second = await seedVariation(fixture, { quantity: 1, rentPrice: "2000.00" });

  const created = await createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      { variationId: first.id, fromDate: "2030-09-11", toDate: "2030-09-12", quantity: "1" },
      { variationId: second.id, fromDate: "2030-09-11", toDate: "2030-09-12", quantity: "1" },
    ],
    securityDeposit: "1000.00",
  } as Parameters<typeof createBooking>[1]);

  await recordPayment(fixture.admin, created.booking.id, {
    amount: "3000.00",
    paymentType: "advance",
    paymentMethod: "cash",
  } as Parameters<typeof recordPayment>[2]);

  await cancelBookingItem(
    fixture.admin,
    created.booking.id,
    created.items[0].id,
    "Customer dropped one item",
  );

  const rows = await ledger(created.booking.id);
  assert.equal(
    totalOf(rows, "deposit_release"),
    0,
    "the order is still live, so the deposit stays held",
  );
});
