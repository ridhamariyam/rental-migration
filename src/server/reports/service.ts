import "server-only";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookings,
  customers,
  maintenanceTasks,
  outlets,
  payments,
  products,
  productVariations,
  users,
} from "@/lib/db/schema";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getSettlementSummary } from "@/server/settlements/service";
import { normalizeMoneyFromSql, ZERO_MONEY } from "@/lib/money";
import { toDateString } from "@/lib/format";
import type {
  ActiveBookingsQuery,
  DashboardQuery,
  MonthlyIncomeQuery,
  MostRentedQuery,
  ReportDateRangeQuery,
} from "@/lib/validation/reports";

/** Payment types that count as revenue actually collected — mirrors the
 * legacy backend's `INFLOW_PAYMENT_TYPES` exactly (a `refund`/
 * `deposit_release` moves money back out, it's never counted as income). */
const INFLOW_PAYMENT_TYPES = ["advance", "balance", "damage_charge"] as const;

/** A booking currently out with the customer — picked up, not yet
 * returned. Doc §19's "Pending Returns"/"Active Rentals" tiles and the
 * Reports page's two "currently out" lists are both this same set,
 * filtered/sorted differently. */
const ACTIVE_STATUSES = ["rented", "return_pending", "overdue"] as const;

function requireReportAccess(actor: TenantSessionUser) {
  if (!hasPermission(actor.role, Permission.REPORT_VIEW)) {
    throw AppError.forbidden("You do not have permission to do this");
  }
}

function dateRange(column: AnyPgColumn, from: string, to: string) {
  return and(
    sql`${column}::date >= ${from}::date`,
    sql`${column}::date <= ${to}::date`,
  );
}

async function sumPayments(
  shopId: string,
  outletId: string | undefined,
  from: string,
  to: string,
): Promise<string> {
  const conditions = [
    eq(payments.shopId, shopId),
    inArray(payments.paymentType, INFLOW_PAYMENT_TYPES),
    dateRange(payments.createdAt, from, to),
  ];
  if (outletId) {
    conditions.push(eq(payments.outletId, outletId));
  }

  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(and(...conditions));

  return normalizeMoneyFromSql(row?.total);
}

export type DashboardStats = {
  date: string;
  todaysBookings: number;
  todaysReturns: number;
  todaysIncome: string;
  monthIncome: string;
  activeRentals: number;
  availableProducts: number;
  pendingReturns: number;
  itemsNeedingCleaning: number;
  /** `null` for a role without `SETTLEMENT_VIEW` (manager) — the tile is
   * simply omitted client-side rather than shown as a fake zero. */
  pendingOwnerSettlements: string | null;
};

/**
 * The Shop Owner Dashboard (doc §19) — a handful of today/this-month
 * counters, always tenant-scoped and optionally narrowed to one outlet.
 * Every count is its own small aggregate query rather than one giant join,
 * matching the legacy `ReportRepository`'s own "one query per KPI" shape.
 */
export async function getDashboardStats(
  actor: TenantSessionUser,
  query: DashboardQuery,
): Promise<DashboardStats> {
  requireReportAccess(actor);

  const today = toDateString(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const outletId = query.outletId;

  const bookingScope = [eq(bookings.shopId, actor.shopId)];
  if (outletId) bookingScope.push(eq(bookings.outletId, outletId));

  const [
    todaysBookingsRow,
    todaysReturnsRow,
    todaysIncome,
    monthIncome,
    activeRentalsRow,
    availableProductsRow,
    pendingReturnsRow,
    cleaningRow,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(...bookingScope, sql`${bookings.createdAt}::date = ${today}::date`)),
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(...bookingScope, eq(bookings.toDate, today))),
    sumPayments(actor.shopId, outletId, today, today),
    sumPayments(actor.shopId, outletId, monthStart, today),
    db
      .select({ value: count() })
      .from(bookings)
      .where(and(...bookingScope, inArray(bookings.status, ACTIVE_STATUSES))),
    db
      .select({ value: count() })
      .from(productVariations)
      .innerJoin(products, eq(productVariations.productId, products.id))
      .where(
        and(
          eq(products.shopId, actor.shopId),
          eq(productVariations.status, "available"),
          outletId ? eq(productVariations.outletId, outletId) : undefined,
        ),
      ),
    db
      .select({ value: count() })
      .from(bookings)
      .where(
        and(
          ...bookingScope,
          inArray(bookings.status, ACTIVE_STATUSES),
          sql`${bookings.pickedUpAt} is not null`,
        ),
      ),
    db
      .select({ value: count() })
      .from(maintenanceTasks)
      .where(
        and(
          eq(maintenanceTasks.shopId, actor.shopId),
          inArray(maintenanceTasks.status, ["pending", "in_progress"]),
          outletId ? eq(maintenanceTasks.outletId, outletId) : undefined,
        ),
      ),
  ]);

  const pendingOwnerSettlements = hasPermission(actor.role, Permission.SETTLEMENT_VIEW)
    ? (await getSettlementSummary(actor)).pendingTotal
    : null;

  return {
    date: today,
    todaysBookings: todaysBookingsRow[0]?.value ?? 0,
    todaysReturns: todaysReturnsRow[0]?.value ?? 0,
    todaysIncome,
    monthIncome,
    activeRentals: activeRentalsRow[0]?.value ?? 0,
    availableProducts: availableProductsRow[0]?.value ?? 0,
    pendingReturns: pendingReturnsRow[0]?.value ?? 0,
    itemsNeedingCleaning: cleaningRow[0]?.value ?? 0,
    pendingOwnerSettlements,
  };
}

export type DailyIncomeRow = { date: string; amount: string; bookings: number };

/** Defaults to the trailing 30 days when no range is given — bounded so a
 * shop with years of history never returns an unbounded row set (the
 * legacy backend used the same 30-day default). */
export async function getDailyIncome(
  actor: TenantSessionUser,
  query: ReportDateRangeQuery,
): Promise<{ fromDate: string; toDate: string; total: string; rows: DailyIncomeRow[] }> {
  requireReportAccess(actor);

  const toDate = query.toDate || toDateString(new Date());
  const fromDate =
    query.fromDate || toDateString(new Date(Date.now() - 29 * 86_400_000));

  const paymentConditions = [
    eq(payments.shopId, actor.shopId),
    inArray(payments.paymentType, INFLOW_PAYMENT_TYPES),
    dateRange(payments.createdAt, fromDate, toDate),
  ];
  if (query.outletId) paymentConditions.push(eq(payments.outletId, query.outletId));

  const bookingConditions = [
    eq(bookings.shopId, actor.shopId),
    dateRange(bookings.createdAt, fromDate, toDate),
  ];
  if (query.outletId) bookingConditions.push(eq(bookings.outletId, query.outletId));

  const paymentDayExpr = sql<string>`to_char(${payments.createdAt}, 'YYYY-MM-DD')`;
  const bookingDayExpr = sql<string>`to_char(${bookings.createdAt}, 'YYYY-MM-DD')`;

  const [paymentRows, bookingRows] = await Promise.all([
    db
      .select({ day: paymentDayExpr, amount: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(...paymentConditions))
      .groupBy(paymentDayExpr)
      .orderBy(paymentDayExpr),
    db
      .select({ day: bookingDayExpr, count: count() })
      .from(bookings)
      .where(and(...bookingConditions))
      .groupBy(bookingDayExpr)
      .orderBy(bookingDayExpr),
  ]);

  const dataMap = new Map<string, { amount: string; count: number }>();
  
  for (const p of paymentRows) {
    dataMap.set(p.day, { amount: normalizeMoneyFromSql(p.amount), count: 0 });
  }
  for (const b of bookingRows) {
    const existing = dataMap.get(b.day);
    if (existing) {
      existing.count = b.count;
    } else {
      dataMap.set(b.day, { amount: "0", count: b.count });
    }
  }

  const sortedDays = Array.from(dataMap.keys()).sort();
  const rows = sortedDays.map((day) => ({
    date: day,
    amount: dataMap.get(day)!.amount,
    bookings: dataMap.get(day)!.count,
  }));

  const total = paymentRows.reduce(
    (sum, row) => sum + Number(normalizeMoneyFromSql(row.amount)),
    0,
  );

  return {
    fromDate,
    toDate,
    total: normalizeMoneyFromSql(total),
    rows,
  };
}

export type MonthlyIncomeRow = { month: string; amount: string };

export async function getMonthlyIncome(
  actor: TenantSessionUser,
  query: MonthlyIncomeQuery,
): Promise<{ year: number; total: string; rows: MonthlyIncomeRow[] }> {
  requireReportAccess(actor);

  const fromDate = `${query.year}-01-01`;
  const toDate = `${query.year}-12-31`;

  const conditions = [
    eq(payments.shopId, actor.shopId),
    inArray(payments.paymentType, INFLOW_PAYMENT_TYPES),
    dateRange(payments.createdAt, fromDate, toDate),
  ];
  if (query.outletId) conditions.push(eq(payments.outletId, query.outletId));

  const monthExpr = sql<string>`to_char(${payments.createdAt}, 'YYYY-MM')`;
  const rows = await db
    .select({ month: monthExpr, amount: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(and(...conditions))
    .groupBy(monthExpr)
    .orderBy(monthExpr);

  const total = rows.reduce(
    (sum, row) => sum + Number(normalizeMoneyFromSql(row.amount)),
    0,
  );

  return {
    year: query.year,
    total: normalizeMoneyFromSql(total),
    rows: rows.map((row) => ({ month: row.month, amount: normalizeMoneyFromSql(row.amount) })),
  };
}

export type MostRentedRow = {
  productId: string;
  productName: string;
  rentalCount: number;
  revenue: string;
};

export async function getMostRentedProducts(
  actor: TenantSessionUser,
  query: MostRentedQuery,
): Promise<MostRentedRow[]> {
  requireReportAccess(actor);

  const conditions = [eq(bookings.shopId, actor.shopId)];
  if (query.outletId) conditions.push(eq(bookings.outletId, query.outletId));
  if (query.fromDate) conditions.push(sql`${bookings.fromDate} >= ${query.fromDate}`);
  if (query.toDate) conditions.push(sql`${bookings.toDate} <= ${query.toDate}`);

  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      rentalCount: count(bookings.id),
      revenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
    })
    .from(bookings)
    .innerJoin(products, eq(bookings.productId, products.id))
    .where(and(...conditions))
    .groupBy(products.id, products.name)
    .orderBy(desc(count(bookings.id)))
    .limit(query.limit);

  return rows.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    rentalCount: row.rentalCount,
    revenue: normalizeMoneyFromSql(row.revenue),
  }));
}

export type OutletRevenueRow = {
  outletId: string;
  outletName: string;
  bookingCount: number;
  revenue: string;
};

/** Left join so an outlet with zero bookings in the window still shows a
 * zero row, not being silently dropped — the date filter has to live in
 * the join's `ON` clause, not a `WHERE`, or it would undo the left join
 * for exactly the outlets it's meant to keep. */
export async function getRevenueByOutlet(
  actor: TenantSessionUser,
  query: ReportDateRangeQuery,
): Promise<OutletRevenueRow[]> {
  requireReportAccess(actor);

  const joinConditions = [eq(bookings.outletId, outlets.id)];
  if (query.fromDate) joinConditions.push(sql`${bookings.fromDate} >= ${query.fromDate}`);
  if (query.toDate) joinConditions.push(sql`${bookings.toDate} <= ${query.toDate}`);

  const rows = await db
    .select({
      outletId: outlets.id,
      outletName: outlets.name,
      bookingCount: count(bookings.id),
      revenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
    })
    .from(outlets)
    .leftJoin(bookings, and(...joinConditions))
    .where(eq(outlets.shopId, actor.shopId))
    .groupBy(outlets.id, outlets.name)
    .orderBy(outlets.name);

  return rows.map((row) => ({
    outletId: row.outletId,
    outletName: row.outletName,
    bookingCount: row.bookingCount,
    revenue: normalizeMoneyFromSql(row.revenue),
  }));
}

export type StaffPerformanceRow = {
  staffId: string;
  staffName: string;
  bookingCount: number;
  revenue: string;
};

/** Attributed by `handledById`, frozen at booking creation (doc §21's
 * "Staff performance") — an inner join, unlike outlets: a staff member who
 * has never handled a booking has nothing to report, not a zero row worth
 * showing. */
export async function getStaffPerformance(
  actor: TenantSessionUser,
  query: ReportDateRangeQuery,
): Promise<StaffPerformanceRow[]> {
  requireReportAccess(actor);

  const conditions = [eq(bookings.shopId, actor.shopId)];
  if (query.outletId) conditions.push(eq(bookings.outletId, query.outletId));
  if (query.fromDate) conditions.push(sql`${bookings.createdAt}::date >= ${query.fromDate}::date`);
  if (query.toDate) conditions.push(sql`${bookings.createdAt}::date <= ${query.toDate}::date`);

  const rows = await db
    .select({
      staffId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      bookingCount: count(bookings.id),
      revenue: sql<string>`coalesce(sum(${bookings.totalAmount}), 0)`,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.handledById, users.id))
    .where(and(...conditions))
    .groupBy(users.id, users.firstName, users.lastName)
    .orderBy(desc(count(bookings.id)));

  return rows.map((row) => ({
    staffId: row.staffId,
    staffName: `${row.firstName} ${row.lastName}`.trim(),
    bookingCount: row.bookingCount,
    revenue: normalizeMoneyFromSql(row.revenue),
  }));
}

export type ActiveBookingItem = {
  id: string;
  bookingNumber: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  sku: string;
  outletName: string | null;
  fromDate: string;
  toDate: string;
  daysOverdue: number;
  securityDeposit: string;
  status: string;
};

export type ActiveBookingsResult = {
  items: ActiveBookingItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Bookings currently out with a customer — picked up, not yet returned.
 * Doc §21 asks for both "Pending returns" and "Pending deposits" as
 * separate reports; in this schema a security deposit is always fully
 * resolved (refunded or consumed by damage) the instant a return is
 * recorded (`returnBooking()` never leaves one half-settled — see
 * `src/server/bookings/lifecycle.ts`), so there is no backlog of
 * "deposits owed" the way the legacy `deposit_settled` flag implied.
 * What *is* real and worth surfacing is "how much deposit money is
 * currently sitting with the shop for rentals that haven't come back
 * yet" — `kind: "deposits"` is that same active-bookings list, filtered
 * to ones with a deposit and sorted by amount instead of by how overdue
 * they are.
 */
export async function listActiveBookings(
  actor: TenantSessionUser,
  query: ActiveBookingsQuery,
): Promise<ActiveBookingsResult> {
  requireReportAccess(actor);

  const conditions = [
    eq(bookings.shopId, actor.shopId),
    inArray(bookings.status, ACTIVE_STATUSES),
    sql`${bookings.pickedUpAt} is not null`,
  ];
  if (query.outletId) conditions.push(eq(bookings.outletId, query.outletId));
  if (query.kind === "deposits") {
    conditions.push(sql`${bookings.securityDeposit} > 0`);
  }

  const where = and(...conditions);
  const orderBy =
    query.kind === "deposits"
      ? desc(bookings.securityDeposit)
      : bookings.toDate;

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(bookings).where(where),
    db
      .select({
        id: bookings.id,
        bookingNumber: bookings.bookingNumber,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerPhone: customers.phone,
        productName: products.name,
        sku: productVariations.sku,
        outletName: outlets.name,
        fromDate: bookings.fromDate,
        toDate: bookings.toDate,
        securityDeposit: bookings.securityDeposit,
        status: bookings.status,
      })
      .from(bookings)
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .innerJoin(products, eq(bookings.productId, products.id))
      .innerJoin(productVariations, eq(bookings.variationId, productVariations.id))
      .leftJoin(outlets, eq(bookings.outletId, outlets.id))
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const today = toDateString(new Date());

  return {
    items: rows.map((row) => ({
      id: row.id,
      bookingNumber: row.bookingNumber,
      customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
      customerPhone: row.customerPhone,
      productName: row.productName,
      sku: row.sku,
      outletName: row.outletName,
      fromDate: row.fromDate,
      toDate: row.toDate,
      daysOverdue: Math.max(
        0,
        Math.round(
          (new Date(`${today}T00:00:00Z`).getTime() -
            new Date(`${row.toDate}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      ),
      securityDeposit: row.securityDeposit,
      status: row.status,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export { ZERO_MONEY };
