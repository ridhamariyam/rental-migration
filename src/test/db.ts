/**
 * Integration-test harness. These tests run against a real Postgres (the
 * `_test` database named by `.env.test`) rather than a mock, because every
 * defect they cover — row locking, capacity arithmetic, ledger
 * reconciliation, tenant scoping — lives in the interaction between the
 * service layer and the database, which a mock would define away.
 *
 * `pnpm test` runs with `--conditions=react-server` so the `server-only`
 * imports in `src/lib/db/client.ts` and the service modules resolve to that
 * package's own `empty.js` instead of throwing outside Next's bundler.
 *
 * Run `pnpm test:db:setup` once (and after each new migration) to create
 * and migrate the test database.
 */
import { sql } from "drizzle-orm";
import { after } from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/client";
import {
  bookingItems,
  bookings,
  categories,
  customers,
  outlets,
  products,
  productVariations,
  shops,
  users,
} from "@/lib/db/schema";
import type { TenantSessionUser } from "@/server/auth/guard";

if (!/_test(\?|$)/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error(
    "Refusing to run tests: DATABASE_URL must name a database ending in '_test'.",
  );
}

// An open connection pool keeps the event loop alive, so a suite that
// touches the database would otherwise hang instead of exiting.
after(async () => {
  await db.$client.end({ timeout: 5 });
});

/**
 * Wipes every table. `TRUNCATE ... CASCADE` in one statement rather than
 * per-table deletes so foreign keys never dictate an ordering the next
 * schema change would break.
 */
export async function resetDatabase(): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      notification_logs, notification_rules, whatsapp_templates, whatsapp_numbers,
      audit_logs, owner_settlements, salary_payslips, salaries,
      staff_leaves, attendance_corrections, attendances,
      maintenance_tasks, payments,
      booking_items, bookings, customers, product_variations, products,
      categories, sessions, users, outlets, shops
    RESTART IDENTITY CASCADE
  `);
}

export type Fixture = {
  shopId: string;
  outletId: string;
  categoryId: string;
  productId: string;
  customerId: string;
  admin: TenantSessionUser;
};

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}-${randomUUID().slice(0, 8)}`;
}

function sessionUser(
  row: typeof users.$inferSelect,
): TenantSessionUser {
  return {
    id: row.id,
    shopId: row.shopId as string,
    outletId: row.outletId,
    role: row.role,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    mustChangePassword: row.mustChangePassword,
    isActive: row.isActive,
  };
}

/** One shop with an outlet, a catalogue entry, a customer and an owner
 * account — the minimum a booking needs. */
export async function seedShop(name = "Test Shop"): Promise<Fixture> {
  const [shop] = await db
    .insert(shops)
    .values({
      name,
      email: `${unique("shop")}@example.test`,
      phone: unique("phone"),
    })
    .returning();

  const [outlet] = await db
    .insert(outlets)
    .values({
      shopId: shop.id,
      name: "Main",
      code: unique("O").slice(0, 12).toUpperCase(),
      isActive: true,
    })
    .returning();

  const [admin] = await db
    .insert(users)
    .values({
      shopId: shop.id,
      outletId: outlet.id,
      role: "admin",
      firstName: "Owner",
      lastName: "Account",
      email: `${unique("owner")}@example.test`,
      passwordHash: "not-a-real-hash",
      mustChangePassword: false,
      isActive: true,
    })
    .returning();

  const [category] = await db
    .insert(categories)
    .values({ shopId: shop.id, name: unique("Category") })
    .returning();

  const [product] = await db
    .insert(products)
    .values({
      shopId: shop.id,
      categoryId: category.id,
      name: unique("Product"),
      isActive: true,
    })
    .returning();

  const [customer] = await db
    .insert(customers)
    .values({
      shopId: shop.id,
      firstName: "Test",
      lastName: "Customer",
      // A real-shaped Indian mobile: `normalizeWhatsAppPhone` rejects
      // anything under 10 digits, so a placeholder string here would make
      // every notification-wired test fail for the wrong reason.
      phone: `9${String(880000000 + sequence).slice(0, 9)}`,
      isActive: true,
    })
    .returning();

  return {
    shopId: shop.id,
    outletId: outlet.id,
    categoryId: category.id,
    productId: product.id,
    customerId: customer.id,
    admin: sessionUser(admin),
  };
}

export async function seedStaff(
  fixture: Pick<Fixture, "shopId">,
  options: {
    role?: "manager" | "staff" | "admin";
    outletId?: string | null;
  } = {},
): Promise<TenantSessionUser> {
  const [row] = await db
    .insert(users)
    .values({
      shopId: fixture.shopId,
      outletId: options.outletId ?? null,
      role: options.role ?? "staff",
      firstName: "Staff",
      lastName: "Member",
      email: `${unique("staff")}@example.test`,
      passwordHash: "not-a-real-hash",
      mustChangePassword: false,
      isActive: true,
    })
    .returning();

  return sessionUser(row);
}

export async function seedOutlet(
  shopId: string,
  name = "Second",
): Promise<string> {
  const [outlet] = await db
    .insert(outlets)
    .values({
      shopId,
      name,
      code: unique("O").slice(0, 12).toUpperCase(),
      isActive: true,
    })
    .returning();
  return outlet.id;
}

/** A bookable physical item. `quantity` is the stock the capacity checks
 * are measured against — the concurrency tests set it to 1. */
export async function seedVariation(
  fixture: Pick<Fixture, "productId" | "outletId">,
  options: {
    quantity?: number;
    rentPrice?: string;
    securityDeposit?: string;
    outletId?: string;
  } = {},
): Promise<typeof productVariations.$inferSelect> {
  const [variation] = await db
    .insert(productVariations)
    .values({
      productId: fixture.productId,
      outletId: options.outletId ?? fixture.outletId,
      rentPrice: options.rentPrice ?? "1000.00",
      securityDeposit: options.securityDeposit ?? "0.00",
      quantity: options.quantity ?? 1,
      sku: unique("SKU").toUpperCase(),
      barcode: String(Date.now()).slice(-6) + String(sequence).padStart(6, "0"),
      isAvailable: true,
      status: "available",
    })
    .returning();

  return variation;
}

export async function countBookingItems(variationId: string): Promise<{
  rows: number;
  units: number;
}> {
  const result = await db
    .select({
      rows: sql<number>`count(*)::int`,
      units: sql<number>`coalesce(sum(${bookingItems.quantity}), 0)::int`,
    })
    .from(bookingItems)
    .where(sql`${bookingItems.variationId} = ${variationId}`);

  return { rows: result[0]?.rows ?? 0, units: result[0]?.units ?? 0 };
}

export { db, bookings, bookingItems };
