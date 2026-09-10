/**
 * RQ-10 regression: an item past its return date must actually reach
 * `overdue`.
 *
 * The status existed in the enum, the state machine, the reports'
 * `ACTIVE_STATUSES` and the reminder scan, but nothing ever wrote it — so
 * reminders went out while every report still read the item as `rented`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db, resetDatabase, seedShop, seedVariation, type Fixture } from "@/test/db";
import { bookingItems } from "@/lib/db/schema";
import { createBooking } from "@/server/bookings/service";
import {
  assertOverdueTransitionsAreValid,
  markOverdueItems,
} from "@/server/bookings/overdue";

type ItemStatus = typeof bookingItems.$inferSelect["status"];

const YESTERDAY = "2020-01-02";
const NEXT_YEAR = "2035-01-02";

async function itemWith(
  fixture: Fixture,
  status: ItemStatus,
  toDate: string,
): Promise<string> {
  const variation = await seedVariation(fixture, { quantity: 5 });
  const created = await createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [
      {
        variationId: variation.id,
        fromDate: "2035-01-01",
        toDate: "2035-01-05",
        quantity: "1",
      },
    ],
  } as Parameters<typeof createBooking>[1]);

  await db
    .update(bookingItems)
    .set({ status, toDate })
    .where(eq(bookingItems.id, created.items[0].id));

  return created.items[0].id;
}

async function statusOf(itemId: string): Promise<ItemStatus> {
  const [row] = await db
    .select({ status: bookingItems.status })
    .from(bookingItems)
    .where(eq(bookingItems.id, itemId))
    .limit(1);
  return row.status;
}

test("the state machine still permits the transitions the scan relies on", () => {
  assertOverdueTransitionsAreValid();
});

test("a rented item past its return date becomes overdue", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const item = await itemWith(fixture, "rented", YESTERDAY);

  const marked = await markOverdueItems();

  assert.equal(marked, 1);
  assert.equal(await statusOf(item), "overdue");
});

test("an item awaiting return past its date also becomes overdue", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const item = await itemWith(fixture, "return_pending", YESTERDAY);

  await markOverdueItems();
  assert.equal(await statusOf(item), "overdue");
});

test("an item still within its rental window is left alone", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const item = await itemWith(fixture, "rented", NEXT_YEAR);

  assert.equal(await markOverdueItems(), 0);
  assert.equal(await statusOf(item), "rented");
});

test("returned and cancelled items never become overdue", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const returned = await itemWith(fixture, "returned", YESTERDAY);
  const cancelled = await itemWith(fixture, "cancelled", YESTERDAY);

  await markOverdueItems();

  assert.equal(await statusOf(returned), "returned", "a returned item is finished");
  assert.equal(await statusOf(cancelled), "cancelled", "so is a cancelled one");
});

test("items never picked up are not marked overdue", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const draft = await itemWith(fixture, "draft", YESTERDAY);
  const confirmed = await itemWith(fixture, "confirmed", YESTERDAY);

  await markOverdueItems();

  assert.equal(await statusOf(draft), "draft");
  assert.equal(
    await statusOf(confirmed),
    "confirmed",
    "late to collect is not the same as late to return",
  );
});

test("the scan is idempotent — a second run marks nothing new", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await itemWith(fixture, "rented", YESTERDAY);

  assert.equal(await markOverdueItems(), 1);
  assert.equal(await markOverdueItems(), 0, "already overdue, nothing to do");
});

test("the scan covers every tenant in one pass", async () => {
  await resetDatabase();
  const shopA = await seedShop("A");
  const shopB = await seedShop("B");
  const a = await itemWith(shopA, "rented", YESTERDAY);
  const b = await itemWith(shopB, "rented", YESTERDAY);

  assert.equal(await markOverdueItems(), 2);
  const rows = await db
    .select({ id: bookingItems.id, status: bookingItems.status })
    .from(bookingItems)
    .where(inArray(bookingItems.id, [a, b]));

  assert.ok(rows.every((row) => row.status === "overdue"));
});
