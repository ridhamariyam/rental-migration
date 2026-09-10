/**
 * RQ-02 regression: concurrent bookings must not oversell stock.
 *
 * Before the fix, `assertCapacityAvailable` ran on the pooled `db` handle
 * outside the transaction that inserts the rows and took no lock, so N
 * simultaneous requests for a 1-unit item all passed the check and all
 * committed. This suite fires the requests genuinely in parallel and
 * asserts on what actually landed in the database, not on the return
 * values alone.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  countBookingItems,
  resetDatabase,
  seedShop,
  seedVariation,
  type Fixture,
} from "@/test/db";
import { createBooking } from "@/server/bookings/service";
import { AppError } from "@/lib/errors/app-error";

async function settleAll<T>(
  promises: Promise<T>[],
): Promise<{ fulfilled: number; rejected: Error[] }> {
  const results = await Promise.allSettled(promises);
  return {
    fulfilled: results.filter((r) => r.status === "fulfilled").length,
    rejected: results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason as Error),
  };
}

function bookOnce(
  fixture: Fixture,
  variationId: string,
  quantity = "1",
  fromDate = "2030-10-01",
  toDate = "2030-10-03",
) {
  return createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [{ variationId, fromDate, toDate, quantity }],
  } as Parameters<typeof createBooking>[1]);
}

test("five simultaneous bookings for a 1-unit item: exactly one wins", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 1 });

  const { fulfilled, rejected } = await settleAll(
    Array.from({ length: 5 }, () => bookOnce(fixture, variation.id)),
  );

  assert.equal(fulfilled, 1, "exactly one booking should succeed");
  assert.equal(rejected.length, 4, "the other four should be rejected");

  const stored = await countBookingItems(variation.id);
  assert.equal(stored.rows, 1, "only one booking item row should exist");
  assert.equal(stored.units, 1, "only one unit should be reserved");

  for (const error of rejected) {
    assert.ok(
      error instanceof AppError,
      `expected an AppError, got ${error?.constructor?.name}: ${error?.message}`,
    );
    assert.equal(
      (error as AppError).status,
      409,
      "a capacity rejection is a conflict, not a server error",
    );
  }
});

test("concurrent bookings fill a 3-unit item exactly to capacity", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 3 });

  const { fulfilled } = await settleAll(
    Array.from({ length: 8 }, () => bookOnce(fixture, variation.id)),
  );

  assert.equal(fulfilled, 3, "capacity is three, so three should succeed");

  const stored = await countBookingItems(variation.id);
  assert.equal(stored.units, 3, "never more than the physical stock");
});

test("concurrent multi-unit requests cannot straddle the capacity limit", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 4 });

  // Three requests of 2 units each against 4 units of stock: two fit, the
  // third must be turned away rather than pushing the total to 6.
  const { fulfilled } = await settleAll(
    Array.from({ length: 3 }, () => bookOnce(fixture, variation.id, "2")),
  );

  assert.equal(fulfilled, 2);
  const stored = await countBookingItems(variation.id);
  assert.equal(stored.units, 4, "stock must not be exceeded");
});

test("concurrent bookings on non-overlapping dates all succeed", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { quantity: 1 });

  // Locking must not turn independent date windows into false conflicts.
  const { fulfilled, rejected } = await settleAll([
    bookOnce(fixture, variation.id, "1", "2030-11-01", "2030-11-02"),
    bookOnce(fixture, variation.id, "1", "2030-11-05", "2030-11-06"),
    bookOnce(fixture, variation.id, "1", "2030-11-10", "2030-11-11"),
  ]);

  assert.equal(
    fulfilled,
    3,
    `all three should succeed; rejections: ${rejected.map((e) => e.message).join(" | ")}`,
  );
});
