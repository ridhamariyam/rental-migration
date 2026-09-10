/**
 * RQ-12 regression: managers and staff must actually be confined to their
 * own outlet, and no role may reach another tenant's data.
 *
 * `permissions.ts` described `manager` as "outlet-scoped" throughout, but
 * every list service took only `shopId` and treated `?outletId=` as a
 * client-supplied filter, so omitting it returned the whole chain.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import {
  db,
  resetDatabase,
  seedOutlet,
  seedShop,
  seedStaff,
  seedVariation,
} from "@/test/db";
import { bookingItems } from "@/lib/db/schema";
import { listStaff } from "@/server/staff/service";
import { listBookings } from "@/server/bookings/service";
import { listMaintenanceTasks } from "@/server/maintenance/service";
import { createBooking } from "@/server/bookings/service";
import {
  NO_OUTLET_SENTINEL,
  outletScopeFor,
  resolveOutletScope,
} from "@/server/auth/guard";
import { AppError } from "@/lib/errors/app-error";

const listQuery: Record<string, unknown> = {
  page: 1,
  pageSize: 50,
  q: "",
  role: "all",
  status: "all",
  outletId: undefined,
};

const bookingQuery = {
  page: 1,
  pageSize: 50,
  q: "",
  status: "all",
  customerId: undefined,
} as never;

const maintenanceQuery = {
  page: 1,
  pageSize: 50,
  q: "",
  status: "all",
  taskType: "all",
  outletId: undefined,
} as never;

test("outletScopeFor: owners are unscoped, managers and staff are not", () => {
  assert.equal(outletScopeFor({ role: "admin", outletId: "o1" }), null);
  assert.equal(outletScopeFor({ role: "super_admin", outletId: null }), null);
  assert.equal(outletScopeFor({ role: "manager", outletId: "o1" }), "o1");
  assert.equal(outletScopeFor({ role: "staff", outletId: "o2" }), "o2");
});

test("a scoped account with no outlet is scoped to nothing, not to everything", () => {
  assert.equal(
    outletScopeFor({ role: "manager", outletId: null }),
    NO_OUTLET_SENTINEL,
    "failing open here would hand an unassigned account the whole shop",
  );
});

test("a scoped account asking for someone else's outlet is refused", () => {
  assert.throws(
    () => resolveOutletScope({ role: "manager", outletId: "mine" }, "theirs"),
    (error: unknown) =>
      error instanceof AppError && error.status === 403,
    "silently returning an empty list would read as 'no data', not 'not allowed'",
  );

  // Asking for their own outlet, or not asking at all, is fine.
  assert.equal(resolveOutletScope({ role: "manager", outletId: "mine" }, "mine"), "mine");
  assert.equal(resolveOutletScope({ role: "manager", outletId: "mine" }), "mine");
  // An owner may narrow to any outlet.
  assert.equal(resolveOutletScope({ role: "admin", outletId: null }, "any"), "any");
});

test("a manager sees only their own outlet's staff", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const otherOutlet = await seedOutlet(fixture.shopId);

  const manager = await seedStaff(fixture, {
    role: "manager",
    outletId: fixture.outletId,
  });
  await seedStaff(fixture, { role: "staff", outletId: fixture.outletId });
  await seedStaff(fixture, { role: "staff", outletId: otherOutlet });
  await seedStaff(fixture, { role: "staff", outletId: otherOutlet });

  const scoped = await listStaff(manager, listQuery as never);
  assert.ok(scoped.items.length > 0, "the manager should see their own outlet");
  assert.ok(
    scoped.items.every((row) => row.outletId === fixture.outletId),
    "no row from another outlet may appear",
  );

  const owner = await listStaff(fixture.admin, listQuery as never);
  assert.ok(
    owner.total > scoped.total,
    "the owner still sees the whole roster",
  );
});

test("a manager cannot widen their own scope through the query parameter", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const otherOutlet = await seedOutlet(fixture.shopId);
  const manager = await seedStaff(fixture, {
    role: "manager",
    outletId: fixture.outletId,
  });
  await seedStaff(fixture, { role: "staff", outletId: otherOutlet });

  await assert.rejects(
    () => listStaff(manager, { ...listQuery, outletId: otherOutlet } as never),
    /only view your own outlet/i,
  );
});

test("a manager sees only bookings for their own outlet", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const otherOutlet = await seedOutlet(fixture.shopId);

  const mine = await seedVariation(fixture, { quantity: 2 });
  const theirs = await seedVariation(fixture, {
    quantity: 2,
    outletId: otherOutlet,
  });

  await createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [{ variationId: mine.id, fromDate: "2030-03-01", toDate: "2030-03-02", quantity: "1" }],
  } as Parameters<typeof createBooking>[1]);
  await createBooking(fixture.admin, {
    customerId: fixture.customerId,
    items: [{ variationId: theirs.id, fromDate: "2030-03-01", toDate: "2030-03-02", quantity: "1" }],
  } as Parameters<typeof createBooking>[1]);

  const manager = await seedStaff(fixture, {
    role: "manager",
    outletId: fixture.outletId,
  });

  const scoped = await listBookings(fixture.shopId, bookingQuery, manager);
  assert.equal(scoped.total, 1, "only the booking at their own outlet");

  const owner = await listBookings(fixture.shopId, bookingQuery, fixture.admin);
  assert.equal(owner.total, 2, "the owner sees both");
});

test("a manager sees only their own outlet's maintenance queue", async () => {
  await resetDatabase();
  const fixture = await seedShop();
  const otherOutlet = await seedOutlet(fixture.shopId);
  const { maintenanceTasks } = await import("@/lib/db/schema");
  const mine = await seedVariation(fixture, { quantity: 1 });
  const theirs = await seedVariation(fixture, { quantity: 1, outletId: otherOutlet });

  await db.insert(maintenanceTasks).values([
    {
      shopId: fixture.shopId,
      outletId: fixture.outletId,
      variationId: mine.id,
      taskType: "cleaning",
      status: "pending",
    },
    {
      shopId: fixture.shopId,
      outletId: otherOutlet,
      variationId: theirs.id,
      taskType: "cleaning",
      status: "pending",
    },
  ]);

  const staff = await seedStaff(fixture, {
    role: "staff",
    outletId: fixture.outletId,
  });

  const scoped = await listMaintenanceTasks(staff, maintenanceQuery);
  assert.equal(scoped.total, 1);

  const owner = await listMaintenanceTasks(fixture.admin, maintenanceQuery);
  assert.equal(owner.total, 2);
});

test("tenant isolation: one shop's owner never sees another shop's data", async () => {
  await resetDatabase();
  const shopA = await seedShop("Shop A");
  const shopB = await seedShop("Shop B");

  const variationB = await seedVariation(shopB, { quantity: 1 });
  await createBooking(shopB.admin, {
    customerId: shopB.customerId,
    items: [
      { variationId: variationB.id, fromDate: "2030-04-01", toDate: "2030-04-02", quantity: "1" },
    ],
  } as Parameters<typeof createBooking>[1]);

  const seenByA = await listBookings(shopA.shopId, bookingQuery, shopA.admin);
  assert.equal(seenByA.total, 0, "shop A must not see shop B's booking");

  const staffSeenByA = await listStaff(shopA.admin, listQuery as never);
  assert.ok(
    staffSeenByA.items.every((row) => row.shopId === shopA.shopId),
    "no cross-tenant staff rows",
  );

  const itemsInB = await db
    .select({ shopId: bookingItems.shopId })
    .from(bookingItems)
    .where(eq(bookingItems.shopId, shopB.shopId));
  assert.equal(itemsInB.length, 1, "the booking really was created under shop B");
});
