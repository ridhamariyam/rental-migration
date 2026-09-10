/**
 * RQ-03 regression: revenue reports must not count drafts or
 * cancellations.
 *
 * The audit's shop had one real ₹3,000 rental and reported ₹51,000,
 * because eight abandoned drafts and one cancelled booking were being
 * summed as revenue — and the dashboard put that all-time figure next to
 * a 14-day cash figure with both labelled "Revenue".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db, resetDatabase, seedShop, seedVariation, type Fixture } from "@/test/db";
import { bookingItems, bookings } from "@/lib/db/schema";
import { createBooking } from "@/server/bookings/service";
import {
  getMostRentedProducts,
  getRevenueByOutlet,
  getStaffPerformance,
} from "@/server/reports/service";

type ItemStatus = typeof bookingItems.$inferSelect["status"];

/** Creates a booking and forces its item (and order) into `status` — the
 * lifecycle services will not let us reach every state directly, and what
 * matters here is what the aggregates do with each stored value. */
async function bookWithStatus(
  fixture: Fixture,
  status: ItemStatus,
  rent: string,
  dates: [string, string] = ["2030-01-05", "2030-01-06"],
) {
  const variation = await seedVariation(fixture, { quantity: 5, rentPrice: rent });
  const created = await createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      {
        variationId: variation.id,
        fromDate: dates[0],
        toDate: dates[1],
        quantity: "1",
      },
    ],
  } as Parameters<typeof createBooking>[1]);

  await db
    .update(bookingItems)
    .set({ status })
    .where(eq(bookingItems.id, created.items[0].id));

  const orderStatus =
    status === "cancelled" ? "cancelled" : status === "draft" ? "draft" : "confirmed";
  await db
    .update(bookings)
    .set({ status: orderStatus })
    .where(eq(bookings.id, created.booking.id));

  return created;
}

/** One shop containing exactly one of each status, at a distinct price so
 * a wrong total names the culprit. */
async function seedOneOfEachStatus(): Promise<Fixture> {
  const fixture = await seedShop();
  await bookWithStatus(fixture, "draft", "1000.00");
  await bookWithStatus(fixture, "confirmed", "2000.00");
  await bookWithStatus(fixture, "rented", "4000.00");
  await bookWithStatus(fixture, "returned", "8000.00");
  await bookWithStatus(fixture, "cancelled", "16000.00");
  return fixture;
}

// confirmed 2000 + rented 4000 + returned 8000
const EARNED_TOTAL = "14000.00";

test("revenue by outlet counts only earned bookings", async () => {
  await resetDatabase();
  const fixture = await seedOneOfEachStatus();

  const rows = await getRevenueByOutlet(fixture.admin, {} as never);
  const total = rows.reduce((sum, row) => sum + Number(row.revenue), 0);

  assert.equal(
    total.toFixed(2),
    EARNED_TOTAL,
    "draft (1000) and cancelled (16000) must be excluded",
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.bookingCount, 0),
    3,
    "three earned items, not five",
  );
});

test("most rented counts only earned bookings", async () => {
  await resetDatabase();
  const fixture = await seedOneOfEachStatus();

  const rows = await getMostRentedProducts(fixture.admin, { limit: 10 } as never);
  const total = rows.reduce((sum, row) => sum + Number(row.revenue), 0);
  const rentals = rows.reduce((sum, row) => sum + row.rentalCount, 0);

  assert.equal(total.toFixed(2), EARNED_TOTAL);
  assert.equal(rentals, 3, "a draft is not a rental and neither is a cancellation");
});

test("staff performance credits only earned orders", async () => {
  await resetDatabase();
  const fixture = await seedOneOfEachStatus();

  const rows = await getStaffPerformance(fixture.admin, {} as never);
  const bookingCount = rows.reduce((sum, row) => sum + row.bookingCount, 0);

  assert.equal(
    bookingCount,
    3,
    "the draft and the cancelled order must not be credited to anyone",
  );
});

test("a shop with nothing but drafts and cancellations reports zero revenue", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await bookWithStatus(fixture, "draft", "5000.00");
  await bookWithStatus(fixture, "draft", "5000.00");
  await bookWithStatus(fixture, "cancelled", "5000.00");

  const rows = await getRevenueByOutlet(fixture.admin, {} as never);
  const total = rows.reduce((sum, row) => sum + Number(row.revenue), 0);

  assert.equal(total, 0, "nothing here has been earned");
});

test("an overdue item still counts as earned revenue", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await bookWithStatus(fixture, "overdue", "2500.00");

  const rows = await getRevenueByOutlet(fixture.admin, {} as never);
  const total = rows.reduce((sum, row) => sum + Number(row.revenue), 0);

  assert.equal(
    total.toFixed(2),
    "2500.00",
    "late does not mean unearned — the item is out with the customer",
  );
});

test("reports never leak another tenant's revenue", async () => {
  await resetDatabase();
  const shopA = await seedShop("Shop A");
  const shopB = await seedShop("Shop B");
  await bookWithStatus(shopA, "returned", "1000.00");
  await bookWithStatus(shopB, "returned", "9000.00");

  const rowsA = await getRevenueByOutlet(shopA.admin, {} as never);
  const totalA = rowsA.reduce((sum, row) => sum + Number(row.revenue), 0);
  assert.equal(totalA.toFixed(2), "1000.00");

  const rowsB = await getMostRentedProducts(shopB.admin, { limit: 10 } as never);
  const totalB = rowsB.reduce((sum, row) => sum + Number(row.revenue), 0);
  assert.equal(totalB.toFixed(2), "9000.00");
});
