import "server-only";

import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
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
import { compareMoney, ZERO_MONEY } from "@/lib/money";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import {
  queueBookingLifecycleNotifications,
  queueBookingNotification,
} from "@/server/notifications/service";
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

/** A plain `staff` account only ever sees bookings attributed to them —
 * one staff member's customer relationships/handling shouldn't be visible
 * to another. `admin`/`super_admin`/`manager` see every booking in the
 * tenant, unrestricted (a manager supervises the whole outlet's staff).
 * Returns `undefined` (no extra restriction) for every other role. */
function staffScopeCondition(actor: Pick<TenantSessionUser, "id" | "role">) {
  return actor.role === "staff" ? eq(bookings.handledById, actor.id) : undefined;
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
      rentAmount: bookings.rentAmount,
      grossRent: bookings.grossRent,
      discountAmount: bookings.discountAmount,
      securityDeposit: bookings.securityDeposit,
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
      productImage: products.image,
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

  if (groupIds.length > 0) {
    const groupRows = await db
      .select({
        bookingGroupId: bookings.bookingGroupId,
        productName: products.name,
        productImage: products.image,
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
        }
        groupItemsMap[item.bookingGroupId].push({
          productName: item.productName,
          productImage: item.productImage,
          variationColor: item.variationColor,
          variationSize: item.variationSize,
        });
      }
    }
  }

  return {
    items: rows.map((row) => ({
      ...row,
      outletName: null,
      groupItems:
        row.bookingGroupId && groupItemsMap[row.bookingGroupId]?.length
          ? groupItemsMap[row.bookingGroupId]
          : [
              {
                productName: row.productName,
                productImage: row.productImage,
                variationColor: row.variationColor,
                variationSize: row.variationSize,
              },
            ],
    })),
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
      rentAmount: bookings.rentAmount,
      grossRent: bookings.grossRent,
      discountAmount: bookings.discountAmount,
      securityDeposit: bookings.securityDeposit,
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
      productImage: products.image,
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

  const quote = quoteRental(
    variation,
    input.fromDate,
    input.toDate,
    input.discountAmount ?? ZERO_MONEY,
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
    Math.max(1, Math.trunc(Number(input.quantity ?? "1"))),
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
 * Creates every item in a "cart" as one atomic batch — a customer often
 * rents several items for the same event (an outfit plus accessories),
 * and each becomes its own `bookings` row (its own dates/pricing/
 * availability, since one item might come back before another) linked by
 * a shared `bookingGroupId`. Availability/pricing/permission checks run
 * for every line *before* anything is written, so a problem with item 3
 * of 5 never leaves items 1-2 half-booked; the actual insert is one
 * multi-row `INSERT` inside a transaction, so it is all-or-nothing at the
 * database level too.
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

    const discount = item.discountAmount ?? ZERO_MONEY;
    if (
      compareMoney(discount, ZERO_MONEY) > 0 &&
      !hasPermission(actor.role, Permission.BOOKING_DISCOUNT)
    ) {
      throw AppError.forbidden("You are not allowed to apply a discount");
    }

    const quantity = Math.max(1, Math.trunc(Number(item.quantity ?? "1")));
    const quote = quoteRental(variation, item.fromDate, item.toDate, discount);
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

  const bookingGroupId = randomUUID();
  const usedNumbers = new Set<string>();
  const rows: (typeof bookings.$inferInsert)[] = [];

  for (const item of prepared) {
    // `quantity` identical physical units of the same line — each still
    // gets its own row/booking number/pickup-return lifecycle (one might
    // come back before another), just sharing dates, pricing and customer.
    for (let unit = 0; unit < item.quantity; unit += 1) {
      let bookingNumber = await generateBookingNumber();
      while (usedNumbers.has(bookingNumber)) {
        bookingNumber = await generateBookingNumber();
      }
      usedNumbers.add(bookingNumber);

      rows.push({
        bookingNumber,
        bookingGroupId,
        shopId: actor.shopId,
        outletId: item.variation.outletId,
        customerId: input.customerId,
        productId: item.variation.productId,
        variationId: item.variation.id,
        fromDate: item.fromDate,
        toDate: item.toDate,
        totalDays: item.quote.totalDays,
        rentAmount: item.quote.rentAmount,
        grossRent: item.quote.grossRent,
        discountAmount: item.quote.discountAmount,
        securityDeposit: item.quote.securityDeposit,
        totalAmount: item.quote.totalAmount,
        notes: input.notes || null,
        createdById: actor.id,
        handledById,
      });
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const created = await tx.insert(bookings).values(rows).returning();
      for (const booking of created) {
        await queueBookingLifecycleNotifications(tx, booking);
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

/** Editing a still-`draft` booking's dates/discount/notes — reprices and
 * re-checks availability exactly like creation. */
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

  // The discount is frozen at creation (like `handledById`) and never
  // editable afterward — only the pickup/return dates can change here.
  const discount = booking.discountAmount;

  const variation = await resolveVariation(
    actor.shopId,
    booking.variationId,
    undefined,
  );

  await assertAvailable(variation, input.fromDate, input.toDate, booking.id);

  const quote = quoteRental(variation, input.fromDate, input.toDate, discount);

  const [updated] = await db
    .update(bookings)
    .set({
      fromDate: input.fromDate,
      toDate: input.toDate,
      totalDays: quote.totalDays,
      rentAmount: quote.rentAmount,
      grossRent: quote.grossRent,
      discountAmount: quote.discountAmount,
      totalAmount: quote.totalAmount,
      notes: input.notes ?? booking.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, id), eq(bookings.shopId, actor.shopId)))
    .returning();

  return updated;
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

  return updated;
}
