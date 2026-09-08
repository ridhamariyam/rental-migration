import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookingItems,
  bookings,
  customers,
  products,
  productVariations,
  users,
  type Booking,
  type BookingItem,
} from "@/lib/db/schema";
import {
  assertTransition,
  canTransition,
  isEditable,
} from "@/lib/booking-state";
import { generateBookingNumberCandidate } from "@/lib/booking-number";
import {
  compareMoney,
  addMoney,
  isNegativeMoney,
  multiplyMoneyByQuantity,
  subtractMoneyNonNegative,
  ZERO_MONEY,
} from "@/lib/money";
import { formatMoney } from "@/lib/format";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import {
  queueBookingLifecycleNotifications,
  queueBookingNotification,
  queueOwnerBookingNotification,
} from "@/server/notifications/service";
import { computePaymentSummary, insertPaymentRow } from "@/server/payments/service";
import {
  assertAvailable,
  assertCapacityAvailable,
  checkAvailability,
  type CapacityRequest,
} from "@/server/bookings/availability";
import { quoteRental, type RentalQuote } from "@/server/bookings/pricing";
import {
  getVariationByBarcode,
  getVariationForBooking,
  type VariationSearchResult,
} from "@/server/variations/service";
import type {
  BookingItemInput,
  BookingListQuery,
  CreateBookingInput,
  QuoteRequestInput,
  UpdateBookingItemInput,
  UpdateBookingOrderInput,
} from "@/lib/validation/bookings";
import { bookingIdParamSchema } from "@/lib/validation/bookings";

export type BookingRow = Booking;
export type BookingItemRow = BookingItem;

export type BookingGroupItemInfo = {
  productName: string;
  productImage: string | null;
  variationColor: string | null;
  variationSize: string | null;
  quantity: number;
  fromDate: string;
  toDate: string;
};

export type BookingListItem = BookingRow & {
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  handledByFirstName: string | null;
  handledByLastName: string | null;
  itemCount: number;
  groupItems: BookingGroupItemInfo[];
};

export type BookingListResult = {
  items: BookingListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** Every role sees every order in the tenant — staff included, so any
 * agent can look up an order regardless of who created/handled it.
 * Kept as a function (returning `undefined`, i.e. no extra restriction)
 * so per-role scoping can be reintroduced later without touching every
 * call site. */
function staffScopeCondition(_actor: Pick<TenantSessionUser, "id" | "role">) {
  return undefined;
}

/**
 * Order reads, always scoped to the caller's own tenant. Search matches
 * the booking number or the customer's name/phone. One row per order —
 * the old per-line dedup/group-total logic is gone entirely, since an
 * order genuinely is one row now.
 */
export async function listBookings(
  shopId: string,
  query: BookingListQuery,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingListResult> {
  const { page, pageSize, q, status, customerId } = query;

  const conditions = [eq(bookings.shopId, shopId)];

  const scope = staffScopeCondition(actor);
  if (scope) {
    conditions.push(scope);
  }

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(bookings.bookingNumber, pattern),
        ilike(customers.firstName, pattern),
        ilike(customers.lastName, pattern),
        ilike(customers.phone, pattern),
      )!,
    );
  }

  if (status !== "all") {
    conditions.push(eq(bookings.status, status));
  }

  if (customerId) {
    conditions.push(eq(bookings.customerId, customerId));
  }

  const where = and(...conditions);

  const baseQuery = db
    .select({
      id: bookings.id,
      bookingNumber: bookings.bookingNumber,
      shopId: bookings.shopId,
      customerId: bookings.customerId,
      discountAmount: bookings.discountAmount,
      securityDeposit: bookings.securityDeposit,
      securityDepositOverridden: bookings.securityDepositOverridden,
      additionalCost: bookings.additionalCost,
      additionalCostReason: bookings.additionalCostReason,
      documents: bookings.documents,
      totalAmount: bookings.totalAmount,
      paymentStatus: bookings.paymentStatus,
      status: bookings.status,
      cancelledAt: bookings.cancelledAt,
      cancellationReason: bookings.cancellationReason,
      notes: bookings.notes,
      createdById: bookings.createdById,
      handledById: bookings.handledById,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      handledByFirstName: users.firstName,
      handledByLastName: users.lastName,
    })
    .from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .leftJoin(users, eq(bookings.handledById, users.id))
    .where(where);

  const [totalRow, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(bookings)
      .innerJoin(customers, eq(bookings.customerId, customers.id))
      .where(where),
    baseQuery
      .orderBy(desc(bookings.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  const orderIds = rows.map((r) => r.id);
  const itemRows =
    orderIds.length > 0
      ? await db
          .select({
            bookingId: bookingItems.bookingId,
            productName: products.name,
            // The booked copy's own photo, falling back to the catalogue
            // cover for items added before photos moved onto the item
            // itself.
            productImage: sql<string | null>`coalesce(${productVariations.image}, ${products.image})`,
            variationColor: productVariations.color,
            variationSize: productVariations.size,
            quantity: bookingItems.quantity,
            fromDate: bookingItems.fromDate,
            toDate: bookingItems.toDate,
          })
          .from(bookingItems)
          .innerJoin(products, eq(bookingItems.productId, products.id))
          .innerJoin(
            productVariations,
            eq(bookingItems.variationId, productVariations.id),
          )
          .where(inArray(bookingItems.bookingId, orderIds))
          // Same tiebreaker as `getBookingItems` \u2014 without it, which item
          // ends up first (and so which product/photo the list row shows)
          // can flip between identical requests when items share one
          // `createdAt`.
          .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id))
      : [];

  const groupItemsMap: Record<string, BookingGroupItemInfo[]> = {};
  for (const item of itemRows) {
    (groupItemsMap[item.bookingId] ??= []).push({
      productName: item.productName,
      productImage: item.productImage,
      variationColor: item.variationColor,
      variationSize: item.variationSize,
      quantity: item.quantity,
      fromDate: item.fromDate,
      toDate: item.toDate,
    });
  }

  const items: BookingListItem[] = rows.map((row) => ({
    ...row,
    groupItems: groupItemsMap[row.id] ?? [],
    itemCount: groupItemsMap[row.id]?.length ?? 0,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type BookingStats = {
  total: number;
  draft: number;
  active: number;
  cancelled: number;
};

export async function getBookingStats(
  shopId: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingStats> {
  const scope = staffScopeCondition(actor);
  const scopedWhere = (...extra: (ReturnType<typeof eq> | undefined)[]) =>
    and(eq(bookings.shopId, shopId), scope, ...extra);

  const [totalRow, draftRow, cancelledRow, confirmedRow] = await Promise.all([
    db.select({ value: count() }).from(bookings).where(scopedWhere()),
    db
      .select({ value: count() })
      .from(bookings)
      .where(scopedWhere(eq(bookings.status, "draft"))),
    db
      .select({ value: count() })
      .from(bookings)
      .where(scopedWhere(eq(bookings.status, "cancelled"))),
    db
      .select({ value: count() })
      .from(bookings)
      .where(scopedWhere(eq(bookings.status, "confirmed"))),
  ]);

  return {
    total: totalRow[0]?.value ?? 0,
    draft: draftRow[0]?.value ?? 0,
    active: confirmedRow[0]?.value ?? 0,
    cancelled: cancelledRow[0]?.value ?? 0,
  };
}

/** Column set for one order's own detail (not its items). */
const bookingOrderColumns = {
  id: bookings.id,
  bookingNumber: bookings.bookingNumber,
  shopId: bookings.shopId,
  customerId: bookings.customerId,
  discountAmount: bookings.discountAmount,
  securityDeposit: bookings.securityDeposit,
  securityDepositOverridden: bookings.securityDepositOverridden,
  additionalCost: bookings.additionalCost,
  additionalCostReason: bookings.additionalCostReason,
  documents: bookings.documents,
  totalAmount: bookings.totalAmount,
  paymentStatus: bookings.paymentStatus,
  status: bookings.status,
  cancelledAt: bookings.cancelledAt,
  cancellationReason: bookings.cancellationReason,
  notes: bookings.notes,
  createdById: bookings.createdById,
  handledById: bookings.handledById,
  createdAt: bookings.createdAt,
  updatedAt: bookings.updatedAt,
  customerFirstName: customers.firstName,
  customerLastName: customers.lastName,
  customerPhone: customers.phone,
  handledByFirstName: users.firstName,
  handledByLastName: users.lastName,
};

function bookingOrderBaseQuery() {
  return db
    .select(bookingOrderColumns)
    .from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .leftJoin(users, eq(bookings.handledById, users.id));
}

export type BookingOrderDetail = Awaited<
  ReturnType<typeof bookingOrderBaseQuery>
>[number];

export async function getBookingById(
  shopId: string,
  id: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingOrderDetail | null> {
  const parsedId = bookingIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return null;
  }

  const [row] = await bookingOrderBaseQuery()
    .where(
      and(
        eq(bookings.id, parsedId.data.id),
        eq(bookings.shopId, shopId),
        staffScopeCondition(actor),
      ),
    )
    .limit(1);

  return row ?? null;
}

const bookingItemDetailColumns = {
  id: bookingItems.id,
  bookingId: bookingItems.bookingId,
  shopId: bookingItems.shopId,
  outletId: bookingItems.outletId,
  productId: bookingItems.productId,
  variationId: bookingItems.variationId,
  fromDate: bookingItems.fromDate,
  toDate: bookingItems.toDate,
  totalDays: bookingItems.totalDays,
  quantity: bookingItems.quantity,
  rentAmount: bookingItems.rentAmount,
  grossRent: bookingItems.grossRent,
  status: bookingItems.status,
  cancelledAt: bookingItems.cancelledAt,
  cancellationReason: bookingItems.cancellationReason,
  pickedUpAt: bookingItems.pickedUpAt,
  pickedUpById: bookingItems.pickedUpById,
  returnedAt: bookingItems.returnedAt,
  returnCondition: bookingItems.returnCondition,
  damageNotes: bookingItems.damageNotes,
  damageCharge: bookingItems.damageCharge,
  depositRefunded: bookingItems.depositRefunded,
  cleaningRequired: bookingItems.cleaningRequired,
  maintenanceRequired: bookingItems.maintenanceRequired,
  collectedById: bookingItems.collectedById,
  createdAt: bookingItems.createdAt,
  updatedAt: bookingItems.updatedAt,
  productName: products.name,
  // The booked copy's own photo, falling back to the catalogue cover for
  // items added before photos moved onto the item itself.
  productImage: sql<string | null>`coalesce(${productVariations.image}, ${products.image})`,
  variationSku: productVariations.sku,
  variationBarcode: productVariations.barcode,
  variationColor: productVariations.color,
  variationSize: productVariations.size,
};

function bookingItemDetailBaseQuery() {
  return db
    .select(bookingItemDetailColumns)
    .from(bookingItems)
    .innerJoin(products, eq(bookingItems.productId, products.id))
    .innerJoin(
      productVariations,
      eq(bookingItems.variationId, productVariations.id),
    );
}

export type BookingItemDetail = Awaited<
  ReturnType<typeof bookingItemDetailBaseQuery>
>[number];

/** Every item belonging to one order, in creation order — the booking
 * detail page renders all of these together as one order. */
export async function getBookingItems(
  shopId: string,
  bookingId: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingItemDetail[]> {
  return bookingItemDetailBaseQuery()
    .where(
      and(
        eq(bookingItems.shopId, shopId),
        eq(bookingItems.bookingId, bookingId),
        staffScopeCondition(actor),
      ),
    )
    // Items created together in one order share the exact same
    // `createdAt` (one multi-row INSERT) — `id` breaks the tie so "Item 1"/
    // "Item 2" numbering on the detail page stays stable across reloads
    // instead of visually swapping at random.
    .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id));
}

export async function getBookingItemById(
  shopId: string,
  bookingId: string,
  itemId: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingItemDetail | null> {
  const [row] = await bookingItemDetailBaseQuery()
    .where(
      and(
        eq(bookingItems.shopId, shopId),
        eq(bookingItems.bookingId, bookingId),
        eq(bookingItems.id, itemId),
        staffScopeCondition(actor),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function resolveCustomer(shopId: string, customerId: string) {
  const [customer] = await db
    .select({ id: customers.id, isActive: customers.isActive })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.shopId, shopId)))
    .limit(1);

  if (!customer) {
    throw new AppError("Customer not found", 404, [
      { field: "customerId", message: "Choose a valid customer" },
    ]);
  }

  return customer;
}

/**
 * Who a new order is attributed to (`bookings.handledById`, frozen at
 * creation per CLAUDE.md rule 11). Only an `admin` may hand an order to
 * someone else — every other role's orders are always attributed to
 * themselves, straight from their own session, regardless of what (if
 * anything) is submitted here. This is enforced here, not just hidden in
 * the UI, so a crafted request body can't reassign an order either.
 */
async function resolveHandledById(
  actor: TenantSessionUser,
  requestedId: string | undefined,
): Promise<string> {
  if (actor.role !== "admin" || !requestedId) {
    return actor.id;
  }

  const [staff] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, requestedId), eq(users.shopId, actor.shopId)))
    .limit(1);

  if (!staff) {
    throw new AppError("Assigned staff member not found", 404, [
      { field: "handledById", message: "Choose a valid staff member" },
    ]);
  }

  return staff.id;
}

async function resolveVariation(
  shopId: string,
  variationId: string | undefined,
  barcode: string | undefined,
): Promise<VariationSearchResult> {
  if (variationId) {
    const variation = await getVariationForBooking(shopId, variationId);
    if (!variation) {
      throw new AppError("Item not found", 404, [
        { field: "barcode", message: "Item not found" },
      ]);
    }
    return variation;
  }

  if (barcode) {
    const variation = await getVariationByBarcode(shopId, barcode);
    if (!variation) {
      throw new AppError(`No item found for barcode '${barcode}'`, 404, [
        { field: "barcode", message: "No item found for this barcode" },
      ]);
    }
    return variation;
  }

  throw new AppError("Scan a barcode or choose an item", 400, [
    { field: "barcode", message: "Scan a barcode or choose an item" },
  ]);
}

async function generateBookingNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateBookingNumberCandidate();
    const [existing] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.bookingNumber, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  throw new AppError("Could not allocate a booking number, please retry", 503);
}

/** Prices and checks availability for an item/date range without creating
 * anything — backs the create form's live "check availability & price"
 * preview. `excludeBookingId` (kept under its original field name for the
 * validation schema/UI) is actually a `booking_items.id` now — it narrows
 * the check when previewing an edit to an *existing* item so the item's
 * own reservation never conflicts with itself. */
export async function quoteBooking(
  shopId: string,
  input: QuoteRequestInput,
): Promise<
  RentalQuote & {
    variationId: string;
    sku: string;
    barcode: string;
    productName: string;
    available: boolean;
    reason: string | null;
    conflicts: string[];
  }
> {
  const variation = await resolveVariation(
    shopId,
    input.variationId,
    input.barcode,
  );

  const requestedQuantity = Math.max(
    1,
    Math.trunc(Number(input.quantity ?? "1")),
  );

  const quote = quoteRental(
    variation,
    input.fromDate,
    input.toDate,
    input.discountAmount ?? ZERO_MONEY,
    requestedQuantity,
    {
      additionalCost: input.additionalCost,
      securityDepositPerUnit: input.securityDeposit,
    },
  );

  let excludeItemId: string | undefined;
  if (input.excludeBookingId) {
    const [owned] = await db
      .select({ id: bookingItems.id })
      .from(bookingItems)
      .where(
        and(
          eq(bookingItems.id, input.excludeBookingId),
          eq(bookingItems.shopId, shopId),
        ),
      )
      .limit(1);
    excludeItemId = owned?.id;
  }

  const availability = await checkAvailability(
    variation,
    input.fromDate,
    input.toDate,
    excludeItemId,
    requestedQuantity,
  );

  return {
    ...quote,
    variationId: variation.id,
    sku: variation.sku,
    barcode: variation.barcode,
    productName: variation.productName,
    available: availability.available,
    reason: availability.reason,
    conflicts: availability.conflictingBookingNumbers,
  };
}

/**
 * Creates one order with every item *line* as one atomic batch — a
 * customer often rents several different items for the same event (an
 * outfit plus accessories), and each distinct line becomes its own
 * `booking_items` row (its own dates/pricing/availability, since one
 * item might come back before another) sharing the one order this
 * creates. Renting more than one identical unit of the *same* line (e.g.
 * 2 of the same necklace) is a single row instead — `quantity` on that
 * one item, priced/paid/picked-up/returned together as a batch, not one
 * row per unit. Every availability/pricing/permission check runs for
 * every line *before* anything is written, so a problem with item 3 of 5
 * never leaves items 1-2 half-booked; the actual insert is one
 * multi-row `INSERT` inside a transaction, so it is all-or-nothing at
 * the database level too.
 *
 * Discount/security deposit/additional cost/advance are **order-level**
 * — one shared adjustment the counter agrees for the whole cart,
 * validated against the *combined* gross rent of every line, and stored
 * directly on the order row (no more "attach to the first line"
 * convention now that the order is its own row).
 */
export async function createBooking(
  actor: TenantSessionUser,
  input: CreateBookingInput,
): Promise<{ booking: BookingRow; items: BookingItemRow[] }> {
  await resolveCustomer(actor.shopId, input.customerId);
  const handledById = await resolveHandledById(actor, input.handledById);

  const prepared: {
    variation: VariationSearchResult;
    quote: RentalQuote;
    fromDate: string;
    toDate: string;
    quantity: number;
  }[] = [];

  for (const item of input.items) {
    const variation = await resolveVariation(
      actor.shopId,
      item.variationId,
      item.barcode,
    );

    const quantity = Math.max(1, Math.trunc(Number(item.quantity ?? "1")));
    // No per-line discount/deposit override/additional cost anymore —
    // every line prices as its plain gross rent plus its item's own
    // default deposit here; the order-level adjustments below are what
    // actually reduce/add to/replace the total.
    const quote = quoteRental(
      variation,
      item.fromDate,
      item.toDate,
      ZERO_MONEY,
      quantity,
    );
    prepared.push({
      variation,
      quote,
      fromDate: item.fromDate,
      toDate: item.toDate,
      quantity,
    });
  }

  // One capacity check per distinct variation, covering *every* cart line
  // that touches it at once (several friends of the groom booking the same
  // size for the same wedding, say) — see `assertCapacityAvailable`'s doc
  // comment for why this replaces a per-line/pairwise check.
  const requestsByVariation = new Map<
    string,
    { variation: VariationSearchResult; requests: CapacityRequest[] }
  >();
  for (const item of prepared) {
    const bucket = requestsByVariation.get(item.variation.id) ?? {
      variation: item.variation,
      requests: [] as CapacityRequest[],
    };
    bucket.requests.push({
      fromDate: item.fromDate,
      toDate: item.toDate,
      quantity: item.quantity,
    });
    requestsByVariation.set(item.variation.id, bucket);
  }

  for (const { variation, requests } of requestsByVariation.values()) {
    await assertCapacityAvailable(variation, requests);
  }

  // --- Order-level discount / additional cost / advance -----------------
  const orderGrossRent = prepared.reduce(
    (sum, item) => addMoney(sum, item.quote.grossRent),
    ZERO_MONEY,
  );

  const orderDiscount = input.discountAmount || ZERO_MONEY;
  if (isNegativeMoney(orderDiscount)) {
    throw new AppError("Discount cannot be negative", 400, [
      { field: "discountAmount", message: "Discount cannot be negative" },
    ]);
  }
  if (
    compareMoney(orderDiscount, ZERO_MONEY) > 0 &&
    !hasPermission(actor.role, Permission.BOOKING_DISCOUNT)
  ) {
    throw AppError.forbidden("You are not allowed to apply a discount");
  }
  if (compareMoney(orderDiscount, orderGrossRent) > 0) {
    throw new AppError("Discount cannot exceed the rental amount", 400, [
      {
        field: "discountAmount",
        message: "Discount cannot exceed the rental amount",
      },
    ]);
  }

  const orderAdditionalCost = input.additionalCost || ZERO_MONEY;
  if (isNegativeMoney(orderAdditionalCost)) {
    throw new AppError("Additional cost cannot be negative", 400, [
      { field: "additionalCost", message: "Additional cost cannot be negative" },
    ]);
  }
  const orderAdditionalCostReason =
    compareMoney(orderAdditionalCost, ZERO_MONEY) > 0
      ? input.additionalCostReason?.trim() || null
      : null;

  // Blank keeps every line's own item default deposit (summed below); a
  // value replaces that sum entirely.
  const defaultDepositTotal = prepared.reduce(
    (sum, item) => addMoney(sum, item.quote.securityDeposit),
    ZERO_MONEY,
  );
  const orderDepositOverridden = Boolean(input.securityDeposit);
  const orderDeposit = input.securityDeposit || defaultDepositTotal;
  if (isNegativeMoney(orderDeposit)) {
    throw new AppError("Security deposit cannot be negative", 400, [
      { field: "securityDeposit", message: "Security deposit cannot be negative" },
    ]);
  }

  const orderTotalAmount = addMoney(
    subtractMoneyNonNegative(orderGrossRent, orderDiscount),
    orderAdditionalCost,
  );
  const orderTotalReceivable = addMoney(orderTotalAmount, orderDeposit);

  const orderAdvance = input.advanceAmount || ZERO_MONEY;
  if (isNegativeMoney(orderAdvance)) {
    throw new AppError("Advance cannot be negative", 400, [
      { field: "advanceAmount", message: "Advance cannot be negative" },
    ]);
  }
  if (compareMoney(orderAdvance, orderTotalReceivable) > 0) {
    throw new AppError("Advance cannot exceed the amount due", 400, [
      { field: "advanceAmount", message: "Advance cannot exceed the amount due" },
    ]);
  }

  // Allocated before the transaction opens — same dev-pool-deadlock
  // reasoning documented on `addBookingItem` below.
  const bookingNumber = await generateBookingNumber();

  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(bookings)
        .values({
          bookingNumber,
          shopId: actor.shopId,
          customerId: input.customerId,
          discountAmount: orderDiscount,
          securityDeposit: orderDeposit,
          securityDepositOverridden: orderDepositOverridden,
          additionalCost: orderAdditionalCost,
          additionalCostReason: orderAdditionalCostReason,
          totalAmount: orderTotalAmount,
          notes: input.notes || null,
          documents: input.documents ?? [],
          createdById: actor.id,
          handledById,
        })
        .returning();

      const createdItems = await tx
        .insert(bookingItems)
        .values(
          prepared.map((item) => ({
            bookingId: order.id,
            shopId: actor.shopId,
            outletId: item.variation.outletId,
            productId: item.variation.productId,
            variationId: item.variation.id,
            fromDate: item.fromDate,
            toDate: item.toDate,
            totalDays: item.quote.totalDays,
            quantity: item.quantity,
            rentAmount: item.quote.rentAmount,
            grossRent: item.quote.grossRent,
          })),
        )
        .returning();

      for (const item of createdItems) {
        await queueBookingLifecycleNotifications(tx, order, item);
        await queueOwnerBookingNotification(tx, order, item.id, "owner_item_booked");
      }

      // Order-level advance — recorded the moment the order is created,
      // then the order is confirmed the same way a payment recorded
      // through the usual "Record payment" dialog would (doc's own
      // "Booking Created → Payment Recorded → Booking Confirmed" flow).
      if (compareMoney(orderAdvance, ZERO_MONEY) > 0) {
        const payment = await insertPaymentRow(tx, {
          shopId: actor.shopId,
          outletId: createdItems[0]?.outletId ?? null,
          bookingId: order.id,
          amount: orderAdvance,
          paymentType: "advance",
          paymentMethod: input.advancePaymentMethod ?? "cash",
          recordedById: actor.id,
        });
        const summary = computePaymentSummary(order, ZERO_MONEY, [payment]);

        const [updatedOrder] = await tx
          .update(bookings)
          .set({
            status: assertTransition(order.status, "confirmed"),
            paymentStatus: summary.status,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, order.id))
          .returning();

        // The order just left `draft` — every item created with it is
        // still sitting at its own default `draft` status (see the insert
        // above), which would permanently block pickup (`confirmPickup`
        // only allows `confirmed`/`pickup_pending` -> `rented`). Bring
        // them along to `confirmed` so the order and its items never
        // disagree about being past draft.
        const confirmedItems = await tx
          .update(bookingItems)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(
            and(
              eq(bookingItems.bookingId, order.id),
              eq(bookingItems.status, "draft"),
            ),
          )
          .returning();

        await recordAudit(tx, {
          shopId: actor.shopId,
          outletId: createdItems[0]?.outletId ?? null,
          userId: actor.id,
          action: AuditAction.PAYMENT_RECORDED,
          entityType: "payment",
          entityId: payment.id,
          summary: `${formatMoney(orderAdvance)} advance on ${order.bookingNumber}`,
          after: {
            amount: payment.amount,
            paymentType: payment.paymentType,
            paymentMethod: payment.paymentMethod,
          },
        });

        return { booking: updatedOrder, items: confirmedItems };
      }

      return { booking: order, items: createdItems };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("Could not save this booking — please try again", 409);
    }
    throw error;
  }
}

async function loadBookingForTenant(
  shopId: string,
  id: string,
): Promise<BookingRow> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.shopId, shopId)))
    .limit(1);

  if (!booking) {
    throw AppError.notFound("Booking not found");
  }

  return booking;
}

async function loadItemForTenant(
  shopId: string,
  bookingId: string,
  itemId: string,
): Promise<BookingItemRow> {
  const [item] = await db
    .select()
    .from(bookingItems)
    .where(
      and(
        eq(bookingItems.id, itemId),
        eq(bookingItems.bookingId, bookingId),
        eq(bookingItems.shopId, shopId),
      ),
    )
    .limit(1);

  if (!item) {
    throw AppError.notFound("Item not found");
  }

  return item;
}

/** Recomputes an order's `totalAmount` (sum of every non-cancelled item's
 * `grossRent`, minus the frozen discount — clamped down if a quantity
 * decrease/cancellation left it bigger than the new smaller rent — plus
 * `additionalCost`) and, when the deposit was never explicitly overridden,
 * its `securityDeposit` (sum of every active item's own current default
 * deposit). Called after anything that changes which items are active or
 * how big they are: adding/editing/cancelling an item, or changing
 * `additionalCost`. */
async function recomputeOrderTotal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  bookingId: string,
): Promise<BookingRow> {
  const [order] = await tx
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!order) {
    throw AppError.notFound("Booking not found");
  }

  const items = await tx
    .select({
      grossRent: bookingItems.grossRent,
      status: bookingItems.status,
      quantity: bookingItems.quantity,
      variationId: bookingItems.variationId,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId));

  const activeItems = items.filter((item) => item.status !== "cancelled");
  const grossTotal = activeItems.reduce(
    (sum, item) => addMoney(sum, item.grossRent),
    ZERO_MONEY,
  );

  const discountAmount =
    compareMoney(order.discountAmount, grossTotal) > 0
      ? grossTotal
      : order.discountAmount;

  const totalAmount = addMoney(
    subtractMoneyNonNegative(grossTotal, discountAmount),
    order.additionalCost,
  );

  let securityDeposit = order.securityDeposit;
  if (!order.securityDepositOverridden) {
    const variationIds = [...new Set(activeItems.map((item) => item.variationId))];
    const variationRows =
      variationIds.length > 0
        ? await tx
            .select({
              id: productVariations.id,
              securityDeposit: productVariations.securityDeposit,
            })
            .from(productVariations)
            .where(inArray(productVariations.id, variationIds))
        : [];
    const depositByVariation = new Map(
      variationRows.map((row) => [row.id, row.securityDeposit]),
    );
    securityDeposit = activeItems.reduce(
      (sum, item) =>
        addMoney(
          sum,
          multiplyMoneyByQuantity(
            depositByVariation.get(item.variationId) ?? ZERO_MONEY,
            item.quantity,
          ),
        ),
      ZERO_MONEY,
    );
  }

  const [updated] = await tx
    .update(bookings)
    .set({
      totalAmount,
      discountAmount,
      securityDeposit,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning();

  return updated;
}

/** Editing the order itself — the additional-cost charge (e.g. an agreed
 * late-return fee added after the fact) and notes. The customer, discount
 * and security deposit are all still fixed once created. */
export async function updateBookingOrder(
  actor: TenantSessionUser,
  id: string,
  input: UpdateBookingOrderInput,
): Promise<BookingRow> {
  const booking = await loadBookingForTenant(actor.shopId, id);

  if (!isEditable(booking.status)) {
    throw new AppError("This order can no longer be edited", 409);
  }

  const additionalCost =
    input.additionalCost !== undefined
      ? input.additionalCost || ZERO_MONEY
      : booking.additionalCost;
  const additionalCostReason =
    compareMoney(additionalCost, ZERO_MONEY) > 0
      ? input.additionalCostReason?.trim() || booking.additionalCostReason
      : null;

  return db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({
        additionalCost,
        additionalCostReason,
        notes: input.notes ?? booking.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, id), eq(bookings.shopId, actor.shopId)));

    return recomputeOrderTotal(tx, id);
  });
}

/** Editing one still-editable item's dates/quantity (decrease only —
 * cancel the item instead to remove it entirely). */
export async function updateBookingItem(
  actor: TenantSessionUser,
  bookingId: string,
  itemId: string,
  input: UpdateBookingItemInput,
): Promise<BookingItemRow> {
  await loadBookingForTenant(actor.shopId, bookingId);
  const item = await loadItemForTenant(actor.shopId, bookingId, itemId);

  if (!isEditable(item.status)) {
    throw new AppError(
      "Dates and quantity can only be changed before the item is picked up",
      409,
    );
  }

  // Quantity can only ever go *down* from here — increasing it would need
  // a fresh availability check against additional units, which is what
  // adding a new item is for. Omitted entirely keeps the current quantity.
  const requestedQuantity = input.quantity
    ? Math.max(1, Math.trunc(Number(input.quantity)))
    : item.quantity;
  if (requestedQuantity > item.quantity) {
    throw new AppError(
      "Quantity can only be reduced here — cancel this item and add a new one instead",
      400,
      [{ field: "quantity", message: "Cannot increase the quantity here" }],
    );
  }

  const variation = await resolveVariation(actor.shopId, item.variationId, undefined);

  await assertAvailable(
    variation,
    input.fromDate,
    input.toDate,
    item.id,
    requestedQuantity,
  );

  const quote = quoteRental(
    variation,
    input.fromDate,
    input.toDate,
    ZERO_MONEY,
    requestedQuantity,
  );

  return db.transaction(async (tx) => {
    await tx
      .update(bookingItems)
      .set({
        fromDate: input.fromDate,
        toDate: input.toDate,
        totalDays: quote.totalDays,
        quantity: requestedQuantity,
        rentAmount: quote.rentAmount,
        grossRent: quote.grossRent,
        updatedAt: new Date(),
      })
      .where(eq(bookingItems.id, itemId));

    await recomputeOrderTotal(tx, bookingId);

    const [updated] = await tx
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.id, itemId))
      .limit(1);

    return updated;
  });
}

/**
 * Adds one more item to an already-created order after the fact — e.g.
 * the customer decides they also want jewelry to go with the outfit they
 * already booked. No discount/additional-cost/deposit override of its
 * own — those are the *order's* shared adjustment, already sitting on the
 * order row (recomputed here to fold this item's rent in).
 */
export async function addBookingItem(
  actor: TenantSessionUser,
  bookingId: string,
  input: BookingItemInput,
): Promise<BookingItemRow> {
  const order = await loadBookingForTenant(actor.shopId, bookingId);

  if (order.status === "cancelled") {
    throw new AppError("Cannot add an item to a cancelled order", 409);
  }

  const variation = await resolveVariation(
    actor.shopId,
    input.variationId,
    input.barcode,
  );

  const quantity = Math.max(1, Math.trunc(Number(input.quantity ?? "1")));
  const quote = quoteRental(
    variation,
    input.fromDate,
    input.toDate,
    ZERO_MONEY,
    quantity,
  );

  await assertAvailable(variation, input.fromDate, input.toDate, undefined, quantity);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(bookingItems)
      .values({
        bookingId,
        shopId: actor.shopId,
        outletId: variation.outletId,
        productId: variation.productId,
        variationId: variation.id,
        fromDate: input.fromDate,
        toDate: input.toDate,
        totalDays: quote.totalDays,
        quantity,
        rentAmount: quote.rentAmount,
        grossRent: quote.grossRent,
        // A `draft` order's items all match it, but an order past `draft`
        // (confirmed/pickup_pending/rented) already has settled payments —
        // a new item should be immediately actionable too, not stuck at
        // `draft` forever (pickup only allows confirmed/pickup_pending ->
        // rented, never draft).
        status: order.status === "draft" ? "draft" : "confirmed",
      })
      .returning();

    await recomputeOrderTotal(tx, bookingId);

    await queueBookingLifecycleNotifications(tx, order, created);
    await queueOwnerBookingNotification(tx, order, created.id, "owner_item_booked");

    return created;
  });
}

/** Cancels one item within an order — the order itself, and every other
 * item in it, are unaffected. */
export async function cancelBookingItem(
  actor: TenantSessionUser,
  bookingId: string,
  itemId: string,
  reason: string | undefined,
): Promise<BookingItemRow> {
  const order = await loadBookingForTenant(actor.shopId, bookingId);
  const item = await loadItemForTenant(actor.shopId, bookingId, itemId);

  assertTransition(item.status, "cancelled");

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bookingItems)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(bookingItems.id, itemId))
      .returning();

    await recomputeOrderTotal(tx, bookingId);

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: updated.outletId,
      userId: actor.id,
      action: AuditAction.BOOKING_CANCELLED,
      entityType: "booking",
      entityId: updated.id,
      summary: `Item on ${order.bookingNumber} cancelled${reason ? `: ${reason}` : ""}`,
      before: { status: item.status },
      after: { status: "cancelled", cancellationReason: reason || null },
    });

    await queueOwnerBookingNotification(tx, order, itemId, "owner_item_cancelled");

    return updated;
  });
}

/** Cancels the whole order — cascades to every one of its items that
 * isn't already in a terminal state, so the order and its items never
 * disagree about being over. */
export async function cancelBookingOrder(
  actor: TenantSessionUser,
  id: string,
  reason: string | undefined,
): Promise<BookingRow> {
  const booking = await loadBookingForTenant(actor.shopId, id);

  assertTransition(booking.status, "cancelled");

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: reason || null,
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, id), eq(bookings.shopId, actor.shopId)))
      .returning();

    const items = await tx
      .select({ id: bookingItems.id, status: bookingItems.status })
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, id));

    // Only items that can actually still transition to `cancelled` are
    // touched — an item already `rented`/`return_pending`/`overdue` is
    // physically out with the customer and can only ever come back
    // through the normal Return flow, never a straight cancel (the state
    // machine agrees: `canTransition` says no). Cancelling the order
    // itself doesn't retroactively un-hand-over a physical item.
    const cancelledItemIds: string[] = [];
    for (const item of items) {
      if (item.status !== "cancelled" && canTransition(item.status, "cancelled")) {
        await tx
          .update(bookingItems)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            cancellationReason: reason || null,
            updatedAt: new Date(),
          })
          .where(eq(bookingItems.id, item.id));
        cancelledItemIds.push(item.id);
      }
    }

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: null,
      userId: actor.id,
      action: AuditAction.BOOKING_CANCELLED,
      entityType: "booking",
      entityId: updated.id,
      summary: `${updated.bookingNumber} cancelled${reason ? `: ${reason}` : ""}`,
      before: { status: booking.status },
      after: { status: "cancelled", cancellationReason: reason || null },
    });

    // Keeps totalAmount/discount/deposit consistent with which items are
    // actually cancelled now, same as a single item's own cancel — a
    // still-rented item's rent (and share of the deposit) stays counted.
    const recomputed = await recomputeOrderTotal(tx, id);

    await queueBookingNotification(tx, updated, "booking_cancelled");
    for (const itemId of cancelledItemIds) {
      await queueOwnerBookingNotification(tx, updated, itemId, "owner_item_cancelled");
    }

    return recomputed;
  });
}
