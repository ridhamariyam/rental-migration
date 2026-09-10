/**
 * RQ-05 regression: the quote endpoint and the create-booking path must
 * agree, because they must use the same algorithm.
 *
 * Before the fix there were two. `assertCapacityAvailable` measured peak
 * usage per day; `checkAvailability` summed the quantity of every booking
 * that overlapped the requested window, whether or not those bookings
 * overlapped *each other*. The blunt one is what the quote endpoint, the
 * add-item path and the edit-item path used, so staff were told an item
 * was unavailable on dates the create endpoint would then accept.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  db,
  resetDatabase,
  seedShop,
  seedVariation,
  type Fixture,
} from "@/test/db";
import { checkAvailability } from "@/server/bookings/availability";
import { createBooking, quoteBooking } from "@/server/bookings/service";
import { maintenanceTasks, productVariations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function book(
  fixture: Fixture,
  variationId: string,
  fromDate: string,
  toDate: string,
  quantity = "1",
) {
  return createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [{ variationId, fromDate, toDate, quantity }],
  } as Parameters<typeof createBooking>[1]);
}

function variationFor(row: typeof productVariations.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    isAvailable: row.isAvailable,
    quantity: row.quantity,
  };
}

test("the audit's exact mismatch: two non-overlapping bookings no longer block a spanning one", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  // Stock 3. Existing: Sep 20-21 x2 and Sep 25-26 x2. A request for
  // Sep 20-26 x1 peaks at 3 on both existing windows, which fits exactly.
  const variation = await seedVariation(fixture, { quantity: 3 });

  await book(fixture, variation.id, "2030-09-20", "2030-09-21", "2");
  await book(fixture, variation.id, "2030-09-25", "2030-09-26", "2");

  const quote = await quoteBooking(fixture.admin.shopId, {
    variationId: variation.id,
    fromDate: "2030-09-20",
    toDate: "2030-09-26",
    quantity: "1",
  } as Parameters<typeof quoteBooking>[1]);

  assert.equal(
    quote.available,
    true,
    `quote should say available; it said: ${quote.reason}`,
  );

  // And the write path must agree with the quote.
  await book(fixture, variation.id, "2030-09-20", "2030-09-26", "1");
});

test("quote and create agree when the item genuinely is full", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 2 });

  await book(fixture, variation.id, "2030-09-20", "2030-09-25", "2");

  const quote = await quoteBooking(fixture.admin.shopId, {
    variationId: variation.id,
    fromDate: "2030-09-22",
    toDate: "2030-09-23",
    quantity: "1",
  } as Parameters<typeof quoteBooking>[1]);

  assert.equal(quote.available, false);
  await assert.rejects(
    () => book(fixture, variation.id, "2030-09-22", "2030-09-23", "1"),
    /already booked|unit\(s\) of this item/i,
  );
});

test("overlapping bookings consume capacity on the days they share", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 2 });
  const row = variationFor(variation);

  await book(fixture, variation.id, "2030-01-10", "2030-01-20", "1");
  await book(fixture, variation.id, "2030-01-15", "2030-01-25", "1");

  // Both are out on the 15th–20th, so a third unit does not exist.
  const overlapping = await checkAvailability(row, "2030-01-16", "2030-01-17");
  assert.equal(overlapping.available, false);

  // Before the first and after the second, one unit is free.
  const before = await checkAvailability(row, "2030-01-05", "2030-01-09");
  assert.equal(before.available, true);
  const after = await checkAvailability(row, "2030-01-26", "2030-01-28");
  assert.equal(after.available, true);
});

test("exact boundary dates count as occupied on both ends", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 1 });
  const row = variationFor(variation);

  await book(fixture, variation.id, "2030-02-10", "2030-02-12", "1");

  // The return day itself is not handed to the next customer.
  assert.equal((await checkAvailability(row, "2030-02-12", "2030-02-13")).available, false);
  assert.equal((await checkAvailability(row, "2030-02-09", "2030-02-10")).available, false);
  // The day either side of the range is free.
  assert.equal((await checkAvailability(row, "2030-02-13", "2030-02-14")).available, true);
  assert.equal((await checkAvailability(row, "2030-02-08", "2030-02-09")).available, true);
});

test("requested quantity is checked against what is left, not just against one unit", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 5 });
  const row = variationFor(variation);

  await book(fixture, variation.id, "2030-03-01", "2030-03-05", "3");

  assert.equal((await checkAvailability(row, "2030-03-02", "2030-03-03", undefined, 2)).available, true);
  assert.equal((await checkAvailability(row, "2030-03-02", "2030-03-03", undefined, 3)).available, false);
});

test("many separate bookings are summed per day, not lumped together", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 4 });
  const row = variationFor(variation);

  // Four single-unit bookings, each on its own week.
  await book(fixture, variation.id, "2030-04-01", "2030-04-02");
  await book(fixture, variation.id, "2030-04-08", "2030-04-09");
  await book(fixture, variation.id, "2030-04-15", "2030-04-16");
  await book(fixture, variation.id, "2030-04-22", "2030-04-23");

  // A request spanning all four weeks peaks at 2 on any given day (itself
  // plus whichever booking that day holds), well inside stock of 4.
  const spanning = await checkAvailability(row, "2030-04-01", "2030-04-23");
  assert.equal(
    spanning.available,
    true,
    `should fit; reason was: ${spanning.reason}`,
  );
});

test("an open maintenance task removes a unit from capacity", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 1 });
  const row = variationFor(variation);

  assert.equal((await checkAvailability(row, "2030-05-01", "2030-05-02")).available, true);

  await db.insert(maintenanceTasks).values({
    shopId: fixture.shopId,
    outletId: fixture.outletId,
    variationId: variation.id,
    taskType: "maintenance",
    status: "pending",
  });

  const blocked = await checkAvailability(row, "2030-05-01", "2030-05-02");
  assert.equal(blocked.available, false);
  assert.match(blocked.reason ?? "", /maintenance\/cleaning/);
});

test("a retired or withdrawn item is never bookable", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 3 });

  const retired = await checkAvailability(
    { ...variationFor(variation), status: "retired" },
    "2030-06-01",
    "2030-06-02",
  );
  assert.equal(retired.available, false);
  assert.match(retired.reason ?? "", /retired/);

  const withdrawn = await checkAvailability(
    { ...variationFor(variation), isAvailable: false },
    "2030-06-01",
    "2030-06-02",
  );
  assert.equal(withdrawn.available, false);
  assert.match(withdrawn.reason ?? "", /withdrawn/);
});

test("excluding an item's own row lets it be edited onto the same dates", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 1 });
  const row = variationFor(variation);

  const created = await book(fixture, variation.id, "2030-07-01", "2030-07-03");
  const itemId = created.items[0].id;

  // Without the exclusion the item collides with itself.
  assert.equal((await checkAvailability(row, "2030-07-01", "2030-07-03")).available, false);
  assert.equal(
    (await checkAvailability(row, "2030-07-01", "2030-07-03", itemId)).available,
    true,
  );
});

test("cancelled and returned items release their capacity", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 1 });
  const row = variationFor(variation);

  const created = await book(fixture, variation.id, "2030-08-01", "2030-08-03");
  assert.equal((await checkAvailability(row, "2030-08-01", "2030-08-03")).available, false);

  const { bookingItems: items } = await import("@/lib/db/schema");
  await db
    .update(items)
    .set({ status: "cancelled" })
    .where(eq(items.id, created.items[0].id));

  assert.equal(
    (await checkAvailability(row, "2030-08-01", "2030-08-03")).available,
    true,
    "a cancelled item must not keep holding stock",
  );
});
