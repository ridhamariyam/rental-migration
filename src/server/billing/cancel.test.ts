import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";

import { db, resetDatabase, seedShop } from "@/test/db";
import { shops } from "@/lib/db/schema";
import { cancelSubscription, resumeSubscription } from "./service";

async function shopRow(id: string) {
  const [row] = await db.select().from(shops).where(eq(shops.id, id));
  return row;
}

test("owner can cancel and resume; access end date is untouched", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const endsAt = new Date("2031-01-01T00:00:00Z");
  await db.update(shops).set({ subscriptionEndsAt: endsAt }).where(eq(shops.id, fixture.shopId));
  const actor = { id: fixture.admin.id, shopId: fixture.shopId };

  await cancelSubscription(actor, "  Too expensive ");
  let row = await shopRow(fixture.shopId);
  assert.ok(row.subscriptionCancelledAt);
  assert.equal(row.subscriptionCancelReason, "Too expensive");
  assert.equal(row.subscriptionEndsAt?.toISOString(), endsAt.toISOString());

  await resumeSubscription(actor);
  row = await shopRow(fixture.shopId);
  assert.equal(row.subscriptionCancelledAt, null);
  assert.equal(row.subscriptionCancelReason, null);
});

test("a managed account (no paid-until date) can't be self-cancelled", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  await db.update(shops).set({ subscriptionEndsAt: null }).where(eq(shops.id, fixture.shopId));
  await assert.rejects(
    cancelSubscription({ id: fixture.admin.id, shopId: fixture.shopId }, undefined),
    /managed by the Rentque team/,
  );
});
