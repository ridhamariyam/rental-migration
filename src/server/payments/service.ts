import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { bookings, customers, payments, products, productVariations, shops, users, type Booking, type Payment } from "@/lib/db/schema";
import { assertTransition } from "@/lib/booking-state";
import { formatMoney } from "@/lib/format";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import {
  addMoney,
  compareMoney,
  nonNegativeMoney,
  subtractMoney,
  subtractMoneyNonNegative,
  ZERO_MONEY,
} from "@/lib/money";
import type { RecordPaymentInput } from "@/lib/validation/payments";

export type PaymentRow = Payment;

/**
 * Everything the counter needs to know about one booking's money, always
 * *derived* by summing the immutable `payments` ledger — never a single
 * mutable field (CLAUDE.md's rule, ported exactly from the legacy
 * `PaymentService.summarise`). `rentPayable` folds in `booking.damageCharge`
 * (Phase 13's return workflow) — `damage_charge` payments are how that
 * charge is actually recovered (from the deposit first, then owed as a
 * balance), so it has to count as part of what's payable, exactly like the
 * legacy `rent_payable = total_amount + damage_charge`.
 */
export type PaymentSummary = {
  rentPayable: string;
  securityDeposit: string;
  totalReceivable: string;
  advancePaid: string;
  balancePaid: string;
  depositCollected: string;
  refunded: string;
  depositReleased: string;
  rentCollected: string;
  rentBalance: string;
  depositBalance: string;
  depositHeld: string;
  outstanding: string;
  status: Booking["paymentStatus"];
};

export function sumByType(
  rows: { paymentType: Payment["paymentType"]; amount: string }[],
  type: Payment["paymentType"],
): string {
  return rows
    .filter((row) => row.paymentType === type)
    .reduce((sum, row) => addMoney(sum, row.amount), ZERO_MONEY);
}

export function computePaymentSummary(
  booking: Pick<Booking, "totalAmount" | "securityDeposit" | "damageCharge">,
  paymentRows: { paymentType: Payment["paymentType"]; amount: string }[],
): PaymentSummary {
  const advance = sumByType(paymentRows, "advance");
  const balance = sumByType(paymentRows, "balance");
  const depositIn = sumByType(paymentRows, "security_deposit");
  const refunded = sumByType(paymentRows, "refund");
  const depositOut = sumByType(paymentRows, "deposit_release");

  const rentPayable = addMoney(booking.totalAmount, booking.damageCharge);
  const depositDue = booking.securityDeposit;

  // Refunds first offset over-collected rent, then the deposit (matches
  // the legacy `PaymentService.summarise` exactly).
  const rentCollected = subtractMoney(addMoney(advance, balance), refunded);
  const rentBalance = subtractMoney(rentPayable, rentCollected);
  const depositBalance = subtractMoney(depositDue, depositIn);
  const depositHeld = nonNegativeMoney(subtractMoney(depositIn, depositOut));

  const outstanding = addMoney(
    nonNegativeMoney(rentBalance),
    nonNegativeMoney(depositBalance),
  );

  let status: Booking["paymentStatus"];
  if (compareMoney(outstanding, ZERO_MONEY) <= 0) {
    status = "paid";
  } else if (
    compareMoney(rentCollected, ZERO_MONEY) > 0 ||
    compareMoney(depositIn, ZERO_MONEY) > 0
  ) {
    status = "partial";
  } else {
    status = "unpaid";
  }

  if (
    compareMoney(refunded, ZERO_MONEY) > 0 &&
    compareMoney(rentCollected, ZERO_MONEY) <= 0 &&
    compareMoney(depositHeld, ZERO_MONEY) <= 0
  ) {
    status = "refunded";
  }

  return {
    rentPayable,
    securityDeposit: depositDue,
    totalReceivable: addMoney(rentPayable, depositDue),
    advancePaid: advance,
    balancePaid: balance,
    depositCollected: depositIn,
    refunded,
    depositReleased: depositOut,
    rentCollected,
    rentBalance,
    depositBalance,
    depositHeld,
    outstanding,
    status,
  };
}

async function loadBookingForTenant(
  shopId: string,
  bookingId: string,
): Promise<Booking> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.shopId, shopId)))
    .limit(1);

  if (!booking) {
    throw AppError.notFound("Booking not found");
  }

  return booking;
}

/** Any function running inside a `db.transaction()` callback receives this
 * same transaction-scoped client shape — inferred straight from `db
.transaction` itself so it never drifts from whatever driver/schema `db`
 * actually uses. */
export type PaymentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Inserts one payment row using an *already-open* transaction, with no
 * permission check of its own — for money movements a workflow generates
 * as a side effect of an already-authorized action, not a user picking a
 * type in the "Record payment" dialog. Used by
 * `src/server/bookings/lifecycle.ts`'s return settlement (the
 * `deposit_release`/`damage_charge` pair, and the deposit refund itself),
 * mirroring the legacy `PaymentService.record(..., skip_permission_check=
 * True)` call sites exactly — the *outer* action (return) is already
 * gated by `BOOKING_RETURN`, so re-checking `PAYMENT_REFUND` here would
 * just be redundant, not safer.
 */
export async function insertPaymentRow(
  tx: PaymentTx,
  params: {
    shopId: string;
    outletId: string | null;
    bookingId: string;
    amount: string;
    paymentType: Payment["paymentType"];
    paymentMethod: Payment["paymentMethod"];
    referenceNumber?: string | null;
    note?: string | null;
    recordedById: string;
  },
): Promise<PaymentRow> {
  const [payment] = await tx
    .insert(payments)
    .values({
      shopId: params.shopId,
      outletId: params.outletId,
      bookingId: params.bookingId,
      amount: params.amount,
      paymentType: params.paymentType,
      paymentMethod: params.paymentMethod,
      referenceNumber: params.referenceNumber ?? null,
      note: params.note ?? null,
      recordedById: params.recordedById,
    })
    .returning();

  return payment;
}

async function getPaymentsForBooking(bookingId: string): Promise<PaymentRow[]> {
  return db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .orderBy(desc(payments.createdAt));
}

export async function listPaymentsForBooking(
  shopId: string,
  bookingId: string,
): Promise<{ payments: PaymentRow[]; summary: PaymentSummary }> {
  const booking = await loadBookingForTenant(shopId, bookingId);
  const rows = await getPaymentsForBooking(booking.id);
  return { payments: rows, summary: computePaymentSummary(booking, rows) };
}

const REFUND_TYPES: Payment["paymentType"][] = ["refund", "deposit_release"];

/**
 * Appends one money movement to a booking's ledger. Recording a
 * qualifying (non-refund) payment against a still-`draft` booking also
 * confirms it (`draft -> confirmed`) — matches the client requirements
 * doc's own "Booking Created → Payment Recorded → Booking Confirmed" flow,
 * and is the reason `bookingStatusEnum`'s doc comment calls out "once a
 * qualifying payment lands" as this phase's job.
 */
export async function recordPayment(
  actor: TenantSessionUser,
  bookingId: string,
  input: RecordPaymentInput,
): Promise<{ payment: PaymentRow; summary: PaymentSummary }> {
  const requiredPermission = REFUND_TYPES.includes(input.paymentType)
    ? Permission.PAYMENT_REFUND
    : Permission.PAYMENT_RECORD;

  if (!hasPermission(actor.role, requiredPermission)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const booking = await loadBookingForTenant(actor.shopId, bookingId);

  if (booking.status === "cancelled") {
    throw new AppError("Cannot record a payment against a cancelled booking", 409);
  }

  const { payment: inserted, summary } = await db.transaction(async (tx) => {
    // Read the ledger *before* inserting the new row, so an outflow
    // (refund/deposit release) can be checked against what's actually been
    // collected so far — otherwise a booking can end up "refunded" money
    // that was never paid in, which is exactly the confusing state this
    // guards against.
    const existingRows = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, booking.id));

    if (REFUND_TYPES.includes(input.paymentType)) {
      const collectedTotal = addMoney(
        addMoney(
          sumByType(existingRows, "advance"),
          sumByType(existingRows, "balance"),
        ),
        sumByType(existingRows, "security_deposit"),
      );
      const alreadyReturned = addMoney(
        sumByType(existingRows, "refund"),
        sumByType(existingRows, "deposit_release"),
      );
      const refundable = subtractMoneyNonNegative(
        collectedTotal,
        alreadyReturned,
      );

      if (compareMoney(input.amount, refundable) > 0) {
        throw new AppError(
          `Cannot refund more than the ${formatMoney(refundable)} already collected for this booking`,
          400,
          [
            {
              field: "amount",
              message: `Cannot exceed ${formatMoney(refundable)} still refundable`,
            },
          ],
        );
      }
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        shopId: actor.shopId,
        outletId: booking.outletId,
        bookingId: booking.id,
        amount: input.amount,
        paymentType: input.paymentType,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber || null,
        note: input.note || null,
        recordedById: actor.id,
      })
      .returning();

    const rows = [...existingRows, payment];

    const paymentSummary = computePaymentSummary(booking, rows);

    const nextStatus =
      booking.status === "draft" && !REFUND_TYPES.includes(input.paymentType)
        ? "confirmed"
        : booking.status;

    await tx
      .update(bookings)
      .set({
        paymentStatus: paymentSummary.status,
        status:
          nextStatus === booking.status
            ? booking.status
            : assertTransition(booking.status, nextStatus),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: booking.outletId,
      userId: actor.id,
      action: REFUND_TYPES.includes(input.paymentType)
        ? AuditAction.PAYMENT_REFUNDED
        : AuditAction.PAYMENT_RECORDED,
      entityType: "payment",
      entityId: payment.id,
      summary: `${formatMoney(input.amount)} ${input.paymentType.replace("_", " ")} on ${booking.bookingNumber}`,
      after: {
        amount: payment.amount,
        paymentType: payment.paymentType,
        paymentMethod: payment.paymentMethod,
      },
    });

    return { payment, summary: paymentSummary };
  });

  return { payment: inserted, summary };
}

export type BookingReceipt = {
  booking: {
    id: string;
    bookingNumber: string;
    fromDate: string;
    toDate: string;
    totalDays: number;
    status: Booking["status"];
  };
  shop: { id: string; name: string; address: string | null; phone: string | null };
  customer: { id: string; name: string; phone: string };
  item: {
    productName: string;
    sku: string;
    color: string | null;
    size: string | null;
  };
  charges: {
    rentAmount: string;
    totalDays: number;
    grossRent: string;
    discountAmount: string;
    totalAmount: string;
    damageCharge: string;
    securityDeposit: string;
  };
  summary: PaymentSummary;
  payments: {
    id: string;
    amount: string;
    paymentType: Payment["paymentType"];
    paymentMethod: Payment["paymentMethod"];
    referenceNumber: string | null;
    createdAt: Date;
    recordedByName: string | null;
  }[];
};

export async function getReceipt(
  shopId: string,
  bookingId: string,
  actor: Pick<TenantSessionUser, "id" | "role">,
): Promise<BookingReceipt | null> {
  const [row] = await db
    .select({
      booking: bookings,
      shopName: shops.name,
      shopAddress: shops.address,
      shopPhone: shops.phone,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      productName: products.name,
      variationSku: productVariations.sku,
      variationColor: productVariations.color,
      variationSize: productVariations.size,
    })
    .from(bookings)
    .innerJoin(shops, eq(bookings.shopId, shops.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .innerJoin(products, eq(bookings.productId, products.id))
    .innerJoin(
      productVariations,
      eq(bookings.variationId, productVariations.id),
    )
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.shopId, shopId),
        // Same "staff only sees their own bookings" rule as
        // `bookings/service.ts`'s `staffScopeCondition` — kept as a local
        // inline check rather than importing that helper, since this is
        // the one place outside `bookings/service.ts` that reads a full
        // booking row directly.
        actor.role === "staff" ? eq(bookings.handledById, actor.id) : undefined,
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const paymentRows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      paymentType: payments.paymentType,
      paymentMethod: payments.paymentMethod,
      referenceNumber: payments.referenceNumber,
      createdAt: payments.createdAt,
      recordedByFirstName: users.firstName,
      recordedByLastName: users.lastName,
    })
    .from(payments)
    .leftJoin(users, eq(payments.recordedById, users.id))
    .where(eq(payments.bookingId, bookingId))
    .orderBy(desc(payments.createdAt));

  const summary = computePaymentSummary(row.booking, paymentRows);

  return {
    booking: {
      id: row.booking.id,
      bookingNumber: row.booking.bookingNumber,
      fromDate: row.booking.fromDate,
      toDate: row.booking.toDate,
      totalDays: row.booking.totalDays,
      status: row.booking.status,
    },
    shop: {
      id: row.booking.shopId,
      name: row.shopName,
      address: row.shopAddress,
      phone: row.shopPhone,
    },
    customer: {
      id: row.booking.customerId,
      name: `${row.customerFirstName} ${row.customerLastName}`,
      phone: row.customerPhone,
    },
    item: {
      productName: row.productName,
      sku: row.variationSku,
      color: row.variationColor,
      size: row.variationSize,
    },
    charges: {
      rentAmount: row.booking.rentAmount,
      totalDays: row.booking.totalDays,
      grossRent: row.booking.grossRent,
      discountAmount: row.booking.discountAmount,
      totalAmount: row.booking.totalAmount,
      damageCharge: row.booking.damageCharge,
      securityDeposit: row.booking.securityDeposit,
    },
    summary,
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      paymentType: payment.paymentType,
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber,
      createdAt: payment.createdAt,
      recordedByName: payment.recordedByFirstName
        ? `${payment.recordedByFirstName} ${payment.recordedByLastName}`
        : null,
    })),
  };
}
