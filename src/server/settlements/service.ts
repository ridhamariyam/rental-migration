import "server-only";

import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookingItems,
  bookings,
  customers,
  outlets,
  ownerSettlements,
  productVariations,
  products,
  type OwnerSettlement,
} from "@/lib/db/schema";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import { addMoney, compareMoney, subtractMoney, ZERO_MONEY } from "@/lib/money";
import type { PaymentTx } from "@/server/payments/service";
import type { MarkSettlementPaidInput, SettlementListQuery } from "@/lib/validation/settlements";

export type SettlementItem = OwnerSettlement & {
  bookingNumber: string;
  sku: string;
  productName: string;
};

const SETTLEMENT_SELECT = {
  id: ownerSettlements.id,
  shopId: ownerSettlements.shopId,
  outletId: ownerSettlements.outletId,
  bookingId: ownerSettlements.bookingId,
  variationId: ownerSettlements.variationId,
  ownerName: ownerSettlements.ownerName,
  ownerPhone: ownerSettlements.ownerPhone,
  ownerCustomerId: ownerSettlements.ownerCustomerId,
  grossRentalAmount: ownerSettlements.grossRentalAmount,
  shareAmount: ownerSettlements.shareAmount,
  ownerAmount: ownerSettlements.ownerAmount,
  shopAmount: ownerSettlements.shopAmount,
  status: ownerSettlements.status,
  paidAt: ownerSettlements.paidAt,
  paidById: ownerSettlements.paidById,
  paymentReference: ownerSettlements.paymentReference,
  note: ownerSettlements.note,
  createdAt: ownerSettlements.createdAt,
  updatedAt: ownerSettlements.updatedAt,
  bookingNumber: bookings.bookingNumber,
  sku: productVariations.sku,
  productName: products.name,
} as const;

function baseSettlementQuery() {
  return db
    .select(SETTLEMENT_SELECT)
    .from(ownerSettlements)
    .innerJoin(bookingItems, eq(ownerSettlements.bookingId, bookingItems.id))
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .innerJoin(productVariations, eq(ownerSettlements.variationId, productVariations.id))
    .innerJoin(products, eq(productVariations.productId, products.id));
}

/**
 * Persists the owner's cut of one completed rental (doc §19–21) — called
 * from `src/server/bookings/lifecycle.ts`'s `returnBooking`, inside the
 * same transaction, only when the returned item is `customer_owned`.
 * Snapshots the owner's name/phone/share at this exact moment (see
 * `settlements.ts`'s doc comment on why), and is idempotent on
 * `bookingId` — a second return attempt (there isn't one in this app's
 * booking-state machine, but a retried transaction could replay this) never
 * creates a duplicate payout.
 *
 * The owner's share is a fixed amount, not a percentage of the rent —
 * clamped so it never exceeds the gross rental amount (an owner can never
 * be owed more than the rental itself brought in).
 *
 * Never permission-checked on its own, same reasoning as
 * `insertPaymentRow`: the outer `returnBooking` action is already gated by
 * `BOOKING_RETURN`.
 */
export async function recordSettlementForBooking(
  tx: PaymentTx,
  params: {
    shopId: string;
    outletId: string | null;
    bookingId: string;
    variation: {
      id: string;
      ownershipType: string;
      ownerName: string | null;
      ownerPhone: string | null;
      ownerCustomerId: string | null;
      ownerShareAmount: string;
    };
    grossRentalAmount: string;
  },
): Promise<OwnerSettlement | null> {
  if (params.variation.ownershipType !== "customer_owned") {
    return null;
  }

  const [existing] = await tx
    .select({ id: ownerSettlements.id })
    .from(ownerSettlements)
    .where(eq(ownerSettlements.bookingId, params.bookingId))
    .limit(1);

  if (existing) {
    return null;
  }

  if (compareMoney(params.variation.ownerShareAmount, ZERO_MONEY) <= 0) {
    return null;
  }

  const ownerAmount =
    compareMoney(params.variation.ownerShareAmount, params.grossRentalAmount) > 0
      ? params.grossRentalAmount
      : params.variation.ownerShareAmount;

  if (compareMoney(ownerAmount, ZERO_MONEY) <= 0) {
    return null;
  }

  const shopAmount = subtractMoney(params.grossRentalAmount, ownerAmount);

  const [settlement] = await tx
    .insert(ownerSettlements)
    .values({
      shopId: params.shopId,
      outletId: params.outletId,
      bookingId: params.bookingId,
      variationId: params.variation.id,
      ownerName: params.variation.ownerName,
      ownerPhone: params.variation.ownerPhone,
      ownerCustomerId: params.variation.ownerCustomerId,
      grossRentalAmount: params.grossRentalAmount,
      shareAmount: params.variation.ownerShareAmount,
      ownerAmount,
      shopAmount,
      status: "pending",
    })
    .returning();

  return settlement;
}

export type SettlementListResult = {
  items: SettlementItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Every settlement, shop-wide — owner-only (doc §20 lists "Revenue
 * Share" only under the Shop Owner's own module list). */
export async function listSettlements(
  actor: TenantSessionUser,
  query: SettlementListQuery,
): Promise<SettlementListResult> {
  if (!hasPermission(actor.role, Permission.SETTLEMENT_VIEW)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const conditions = [eq(ownerSettlements.shopId, actor.shopId)];

  if (query.status !== "all") {
    conditions.push(eq(ownerSettlements.status, query.status));
  }
  if (query.outletId) {
    conditions.push(eq(ownerSettlements.outletId, query.outletId));
  }
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(
      or(
        ilike(ownerSettlements.ownerName, pattern),
        ilike(productVariations.sku, pattern),
        ilike(products.name, pattern),
        ilike(bookings.bookingNumber, pattern),
      )!,
    );
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(ownerSettlements)
      .innerJoin(bookingItems, eq(ownerSettlements.bookingId, bookingItems.id))
      .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
      .innerJoin(productVariations, eq(ownerSettlements.variationId, productVariations.id))
      .innerJoin(products, eq(productVariations.productId, products.id))
      .where(where),
    baseSettlementQuery()
      .where(where)
      .orderBy(desc(ownerSettlements.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export type OwnerItem = {
  variationId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string | null;
  size: string | null;
  image: string | null;
  outletName: string | null;
  status: string;
  isAvailable: boolean;
  ownerName: string | null;
  ownerPhone: string | null;
  /** Set when the owner is a customer on file rather than free text — the
   * page links through to them, and notifications fall back to this
   * record's phone. */
  ownerCustomerId: string | null;
  ownerCustomerName: string | null;
  shareAmount: string;
  /** How many times this item has gone out (every booking line naming it,
   * cancellations excluded). */
  timesRented: number;
  /** Owner money already settled, and still owed, across its history. */
  paidTotal: string;
  pendingTotal: string;
};

/**
 * Every customer-owned item in the shop, whether or not it has earned a
 * payout yet.
 *
 * A settlement row only exists once a rental has been *returned*, so the
 * Revenue Share page used to be blank until the first completed rental —
 * an owner's item could be listed, booked and out with a customer while
 * the page said there was nothing to show. This is the register of what
 * the shop holds on someone else's behalf; the settlements table beneath
 * it stays the money ledger.
 */
export async function listOwnerItems(
  actor: TenantSessionUser,
  options: { outletId?: string; q?: string } = {},
): Promise<OwnerItem[]> {
  if (!hasPermission(actor.role, Permission.SETTLEMENT_VIEW)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const conditions = [
    eq(products.shopId, actor.shopId),
    eq(productVariations.ownershipType, "customer_owned"),
  ];
  if (options.outletId) {
    conditions.push(eq(productVariations.outletId, options.outletId));
  }
  if (options.q) {
    const pattern = `%${options.q}%`;
    conditions.push(
      or(
        ilike(products.name, pattern),
        ilike(productVariations.sku, pattern),
        ilike(productVariations.ownerName, pattern),
        ilike(customers.firstName, pattern),
        ilike(customers.lastName, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      variationId: productVariations.id,
      productId: products.id,
      productName: products.name,
      sku: productVariations.sku,
      color: productVariations.color,
      size: productVariations.size,
      image: productVariations.image,
      outletName: outlets.name,
      status: productVariations.status,
      isAvailable: productVariations.isAvailable,
      ownerName: productVariations.ownerName,
      ownerPhone: productVariations.ownerPhone,
      ownerCustomerId: productVariations.ownerCustomerId,
      ownerCustomerFirstName: customers.firstName,
      ownerCustomerLastName: customers.lastName,
      shareAmount: productVariations.ownerShareAmount,
      timesRented: sql<number>`(
        select count(*)::int from ${bookingItems}
        where ${bookingItems.variationId} = ${productVariations.id}
          and ${bookingItems.status} <> 'cancelled'
      )`,
      paidTotal: sql<string>`(
        select coalesce(sum(${ownerSettlements.ownerAmount}), 0) from ${ownerSettlements}
        where ${ownerSettlements.variationId} = ${productVariations.id}
          and ${ownerSettlements.status} = 'paid'
      )`,
      pendingTotal: sql<string>`(
        select coalesce(sum(${ownerSettlements.ownerAmount}), 0) from ${ownerSettlements}
        where ${ownerSettlements.variationId} = ${productVariations.id}
          and ${ownerSettlements.status} = 'pending'
      )`,
    })
    .from(productVariations)
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(outlets, eq(productVariations.outletId, outlets.id))
    .leftJoin(customers, eq(productVariations.ownerCustomerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(productVariations.createdAt));

  return rows.map((row) => ({
    variationId: row.variationId,
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    color: row.color,
    size: row.size,
    image: row.image,
    outletName: row.outletName,
    status: row.status,
    isAvailable: row.isAvailable,
    ownerName: row.ownerName,
    ownerPhone: row.ownerPhone,
    ownerCustomerId: row.ownerCustomerId,
    ownerCustomerName: row.ownerCustomerFirstName
      ? `${row.ownerCustomerFirstName} ${row.ownerCustomerLastName}`
      : null,
    shareAmount: row.shareAmount,
    timesRented: row.timesRented,
    paidTotal: row.paidTotal,
    pendingTotal: row.pendingTotal,
  }));
}

export type SettlementSummary = {
  pendingTotal: string;
  paidTotal: string;
  allTimeTotal: string;
};

/** Sums of `ownerAmount` by status, for the Revenue Share page's stat
 * tiles — computed with a single grouped query rather than three separate
 * round trips. Summed with `addMoney` (cents-based `BigInt`), never a
 * native `Number`, even though the value already came back through
 * Postgres as a decimal string — the same "never reintroduce binary-float
 * rounding" rule every other money total in this app follows. */
export async function getSettlementSummary(
  actor: TenantSessionUser,
): Promise<SettlementSummary> {
  if (!hasPermission(actor.role, Permission.SETTLEMENT_VIEW)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const rows = await db
    .select({
      status: ownerSettlements.status,
      total: sql<string>`coalesce(sum(${ownerSettlements.ownerAmount}), 0)`,
    })
    .from(ownerSettlements)
    .where(eq(ownerSettlements.shopId, actor.shopId))
    .groupBy(ownerSettlements.status);

  let pendingTotal = ZERO_MONEY;
  let paidTotal = ZERO_MONEY;
  let allTimeTotal = ZERO_MONEY;

  for (const row of rows) {
    // Postgres returns a bare numeric-as-text ("0" or "1234.5") for a
    // `coalesce(sum(...))` — pad it to two decimal places via plain string
    // splitting, never `Number(...)`, so a large total never round-trips
    // through a binary float before reaching `money.ts`'s cents arithmetic.
    const [intPart, decPart = ""] = row.total.trim().split(".");
    const amount = `${intPart || "0"}.${(decPart + "00").slice(0, 2)}`;

    allTimeTotal = addMoney(allTimeTotal, amount);
    if (row.status === "pending") pendingTotal = amount;
    if (row.status === "paid") paidTotal = amount;
  }

  return { pendingTotal, paidTotal, allTimeTotal };
}

async function loadSettlementForTenant(
  shopId: string,
  settlementId: string,
): Promise<OwnerSettlement> {
  const [row] = await db
    .select()
    .from(ownerSettlements)
    .where(and(eq(ownerSettlements.id, settlementId), eq(ownerSettlements.shopId, shopId)))
    .limit(1);

  if (!row) {
    throw AppError.notFound("Settlement not found");
  }

  return row;
}

/** Owner-only payout confirmation — a `pending` settlement moves to
 * `paid` exactly once; re-marking an already-paid or cancelled one is
 * rejected rather than silently overwriting the payout record (mirrors
 * the legacy `SettlementService.mark_paid`). */
export async function markSettlementPaid(
  actor: TenantSessionUser,
  settlementId: string,
  input: MarkSettlementPaidInput,
): Promise<SettlementItem> {
  if (!hasPermission(actor.role, Permission.SETTLEMENT_MANAGE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const settlement = await loadSettlementForTenant(actor.shopId, settlementId);

  if (settlement.status === "paid") {
    throw new AppError("Settlement is already paid", 409);
  }
  if (settlement.status === "cancelled") {
    throw new AppError("Settlement was cancelled", 409);
  }

  await db
    .update(ownerSettlements)
    .set({
      status: "paid",
      paidAt: new Date(),
      paidById: actor.id,
      paymentReference: input.paymentReference || null,
      note: input.note || null,
      updatedAt: new Date(),
    })
    .where(eq(ownerSettlements.id, settlementId));

  await recordAudit(db, {
    shopId: actor.shopId,
    outletId: settlement.outletId,
    userId: actor.id,
    action: AuditAction.SETTLEMENT_PAID,
    entityType: "owner_settlement",
    entityId: settlement.id,
    summary: `Settled ${settlement.ownerAmount} to ${settlement.ownerName || "owner"}`,
    before: { status: settlement.status },
    after: { status: "paid", paymentReference: input.paymentReference || null },
  });

  const [item] = await baseSettlementQuery().where(eq(ownerSettlements.id, settlementId));
  return item;
}
