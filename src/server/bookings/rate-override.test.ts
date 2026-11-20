/**
 * Changing an item's rate while billing: owner/manager only, the bill
 * freezes the agreed rate, and the item's default only moves when asked.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db, resetDatabase, seedShop, seedStaff, seedVariation } from "@/test/db";
import { productVariations } from "@/lib/db/schema";
import { createBooking } from "@/server/bookings/service";

type Input = Parameters<typeof createBooking>[1];

function bill(customerId: string, variationId: string, extra: object = {}): Input {
  return {
    customerId,
    items: [
      {
        variationId,
        fromDate: "2030-09-11",
        toDate: "2030-09-13",
        quantity: "2",
        ...extra,
      },
    ],
  } as Input;
}

async function defaultRate(variationId: string) {
  const [row] = await db
    .select({ rentPrice: productVariations.rentPrice })
    .from(productVariations)
    .where(eq(productVariations.id, variationId));
  return row.rentPrice;
}

test.beforeEach(resetDatabase);

test("a changed rate applies to this bill only by default", async () => {
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { rentPrice: "3000.00", quantity: 4 });

  const { booking, items } = await createBooking(
    fixture.admin,
    bill(fixture.customerId, variation.id, { rentAmount: "2500.00" }),
  );

  assert.equal(items[0].rentAmount, "2500.00");
  assert.equal(items[0].grossRent, "5000.00");
  assert.equal(booking.totalAmount, "5000.00");
  assert.equal(await defaultRate(variation.id), "3000.00");
});

test("saveRateAsDefault also updates the item's default rate", async () => {
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { rentPrice: "3000.00", quantity: 4 });

  await createBooking(
    fixture.admin,
    bill(fixture.customerId, variation.id, {
      rentAmount: "3500.00",
      saveRateAsDefault: true,
    }),
  );

  assert.equal(await defaultRate(variation.id), "3500.00");
});

test("staff cannot change the rate", async () => {
  const fixture = await seedShop();
  const variation = await seedVariation(fixture, { rentPrice: "3000.00", quantity: 4 });
  const staff = await seedStaff(fixture, { outletId: fixture.outletId });

  await assert.rejects(
    createBooking(staff, bill(fixture.customerId, variation.id, { rentAmount: "100.00" })),
    /not allowed to change/,
  );
  // Sending the default rate back unchanged is not a change.
  const { items } = await createBooking(
    staff,
    bill(fixture.customerId, variation.id, { rentAmount: "3000.00" }),
  );
  assert.equal(items[0].rentAmount, "3000.00");
});
