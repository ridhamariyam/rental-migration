/**
 * One tenant must never see another's data — anywhere.
 *
 * Every list here is called by an actor from shop A while shop B holds a
 * row of the same kind, and the assertion is the same each time: A's
 * result contains none of B's ids. Reads by id are checked the other way
 * round — handing A one of B's ids must come back empty or refused, never
 * the row, because that is the shape a leak actually takes (a guessed or
 * leaked uuid in a URL, not a listing).
 *
 * This is deliberately breadth-first rather than deep: the point is that
 * *every* surface is covered, so a new query that forgets its `shopId`
 * predicate fails here rather than in someone's production data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db, resetDatabase, seedShop, seedStaff, seedVariation } from "@/test/db";
import {
  attendances,
  bookings,
  maintenanceTasks,
  salaries,
  staffLeaves,
} from "@/lib/db/schema";
import { listProducts, getProductById } from "@/server/products/service";
import { listCustomers, getCustomerById } from "@/server/customers/service";
import { listOutlets, getOutletById } from "@/server/outlets/service";
import { listStaff, getStaffById } from "@/server/staff/service";
import { listCategories, getCategoryById } from "@/server/categories/service";
import { listBookings, getBookingById } from "@/server/bookings/service";
import { getVariationById } from "@/server/variations/service";
import { listMaintenanceTasks } from "@/server/maintenance/service";
import { listLeaves } from "@/server/leave/service";
import { listAuditLogs } from "@/server/audit/service";
import { listPayslips, listStaffSalaries } from "@/server/salary/service";
import { listSettlements, listOwnerItems } from "@/server/settlements/service";
import { getDashboardStats } from "@/server/reports/service";

const page = { page: 1, pageSize: 50 } as const;

/** Two fully-populated shops: the actor always comes from `a`, the row
 * that must stay invisible always lives in `b`. */
async function twoShops() {
  const a = await seedShop("Shop A");
  const b = await seedShop("Shop B");
  return { a, b };
}

test("no list surface returns another tenant's rows", async () => {
  await resetDatabase();
  const { a, b } = await twoShops();

  // Give B one row of every kind the lists below can return.
  const bStaff = await seedStaff(b, { role: "staff", outletId: b.outletId });
  const bVariation = await seedVariation(b, { quantity: 1 });
  const [bBooking] = await db
    .insert(bookings)
    .values({
      shopId: b.shopId,
      customerId: b.customerId,
      bookingNumber: "BKB00001",
      status: "confirmed",
      totalAmount: "1000.00",
      createdById: b.admin.id,
    })
    .returning();
  await db.insert(maintenanceTasks).values({
    shopId: b.shopId,
    outletId: b.outletId,
    variationId: bVariation.id,
    taskType: "cleaning",
    status: "pending",
  });
  await db.insert(staffLeaves).values({
    shopId: b.shopId,
    staffId: bStaff.id,
    fromDate: "2030-01-01",
    toDate: "2030-01-02",
    reason: "B's leave",
    status: "pending",
  });
  await db.insert(salaries).values({
    shopId: b.shopId,
    staffId: bStaff.id,
    hourlyRate: "100.00",
    standardHoursPerDay: "8.00",
    effectiveDate: "2020-01-01",
  });

  const products = await listProducts(a.shopId, {
    ...page,
    q: undefined,
    categoryId: undefined,
    status: "all",
  });
  assert.ok(
    products.items.every((item) => item.id !== b.productId),
    "products leaked across tenants",
  );

  const customers = await listCustomers(a.shopId, {
    ...page,
    q: undefined,
    status: "all",
  });
  assert.ok(
    customers.items.every((item) => item.id !== b.customerId),
    "customers leaked across tenants",
  );

  const outlets = await listOutlets(a.shopId, {
    ...page,
    q: undefined,
    status: "all",
  });
  assert.ok(
    outlets.items.every((item) => item.id !== b.outletId),
    "outlets leaked across tenants",
  );

  const staff = await listStaff(a.admin, {
    ...page,
    q: undefined,
    role: "all",
    status: "all",
    outletId: undefined,
  });
  assert.ok(
    staff.items.every((item) => item.id !== bStaff.id),
    "staff leaked across tenants",
  );

  const cats = await listCategories(a.shopId, { ...page, q: undefined });
  assert.ok(
    cats.items.every((item) => item.id !== b.categoryId),
    "categories leaked across tenants",
  );

  const bookingList = await listBookings(
    a.shopId,
    { ...page, q: undefined, status: "all", customerId: undefined, view: "all" },
    a.admin,
  );
  assert.ok(
    bookingList.items.every((item) => item.id !== bBooking.id),
    "bookings leaked across tenants",
  );

  const tasks = await listMaintenanceTasks(a.admin, {
    ...page,
    q: undefined,
    status: "all",
    taskType: "all",
  });
  assert.ok(
    tasks.items.every((item) => item.variationId !== bVariation.id),
    "maintenance tasks leaked across tenants",
  );

  const leaves = await listLeaves(a.admin, {
    ...page,
    status: "all",
    staffId: undefined,
  });
  assert.ok(
    leaves.items.every((item) => item.staffId !== bStaff.id),
    "leave requests leaked across tenants",
  );

  const settlements = await listSettlements(a.admin, {
    ...page,
    status: "all",
    outletId: undefined,
    q: undefined,
  });
  assert.equal(
    settlements.items.filter((item) => item.shopId === b.shopId).length,
    0,
    "settlements leaked across tenants",
  );

  const ownerItems = await listOwnerItems(a.admin);
  assert.ok(
    ownerItems.every((item) => item.variationId !== bVariation.id),
    "customer-owned items leaked across tenants",
  );

  const payslips = await listPayslips(a.admin, { ...page, staffId: undefined });
  assert.equal(
    payslips.items.filter((item) => item.shopId === b.shopId).length,
    0,
    "payslips leaked across tenants",
  );

  const audit = await listAuditLogs(a.admin, {
    ...page,
    action: "all",
    userId: undefined,
  });
  assert.equal(
    audit.items.filter((item) => item.shopId === b.shopId).length,
    0,
    "audit entries leaked across tenants",
  );
});

test("reading another tenant's row by id is refused, not served", async () => {
  await resetDatabase();
  const { a, b } = await twoShops();

  const bStaff = await seedStaff(b, { role: "staff", outletId: b.outletId });
  const bVariation = await seedVariation(b, { quantity: 1 });
  const [bBooking] = await db
    .insert(bookings)
    .values({
      shopId: b.shopId,
      customerId: b.customerId,
      bookingNumber: "BKB00002",
      status: "confirmed",
      totalAmount: "1000.00",
      createdById: b.admin.id,
    })
    .returning();

  assert.equal(await getProductById(a.shopId, b.productId), null);
  assert.equal(await getCustomerById(a.shopId, b.customerId), null);
  assert.equal(await getOutletById(a.shopId, b.outletId), null);
  assert.equal(await getStaffById(a.shopId, bStaff.id), null);
  assert.equal(await getCategoryById(a.shopId, b.categoryId), null);
  assert.equal(await getVariationById(a.shopId, bVariation.id), null);
  assert.equal(await getBookingById(a.shopId, bBooking.id, a.admin), null);

  // Salary reads throw rather than return null — the staff member is not
  // this tenant's to look at in the first place.
  await assert.rejects(
    () => listStaffSalaries(a.admin, bStaff.id),
    /not found/i,
    "another tenant's pay history must not be readable",
  );
});

test("dashboard figures count only the caller's own tenant", async () => {
  await resetDatabase();
  const { a, b } = await twoShops();

  // B takes a booking; A's dashboard must not notice.
  await db.insert(bookings).values({
    shopId: b.shopId,
    customerId: b.customerId,
    bookingNumber: "BKB00003",
    status: "confirmed",
    totalAmount: "5000.00",
    createdById: b.admin.id,
  });
  const bStaff = await seedStaff(b, { role: "staff", outletId: b.outletId });
  await db.insert(attendances).values({
    shopId: b.shopId,
    staffId: bStaff.id,
    outletId: b.outletId,
    date: new Date().toISOString().slice(0, 10),
    status: "present",
    checkInTime: new Date(),
    checkInLatitude: 0,
    checkInLongitude: 0,
  });

  const stats = await getDashboardStats(a.admin, {});
  assert.equal(stats.todaysBookings, 0, "another tenant's booking was counted");
  assert.equal(
    stats.availableProducts,
    0,
    "another tenant's stock was counted",
  );

  const own = await db
    .select()
    .from(bookings)
    .where(eq(bookings.shopId, b.shopId));
  assert.equal(own.length, 1, "fixture sanity: B really does have a booking");
});
