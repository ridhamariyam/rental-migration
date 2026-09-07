import "server-only";

import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookings,
  customers,
  products,
  productVariations,
  users,
  type Booking,
} from "@/lib/db/schema";
import { assertTransition, isEditable } from "@/lib/booking-state";
import { generateBookingNumberCandidate } from "@/lib/booking-number";
import {
  compareMoney,
  addMoney,
  divideMoneyByInteger,
  isNegativeMoney,
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
  UpdateBookingInput,
} from "@/lib/validation/bookings";
import { bookingIdParamSchema } from "@/lib/validation/bookings";


export type BookingRow = Booking;

export type BookingGroupItemInfo = {
  productName: string;
  productImage: string | null;
  variationColor: string | null;
  variationSize: string | null;
};

export type BookingListItem = BookingRow & {
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  productName: string;
  productImage: string | null;
  variationSku: string;
  variationBarcode: string;
  variationColor: string | null;
  variationSize: string | null;
  outletName: string | null;
  handledByFirstName: string | null;
  handledByLastName: string | null;
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

/** Every role sees every booking in the tenant — staff included, so any
 * agent can look up a booking regardless of who created/handled it.
 * Kept as a function (returning `undefined`, i.e. no extra restriction)
 * so per-role scoping can be reintroduced later without touching every
 * call site. */
function staffScopeCondition(_actor: Pick<TenantSessionUser, "id" | "role">) {
  return undefined;
}

/**
 * Booking reads, always scoped to the caller's own tenant — same
 * discipline as every other list in this app. Search matches the booking
 * number or the customer's name/phone.
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
      outletId: bookings.outletId,
      bookingGroupId: bookings.bookingGroupId,
      customerId: bookings.customerId,
      productId: bookings.productId,
      variationId: bookings.variationId,
      fromDate: bookings.fromDate,
      toDate: bookings.toDate,
      totalDays: bookings.totalDays,
      quantity: bookings.quantity,
      rentAmount: bookings.rentAmount,
      grossRent: bookings.grossRent,
      discountAmount: bookings.discountAmount,
      securityDeposit: bookings.securityDeposit,
      additionalCost: bookings.additionalCost,
      additionalCostReason: bookings.additionalCostReason,
      documents: bookings.documents,
      totalAmount: bookings.totalAmount,
      paymentStatus: bookings.paymentStatus,
      status: bookings.status,
      cancelledAt: bookings.cancelledAt,
      cancellationReason: bookings.cancellationReason,
      notes: bookings.notes,
      pickedUpAt: bookings.pickedUpAt,
      pickedUpById: bookings.pickedUpById,
      returnedAt: bookings.returnedAt,
      returnCondition: bookings.returnCondition,
      damageNotes: bookings.damageNotes,
      damageCharge: bookings.damageCharge,
      depositRefunded: bookings.depositRefunded,
      cleaningRequired: bookings.cleaningRequired,
      maintenanceRequired: bookings.maintenanceRequired,
      collectedById: bookings.collectedById,
      createdById: bookings.createdById,
      handledById: bookings.handledById,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      productName: products.name,
      // The booked copy's own photo, falling back to the catalogue cover
      // for items added before photos moved onto the item itself.
      productImage: sql<string | null>`coalesce(${productVariations.image}, ${products.image})`,
      variationSku: productVariations.sku,
      variationBarcode: productVariations.barcode,
      variationColor: productVariations.color,
      variationSize: productVariations.size,
      handledByFirstName: users.firstName,
      handledByLastName: users.lastName,
    })
    .from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .innerJoin(products, eq(bookings.productId, products.id))
    .innerJoin(
      productVariations,
      eq(bookings.variationId, productVariations.id),
    )
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

  const groupIds = [
    ...new Set(
      rows
        .map((r) => r.bookingGroupId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const groupItemsMap: Record<string, BookingGroupItemInfo[]> = {};
  const groupAmountMap: Record<string, string> = {};

  if (groupIds.length > 0) {
    const groupRows = await db
      .select({
        bookingGroupId: bookings.bookingGroupId,
        totalAmount: bookings.totalAmount,
        productName: products.name,
        // The booked copy's own photo, falling back to the catalogue cover
        // for items added before photos moved onto the item itself.
        productImage: sql<string | null>`coalesce(${productVariations.image}, ${products.image})`,
        variationColor: productVariations.color,
        variationSize: productVariations.size,
      })
      .from(bookings)
      .innerJoin(products, eq(bookings.productId, products.id))
      .innerJoin(
        productVariations,
        eq(bookings.variationId, productVariations.id),
      )
      .where(
        and(
          eq(bookings.shopId, shopId),
          inArray(bookings.bookingGroupId, groupIds),
        ),
      );

    for (const item of groupRows) {
      if (item.bookingGroupId) {
        if (!groupItemsMap[item.bookingGroupId]) {
          groupItemsMap[item.bookingGroupId] = [];
          groupAmountMap[item.bookingGroupId] = ZERO_MONEY;
        }
        groupItemsMap[item.bookingGroupId].push({
          productName: item.productName,
          productImage: item.productImage,
          variationColor: item.variationColor,
          variationSize: item.variationSize,
        });
        groupAmountMap[item.bookingGroupId] = addMoney(
          groupAmountMap[item.bookingGroupId],
          item.totalAmount,
        );
      }
    }
  }

  // One order can span several bookings (one per physical unit — see
  // `createBooking`'s doc comment on why each unit gets its own pickup/
  // return lifecycle). The list still only ever shows one row per order:
  // the first booking encountered for a `bookingGroupId` stands in for
  // the whole group, with its amount replaced by the group's combined
  // total so it doesn't read as several near-duplicate ₹X charges.
  const seenGroupIds = new Set<string>();
  const items: BookingListItem[] = [];
  for (const row of rows) {
    if (row.bookingGroupId) {
      if (seenGroupIds.has(row.bookingGroupId)) {
        continue;
      }
      seenGroupIds.add(row.bookingGroupId);
    }

    const groupItems =
      row.bookingGroupId && groupItemsMap[row.bookingGroupId]?.length
        ? groupItemsMap[row.bookingGroupId]
        : [
            {
              productName: row.productName,
              productImage: row.productImage,
              variationColor: row.variationColor,
              variationSize: row.variationSize,
            },
          ];

    items.push({
      ...row,
      outletName: null,
      groupItems,
      totalAmount:
        row.bookingGroupId && groupItems.length > 1
          ? groupAmountMap[row.bookingGroupId]
          : row.totalAmount,
    });
  }

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

const ACTIVE_STATUSES: Booking["status"][] = [
  "confirmed",
  "pickup_pending",
  "rented",
  "return_pending",
  "overdue",
];

export async function getBookingStats(
  shopId: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingStats> {
  const scope = staffScopeCondition(actor);
  const scopedWhere = (...extra: (ReturnType<typeof eq> | undefined)[]) =>
    and(eq(bookings.shopId, shopId), scope, ...extra);

  const [totalRow, draftRow, cancelledRow, activeRows] = await Promise.all([
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
      .select({ status: bookings.status })
      .from(bookings)
      .where(scopedWhere()),
  ]);

  const active = activeRows.filter((row) =>
    ACTIVE_STATUSES.includes(row.status),
  ).length;

  return {
    total: totalRow[0]?.value ?? 0,
    draft: draftRow[0]?.value ?? 0,
    active,
    cancelled: cancelledRow[0]?.value ?? 0,
  };
}

export async function getBookingById(
  shopId: string,
  id: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingListItem | null> {
  const parsedId = bookingIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return null;
  }

  const [row] = await db
    .select({
      id: bookings.id,
      bookingNumber: bookings.bookingNumber,
      shopId: bookings.shopId,
      outletId: bookings.outletId,
      bookingGroupId: bookings.bookingGroupId,
      customerId: bookings.customerId,
      productId: bookings.productId,
      variationId: bookings.variationId,
      fromDate: bookings.fromDate,
      toDate: bookings.toDate,
      totalDays: bookings.totalDays,
      quantity: bookings.quantity,
      rentAmount: bookings.rentAmount,
      grossRent: bookings.grossRent,
      discountAmount: bookings.discountAmount,
      securityDeposit: bookings.securityDeposit,
      additionalCost: bookings.additionalCost,
      additionalCostReason: bookings.additionalCostReason,
      documents: bookings.documents,
      totalAmount: bookings.totalAmount,
      paymentStatus: bookings.paymentStatus,
      status: bookings.status,
      cancelledAt: bookings.cancelledAt,
      cancellationReason: bookings.cancellationReason,
      notes: bookings.notes,
      pickedUpAt: bookings.pickedUpAt,
      pickedUpById: bookings.pickedUpById,
      returnedAt: bookings.returnedAt,
      returnCondition: bookings.returnCondition,
      damageNotes: bookings.damageNotes,
      damageCharge: bookings.damageCharge,
      depositRefunded: bookings.depositRefunded,
      cleaningRequired: bookings.cleaningRequired,
      maintenanceRequired: bookings.maintenanceRequired,
      collectedById: bookings.collectedById,
      createdById: bookings.createdById,
      handledById: bookings.handledById,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      productName: products.name,
      // The booked copy's own photo, falling back to the catalogue cover
      // for items added before photos moved onto the item itself.
      productImage: sql<string | null>`coalesce(${productVariations.image}, ${products.image})`,
      variationSku: productVariations.sku,
      variationBarcode: productVariations.barcode,
      variationColor: productVariations.color,
      variationSize: productVariations.size,
      handledByFirstName: users.firstName,
      handledByLastName: users.lastName,
    })
    .from(bookings)
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .innerJoin(products, eq(bookings.productId, products.id))
    .innerJoin(
      productVariations,
      eq(bookings.variationId, productVariations.id),
    )
    .leftJoin(users, eq(bookings.handledById, users.id))
    .where(
      and(
        eq(bookings.id, parsedId.data.id),
        eq(bookings.shopId, shopId),
        staffScopeCondition(actor),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    outletName: null,
    groupItems: [
      {
        productName: row.productName,
        productImage: row.productImage,
        variationColor: row.variationColor,
        variationSize: row.variationSize,
      },
    ],
  };
}

/** Sibling line items created in the same multi-item submission (see
 * `createBookingGroup`), for the detail page's "part of this order"
 * section — excludes the booking being viewed itself. */
export async function getBookingsInGroup(
  shopId: string,
  groupId: string,
  excludeId: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<
  {
    id: string;
    bookingNumber: string;
    productName: string;
    variationColor: string | null;
    variationSize: string | null;
    status: Booking["status"];
    totalAmount: string;
    quantity: number;
  }[]
> {
  return db
    .select({
      id: bookings.id,
      bookingNumber: bookings.bookingNumber,
      productName: products.name,
      variationColor: productVariations.color,
      variationSize: productVariations.size,
      status: bookings.status,
      totalAmount: bookings.totalAmount,
      quantity: bookings.quantity,
    })
    .from(bookings)
    .innerJoin(products, eq(bookings.productId, products.id))
    .innerJoin(
      productVariations,
      eq(bookings.variationId, productVariations.id),
    )
    .where(
      and(
        eq(bookings.shopId, shopId),
        eq(bookings.bookingGroupId, groupId),
        ne(bookings.id, excludeId),
        staffScopeCondition(actor),
      ),
    )
    .orderBy(desc(bookings.createdAt));
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
 * Who a new booking is attributed to (`bookings.handledById`, frozen at
 * creation per CLAUDE.md rule 11). Only an `admin` may hand a booking to
 * someone else — every other role's bookings are always attributed to
 * themselves, straight from their own session, regardless of what (if
 * anything) is submitted here. This is enforced here, not just hidden in
 * the UI, so a crafted request body can't reassign a booking either.
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
 * a booking — backs the create form's live "check availability & price"
 * preview. */
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

  // Narrows the check for an edit-in-progress: verify the excluded booking
  // is actually this tenant's own before trusting it, same discipline as
  // every other client-supplied id in this service.
  let excludeBookingId: string | undefined;
  if (input.excludeBookingId) {
    const [owned] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.id, input.excludeBookingId),
          eq(bookings.shopId, shopId),
        ),
      )
      .limit(1);
    excludeBookingId = owned?.id;
  }

  const availability = await checkAvailability(
    variation,
    input.fromDate,
    input.toDate,
    excludeBookingId,
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
 * Creates every item *line* in a "cart" as one atomic batch — a customer
 * often rents several different items for the same event (an outfit plus
 * accessories), and each distinct line becomes its own `bookings` row
 * (its own dates/pricing/availability, since one item might come back
 * before another), linked by a shared `bookingGroupId`. Renting more than
 * one identical unit of the *same* line (e.g. 2 of the same necklace) is
 * a single row instead — `quantity` on that one booking, priced/paid/
 * picked-up/returned together as a batch, not one row per unit. Every
 * availability/pricing/permission check runs for every line *before*
 * anything is written, so a problem with item 3 of 5 never leaves items
 * 1-2 half-booked; the actual insert is one multi-row `INSERT` inside a
 * transaction, so it is all-or-nothing at the database level too.
 *
 * Discount/security deposit/additional cost/advance are **order-level**,
 * not per line — one shared adjustment the counter agrees for the whole
 * cart, validated against the *combined* gross rent of every line, then
 * attached to the first line created (its own `discountAmount`/
 * `securityDeposit`/`additionalCost` columns carry the whole order's
 * figure, every other line's stay `0`). This keeps each line a plain
 * `bookings` row — no separate "order" table needed — while the group's
 * total (every list/detail view already sums `totalAmount` across
 * `bookingGroupId`) still comes out exactly right. The one caveat: a
 * payment (or a deposit refund) recorded later against a *specific*
 * sibling line only affects that line's own balance, not the group's —
 * recording the advance here against the first line is the same
 * trade-off.
 */
export async function createBookingGroup(
  actor: TenantSessionUser,
  input: CreateBookingInput,
): Promise<BookingRow[]> {
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
  // Only kept when something was actually charged — a leftover reason
  // typed against an amount later cleared to zero would otherwise show up
  // on the receipt as a charge that isn't there.
  const orderAdditionalCostReason =
    compareMoney(orderAdditionalCost, ZERO_MONEY) > 0
      ? input.additionalCostReason?.trim() || null
      : null;

  // Blank keeps every line's own item default deposit (summed below); a
  // value replaces that sum entirely, held wholly against the first line —
  // same trade-off as the discount/additional cost above.
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

  const orderAdvance = input.advanceAmount || ZERO_MONEY;
  if (isNegativeMoney(orderAdvance)) {
    throw new AppError("Advance cannot be negative", 400, [
      { field: "advanceAmount", message: "Advance cannot be negative" },
    ]);
  }
  const orderTotalReceivable = prepared.reduce((sum, item, index) => {
    const discount = index === 0 ? orderDiscount : ZERO_MONEY;
    const additionalCost = index === 0 ? orderAdditionalCost : ZERO_MONEY;
    const securityDeposit = orderDepositOverridden
      ? index === 0
        ? orderDeposit
        : ZERO_MONEY
      : item.quote.securityDeposit;
    const totalAmount = addMoney(
      subtractMoneyNonNegative(item.quote.grossRent, discount),
      additionalCost,
    );
    return addMoney(addMoney(sum, totalAmount), securityDeposit);
  }, ZERO_MONEY);
  if (compareMoney(orderAdvance, orderTotalReceivable) > 0) {
    throw new AppError("Advance cannot exceed the amount due", 400, [
      { field: "advanceAmount", message: "Advance cannot exceed the amount due" },
    ]);
  }

  const bookingGroupId = randomUUID();
  const usedNumbers = new Set<string>();
  const rows: (typeof bookings.$inferInsert)[] = [];

  prepared.forEach((item, index) => {
    const discountAmount = index === 0 ? orderDiscount : ZERO_MONEY;
    const additionalCost = index === 0 ? orderAdditionalCost : ZERO_MONEY;
    const additionalCostReason = index === 0 ? orderAdditionalCostReason : null;
    const securityDeposit = orderDepositOverridden
      ? index === 0
        ? orderDeposit
        : ZERO_MONEY
      : item.quote.securityDeposit;
    const totalAmount = addMoney(
      subtractMoneyNonNegative(item.quote.grossRent, discountAmount),
      additionalCost,
    );

    rows.push({
      bookingNumber: "", // replaced below, one allocation per row
      bookingGroupId,
      shopId: actor.shopId,
      outletId: item.variation.outletId,
      customerId: input.customerId,
      productId: item.variation.productId,
      variationId: item.variation.id,
      fromDate: item.fromDate,
      toDate: item.toDate,
      totalDays: item.quote.totalDays,
      quantity: item.quantity,
      rentAmount: item.quote.rentAmount,
      grossRent: item.quote.grossRent,
      discountAmount,
      securityDeposit,
      additionalCost,
      additionalCostReason,
      totalAmount,
      notes: input.notes || null,
      documents: input.documents ?? [],
      createdById: actor.id,
      handledById,
    });
  });

  for (const row of rows) {
    let bookingNumber = await generateBookingNumber();
    while (usedNumbers.has(bookingNumber)) {
      bookingNumber = await generateBookingNumber();
    }
    usedNumbers.add(bookingNumber);
    row.bookingNumber = bookingNumber;
  }

  try {
    return await db.transaction(async (tx) => {
      const created = await tx.insert(bookings).values(rows).returning();
      for (const booking of created) {
        await queueBookingLifecycleNotifications(tx, booking);
        await queueOwnerBookingNotification(tx, booking, "owner_item_booked");
      }

      // Order-level advance — recorded against the first line the moment
      // the booking is created, then every line in the group is confirmed
      // the same way a payment recorded through the usual "Record
      // payment" dialog would (doc's own "Booking Created → Payment
      // Recorded → Booking Confirmed" flow), since the advance was agreed
      // for the whole cart, not just that one line.
      if (compareMoney(orderAdvance, ZERO_MONEY) > 0) {
        const primary = created[0];
        const payment = await insertPaymentRow(tx, {
          shopId: actor.shopId,
          outletId: primary.outletId,
          bookingId: primary.id,
          amount: orderAdvance,
          paymentType: "advance",
          paymentMethod: input.advancePaymentMethod ?? "cash",
          recordedById: actor.id,
        });
        const summary = computePaymentSummary(primary, [payment]);

        for (const booking of created) {
          await tx
            .update(bookings)
            .set({
              status: assertTransition(booking.status, "confirmed"),
              paymentStatus:
                booking.id === primary.id ? summary.status : booking.paymentStatus,
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, booking.id));
        }

        await recordAudit(tx, {
          shopId: actor.shopId,
          outletId: primary.outletId,
          userId: actor.id,
          action: AuditAction.PAYMENT_RECORDED,
          entityType: "payment",
          entityId: payment.id,
          summary: `${formatMoney(orderAdvance)} advance on ${primary.bookingNumber}`,
          after: {
            amount: payment.amount,
            paymentType: payment.paymentType,
            paymentMethod: payment.paymentMethod,
          },
        });
      }

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A booking number collided with a row inserted by a fully
      // concurrent request between the check above and this insert —
      // vanishingly unlikely (a 6-digit random space checked per row), but
      // surface it as a clean retry instead of a raw driver error.
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

/** Editing a still-editable booking's dates/quantity/additional cost/notes
 * — reprices and re-checks availability exactly like creation. */
export async function updateBooking(
  actor: TenantSessionUser,
  id: string,
  input: UpdateBookingInput,
): Promise<BookingRow> {
  const booking = await loadBookingForTenant(actor.shopId, id);

  if (!isEditable(booking.status)) {
    throw new AppError(
      "Dates and pricing can only be changed before the item is picked up",
      409,
    );
  }

  // Quantity can only ever go *down* from here — increasing it would need
  // a fresh availability check against additional units, which is what
  // adding a new line is for. Omitted entirely keeps the current quantity.
  const requestedQuantity = input.quantity
    ? Math.max(1, Math.trunc(Number(input.quantity)))
    : booking.quantity;
  if (requestedQuantity > booking.quantity) {
    throw new AppError(
      "Quantity can only be reduced here — cancel this item and create a new booking to add more",
      400,
      [{ field: "quantity", message: "Cannot increase the quantity here" }],
    );
  }

  const variation = await resolveVariation(
    actor.shopId,
    booking.variationId,
    undefined,
  );

  await assertAvailable(
    variation,
    input.fromDate,
    input.toDate,
    booking.id,
    requestedQuantity,
  );

  // The deposit is frozen at creation exactly like the discount is —
  // re-quoting here re-derives it per unit and multiplies by whatever
  // quantity this edit ends up with, rather than re-reading the item's
  // current price list.
  const depositPerUnit = divideMoneyByInteger(
    booking.securityDeposit,
    Math.max(1, booking.quantity),
  );

  // The additional cost may now be edited (e.g. an agreed late-return fee
  // added after the fact) — omitted, it stays whatever it already was.
  const additionalCost =
    input.additionalCost !== undefined
      ? input.additionalCost || ZERO_MONEY
      : booking.additionalCost;
  const additionalCostReason =
    compareMoney(additionalCost, ZERO_MONEY) > 0
      ? input.additionalCostReason?.trim() || booking.additionalCostReason
      : null;

  // The discount is frozen at creation (like `handledById`) and never
  // editable here — but it was agreed against the *original* quantity's
  // gross rent, so a reduction has to clamp it down rather than let it
  // exceed (or even go negative against) the new, smaller rent.
  const rebasedQuote = quoteRental(
    variation,
    input.fromDate,
    input.toDate,
    ZERO_MONEY,
    requestedQuantity,
    { securityDepositPerUnit: depositPerUnit },
  );
  const discount =
    compareMoney(booking.discountAmount, rebasedQuote.grossRent) > 0
      ? rebasedQuote.grossRent
      : booking.discountAmount;

  const quote = quoteRental(
    variation,
    input.fromDate,
    input.toDate,
    discount,
    requestedQuantity,
    {
      additionalCost,
      securityDepositPerUnit: depositPerUnit,
    },
  );

  const [updated] = await db
    .update(bookings)
    .set({
      fromDate: input.fromDate,
      toDate: input.toDate,
      totalDays: quote.totalDays,
      quantity: requestedQuantity,
      rentAmount: quote.rentAmount,
      grossRent: quote.grossRent,
      discountAmount: quote.discountAmount,
      securityDeposit: quote.securityDeposit,
      additionalCost: quote.additionalCost,
      additionalCostReason,
      totalAmount: quote.totalAmount,
      notes: input.notes ?? booking.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, id), eq(bookings.shopId, actor.shopId)))
    .returning();

  return updated;
}

/**
 * Adds one more line to an existing order after the fact — e.g. the
 * customer decides they also want jewelry to go with the outfit they
 * already booked. Shares the anchor booking's `bookingGroupId`/
 * `customerId`/notes/documents/`handledById`, priced and availability-
 * checked exactly like a brand-new line in `createBookingGroup`, but with
 * no discount/additional cost/deposit override of its own — those are the
 * *order's* shared adjustment, already attached to whichever line already
 * carries them (see `createBookingGroup`'s doc comment).
 */
export async function addItemToBookingGroup(
  actor: TenantSessionUser,
  anchorBookingId: string,
  input: BookingItemInput,
): Promise<BookingRow> {
  const anchor = await loadBookingForTenant(actor.shopId, anchorBookingId);

  if (!isEditable(anchor.status)) {
    throw new AppError(
      "Items can only be added before the order is picked up",
      409,
    );
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

  // Allocated before the transaction opens — `generateBookingNumber` reads
  // through the plain `db` pool (not `tx`), and this dev setup's pool is
  // `max: 1`, so calling it *inside* the transaction below would deadlock
  // waiting for a second connection the transaction itself is holding.
  const bookingNumber = await generateBookingNumber();

  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(bookings)
        .values({
          bookingNumber,
          bookingGroupId: anchor.bookingGroupId,
          shopId: actor.shopId,
          outletId: variation.outletId,
          customerId: anchor.customerId,
          productId: variation.productId,
          variationId: variation.id,
          fromDate: input.fromDate,
          toDate: input.toDate,
          totalDays: quote.totalDays,
          quantity,
          rentAmount: quote.rentAmount,
          grossRent: quote.grossRent,
          discountAmount: ZERO_MONEY,
          securityDeposit: quote.securityDeposit,
          additionalCost: ZERO_MONEY,
          additionalCostReason: null,
          totalAmount: quote.totalAmount,
          notes: anchor.notes,
          documents: anchor.documents,
          createdById: actor.id,
          handledById: anchor.handledById,
        })
        .returning();

      await queueBookingLifecycleNotifications(tx, created);
      await queueOwnerBookingNotification(tx, created, "owner_item_booked");

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("Could not save this item — please try again", 409);
    }
    throw error;
  }
}


export async function cancelBooking(
  actor: TenantSessionUser,
  id: string,
  reason: string | undefined,
): Promise<BookingRow> {
  const booking = await loadBookingForTenant(actor.shopId, id);

  assertTransition(booking.status, "cancelled");

  const [updated] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason || null,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, id), eq(bookings.shopId, actor.shopId)))
    .returning();

  await recordAudit(db, {
    shopId: actor.shopId,
    outletId: updated.outletId,
    userId: actor.id,
    action: AuditAction.BOOKING_CANCELLED,
    entityType: "booking",
    entityId: updated.id,
    summary: `${updated.bookingNumber} cancelled${reason ? `: ${reason}` : ""}`,
    before: { status: booking.status },
    after: { status: "cancelled", cancellationReason: reason || null },
  });

  await queueBookingNotification(db, updated, "booking_cancelled");
  await queueOwnerBookingNotification(db, updated, "owner_item_cancelled");

  return updated;
}
