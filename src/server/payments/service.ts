import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookingItems,
  bookings,
  customers,
  payments,
  products,
  productVariations,
  shops,
  users,
  type Booking,
  type Payment,
} from "@/lib/db/schema";
import { assertTransition } from "@/lib/booking-state";
import { formatMoney } from "@/lib/format";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import { queueBookingNotification } from "@/server/notifications/service";
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
 * Everything the counter needs to know about one **order's** money,
 * always *derived* by summing the immutable `payments` ledger — never a
 * single mutable field (CLAUDE.md's rule, ported exactly from the legacy
 * `PaymentService.summarise`). `rentPayable` folds in the sum of every
 * one of the order's items' own `damageCharge` (Phase 13's return
 * workflow — damage is now recorded per item, but it's payable as part
 * of the order's one combined ledger) — `damage_charge` payments are how
 * that charge is actually recovered (from the deposit first, then owed
 * as a balance), so it has to count as part of what's payable, exactly
 * like the legacy `rent_payable = total_amount + damage_charge`.
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
  /** The flip side of `outstanding`: money already collected that now
   * exceeds what's payable (e.g. an item was cancelled after its rent was
   * already paid) — a refund the shop owes the customer. Zero in the
   * common case; `outstanding` and `creditBalance` are never both
   * positive at once (one side of the ledger nets to zero first). */
  creditBalance: string;
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
  booking: Pick<Booking, "totalAmount" | "securityDeposit">,
  totalDamageCharge: string,
  paymentRows: { paymentType: Payment["paymentType"]; amount: string }[],
): PaymentSummary {
  const advance = sumByType(paymentRows, "advance");
  const balance = sumByType(paymentRows, "balance");
  const depositIn = sumByType(paymentRows, "security_deposit");
  const refunded = sumByType(paymentRows, "refund");
  const depositOut = sumByType(paymentRows, "deposit_release");

  const rentPayable = addMoney(booking.totalAmount, totalDamageCharge);
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

  // A negative balance means more was collected than is now payable (most
  // often: an already-paid item got cancelled, shrinking rentPayable) —
  // surface it as a credit owed back to the customer instead of silently
  // clamping it away like `outstanding` does.
  const creditBalance = addMoney(
    nonNegativeMoney(subtractMoney(ZERO_MONEY, rentBalance)),
    nonNegativeMoney(subtractMoney(ZERO_MONEY, depositBalance)),
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
    creditBalance,
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

/** Sum of `damageCharge` across every item in this order — damage is
 * recorded per item at return time, but it's payable as part of the
 * order's one combined ledger. Exported for `bookings/lifecycle.ts`'s
 * return workflow, which needs this same figure mid-transaction. */
export async function sumOrderDamageCharge(
  executor: PaymentTx | typeof db,
  bookingId: string,
): Promise<string> {
  const rows = await executor
    .select({ damageCharge: bookingItems.damageCharge })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId));

  return rows.reduce((sum, row) => addMoney(sum, row.damageCharge), ZERO_MONEY);
}

/** The order's own outlet, for snapshotting onto a payment row — taken
 * from whichever item was created first, since the order itself no
 * longer has one fixed outlet (an order's items usually share one, but
 * nothing enforces that). */
async function resolveOrderOutletId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ outletId: bookingItems.outletId })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))
    // Items created together in one order share the exact same
    // `createdAt` (one INSERT statement) — `id` breaks the tie so this
    // stays deterministic across calls instead of picking a random row.
    .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id))
    .limit(1);

  return row?.outletId ?? null;
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
  const [rows, totalDamageCharge] = await Promise.all([
    getPaymentsForBooking(booking.id),
    sumOrderDamageCharge(db, booking.id),
  ]);
  return {
    payments: rows,
    summary: computePaymentSummary(booking, totalDamageCharge, rows),
  };
}

const REFUND_TYPES: Payment["paymentType"][] = ["refund", "deposit_release"];

/** True for the two submitted types that move money back *out* to the
 * customer — the ones gated on `PAYMENT_REFUND` rather than
 * `PAYMENT_RECORD`. Takes the *submitted* type (which includes the
 * composite `full_payment`), not a stored `payment_type`. */
function isRefundType(type: RecordPaymentInput["paymentType"]): boolean {
  return REFUND_TYPES.includes(type as Payment["paymentType"]);
}

/**
 * How one submitted payment lands in the ledger. Everything except
 * `full_payment` is a single row of the same type; `full_payment` becomes
 * up to two rows (see `RECORDABLE_PAYMENT_TYPES`'s doc comment).
 */
type LedgerMovement = { amount: string; paymentType: Payment["paymentType"] };

/**
 * Appends one or more money movements to an order's ledger. Recording a
 * qualifying (non-refund) payment against a still-`draft` order also
 * confirms it (`draft -> confirmed`) — matches the client requirements
 * doc's own "Booking Created → Payment Recorded → Booking Confirmed"
 * flow.
 *
 * Returns every row written: a `full_payment` settles rent *and* deposit
 * in one action and so produces two of them.
 */
export async function recordPayment(
  actor: TenantSessionUser,
  bookingId: string,
  input: RecordPaymentInput,
): Promise<{ payments: PaymentRow[]; summary: PaymentSummary }> {
  const requiredPermission = isRefundType(input.paymentType)
    ? Permission.PAYMENT_REFUND
    : Permission.PAYMENT_RECORD;

  if (!hasPermission(actor.role, requiredPermission)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const booking = await loadBookingForTenant(actor.shopId, bookingId);

  if (booking.status === "cancelled") {
    throw new AppError("Cannot record a payment against a cancelled booking", 409);
  }

  const totalDamageCharge = await sumOrderDamageCharge(db, booking.id);
  const orderOutletId = await resolveOrderOutletId(booking.id);

  const { payments: inserted, summary } = await db.transaction(async (tx) => {
    // Read the ledger *before* inserting the new row, so an outflow
    // (refund/deposit release) can be checked against what's actually been
    // collected so far — otherwise a booking can end up "refunded" money
    // that was never paid in, which is exactly the confusing state this
    // guards against.
    const existingRows = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, booking.id));

    const movements: LedgerMovement[] = [];

    if (isRefundType(input.paymentType)) {
      // Rent and deposit money are kept in separate pools for INflows
      // (see the `isDepositPayment` branch below) — outflows have to
      // honour that same separation, or a "deposit refund" can silently
      // hand back money that was actually collected as rent (and vice
      // versa for a plain rent "refund"), which is exactly the kind of
      // cross-bucket leak the separate pools exist to prevent.
      const isDepositRefund = input.paymentType === "deposit_release";
      const collected = isDepositRefund
        ? sumByType(existingRows, "security_deposit")
        : addMoney(
            sumByType(existingRows, "advance"),
            sumByType(existingRows, "balance"),
          );
      const alreadyReturned = isDepositRefund
        ? sumByType(existingRows, "deposit_release")
        : sumByType(existingRows, "refund");
      const refundable = subtractMoneyNonNegative(collected, alreadyReturned);

      if (compareMoney(input.amount, refundable) > 0) {
        const bucket = isDepositRefund ? "deposit" : "rent";
        throw new AppError(
          `Cannot refund more than the ${formatMoney(refundable)} ${bucket} already collected for this booking`,
          400,
          [
            {
              field: "amount",
              message: `Cannot exceed ${formatMoney(refundable)} still refundable`,
            },
          ],
        );
      }

      movements.push({
        amount: input.amount,
        paymentType: input.paymentType as Payment["paymentType"],
      });
    } else if (input.paymentType === "full_payment") {
      // "They paid everything" — settle the rent balance first, then put
      // whatever is left toward the deposit, so the two buckets the rest
      // of this service keeps separate stay separate in the ledger too.
      const existingSummary = computePaymentSummary(
        booking,
        totalDamageCharge,
        existingRows,
      );
      const rentDue = nonNegativeMoney(existingSummary.rentBalance);
      const depositDue = nonNegativeMoney(existingSummary.depositBalance);
      const outstanding = addMoney(rentDue, depositDue);

      if (compareMoney(outstanding, ZERO_MONEY) <= 0) {
        throw new AppError("This booking is already fully paid", 400, [
          { field: "amount", message: "Nothing is outstanding on this booking" },
        ]);
      }

      if (compareMoney(input.amount, outstanding) > 0) {
        throw new AppError(
          `Cannot exceed the ${formatMoney(outstanding)} outstanding on this booking`,
          400,
          [
            {
              field: "amount",
              message: `Cannot exceed ${formatMoney(outstanding)} outstanding`,
            },
          ],
        );
      }

      const rentPortion =
        compareMoney(input.amount, rentDue) >= 0 ? rentDue : input.amount;
      const depositPortion = subtractMoneyNonNegative(input.amount, rentPortion);

      if (compareMoney(rentPortion, ZERO_MONEY) > 0) {
        movements.push({ amount: rentPortion, paymentType: "balance" });
      }
      if (compareMoney(depositPortion, ZERO_MONEY) > 0) {
        movements.push({
          amount: depositPortion,
          paymentType: "security_deposit",
        });
      }
    } else {
      // Inflows (advance/balance/security_deposit) must not exceed what's
      // actually still owed for that bucket — otherwise the ledger ends up
      // "overpaid" with no way to reconcile it. Rent and deposit are kept
      // separate on purpose (a rent overpayment can't silently cover the
      // deposit or vice versa).
      const existingSummary = computePaymentSummary(
        booking,
        totalDamageCharge,
        existingRows,
      );
      const isDepositPayment = input.paymentType === "security_deposit";
      const remaining = nonNegativeMoney(
        isDepositPayment
          ? existingSummary.depositBalance
          : existingSummary.rentBalance,
      );

      if (compareMoney(input.amount, remaining) > 0) {
        const bucket = isDepositPayment ? "deposit" : "rent";
        throw new AppError(
          compareMoney(remaining, ZERO_MONEY) <= 0
            ? `The ${bucket} for this booking is already fully paid`
            : `Cannot exceed the ${formatMoney(remaining)} ${bucket} balance remaining`,
          400,
          [
            {
              field: "amount",
              message:
                compareMoney(remaining, ZERO_MONEY) <= 0
                  ? `${bucket === "deposit" ? "Deposit" : "Rent"} is already fully paid`
                  : `Cannot exceed ${formatMoney(remaining)} remaining`,
            },
          ],
        );
      }

      movements.push({
        amount: input.amount,
        paymentType: input.paymentType as Payment["paymentType"],
      });
    }

    const insertedRows: PaymentRow[] = [];
    for (const movement of movements) {
      const [payment] = await tx
        .insert(payments)
        .values({
          shopId: actor.shopId,
          outletId: orderOutletId,
          bookingId: booking.id,
          amount: movement.amount,
          paymentType: movement.paymentType,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber || null,
          note: input.note || null,
          recordedById: actor.id,
        })
        .returning();
      insertedRows.push(payment);
    }

    const rows = [...existingRows, ...insertedRows];

    const paymentSummary = computePaymentSummary(booking, totalDamageCharge, rows);

    const nextStatus =
      booking.status === "draft" && !isRefundType(input.paymentType)
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

    // Bring any still-`draft` items along the same time the order itself
    // leaves `draft` — a `draft` item can be picked up directly too, but
    // once a qualifying payment lands the item and its order shouldn't
    // keep disagreeing about being past `draft`.
    if (nextStatus !== booking.status) {
      await tx
        .update(bookingItems)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(
          and(
            eq(bookingItems.bookingId, booking.id),
            eq(bookingItems.status, "draft"),
          ),
        );
    }

    // One audit entry per row actually written, so a `full_payment`'s two
    // halves are each traceable to the payment they created.
    for (const payment of insertedRows) {
      await recordAudit(tx, {
        shopId: actor.shopId,
        outletId: orderOutletId,
        userId: actor.id,
        action: isRefundType(input.paymentType)
          ? AuditAction.PAYMENT_REFUNDED
          : AuditAction.PAYMENT_RECORDED,
        entityType: "payment",
        entityId: payment.id,
        summary: `${formatMoney(payment.amount)} ${payment.paymentType.replace("_", " ")} on ${booking.bookingNumber}${
          input.paymentType === "full_payment" ? " (full payment)" : ""
        }`,
        after: {
          amount: payment.amount,
          paymentType: payment.paymentType,
          paymentMethod: payment.paymentMethod,
        },
      });
    }

    // The customer sees one payment, not the split — notify once, for the
    // amount they actually handed over.
    if (!isRefundType(input.paymentType)) {
      await queueBookingNotification(tx, booking, "payment_received", {
        extraContext: { payment_amount: formatMoney(input.amount) },
      });
    }

    if (booking.status === "draft" && !isRefundType(input.paymentType)) {
      await queueBookingNotification(tx, booking, "booking_confirmed");
    }

    return { payments: insertedRows, summary: paymentSummary };
  });

  return { payments: inserted, summary };
}

export type BookingReceipt = {
  booking: {
    id: string;
    bookingNumber: string;
    status: Booking["status"];
    createdAt: Date;
  };
  shop: { id: string; name: string; address: string | null; phone: string | null };
  customer: { id: string; name: string; phone: string };
  items: {
    id: string;
    productName: string;
    sku: string;
    color: string | null;
    size: string | null;
    fromDate: string;
    toDate: string;
    totalDays: number;
    quantity: number;
    rentAmount: string;
    grossRent: string;
    status: string;
    damageCharge: string;
  }[];
  charges: {
    grossRentTotal: string;
    discountAmount: string;
    additionalCost: string;
    additionalCostReason: string | null;
    totalAmount: string;
    damageChargeTotal: string;
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

/** One combined receipt for the whole order — every item, one payment
 * ledger, one total. */
export async function getReceipt(
  shopId: string,
  bookingId: string,
  _actor: Pick<TenantSessionUser, "id" | "role">,
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
    })
    .from(bookings)
    .innerJoin(shops, eq(bookings.shopId, shops.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(and(eq(bookings.id, bookingId), eq(bookings.shopId, shopId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const [itemRows, paymentRows] = await Promise.all([
    db
      .select({
        id: bookingItems.id,
        productName: products.name,
        variationSku: productVariations.sku,
        variationColor: productVariations.color,
        variationSize: productVariations.size,
        fromDate: bookingItems.fromDate,
        toDate: bookingItems.toDate,
        totalDays: bookingItems.totalDays,
        quantity: bookingItems.quantity,
        rentAmount: bookingItems.rentAmount,
        grossRent: bookingItems.grossRent,
        status: bookingItems.status,
        damageCharge: bookingItems.damageCharge,
      })
      .from(bookingItems)
      .innerJoin(products, eq(bookingItems.productId, products.id))
      .innerJoin(
        productVariations,
        eq(bookingItems.variationId, productVariations.id),
      )
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id)),
    db
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
      .orderBy(desc(payments.createdAt)),
  ]);

  // Only active (non-cancelled) items feed the order's rent total (see
  // recomputeOrderTotal in bookings/service.ts) — mirror that here so the
  // receipt's "Rent (all items)" line reconciles with "Rent payable"
  // (grossRentTotal - discount + additionalCost === totalAmount).
  const grossRentTotal = itemRows
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => addMoney(sum, item.grossRent), ZERO_MONEY);
  const damageChargeTotal = itemRows.reduce(
    (sum, item) => addMoney(sum, item.damageCharge),
    ZERO_MONEY,
  );

  const summary = computePaymentSummary(row.booking, damageChargeTotal, paymentRows);

  return {
    booking: {
      id: row.booking.id,
      bookingNumber: row.booking.bookingNumber,
      status: row.booking.status,
      createdAt: row.booking.createdAt,
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
    items: itemRows.map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.variationSku,
      color: item.variationColor,
      size: item.variationSize,
      fromDate: item.fromDate,
      toDate: item.toDate,
      totalDays: item.totalDays,
      quantity: item.quantity,
      rentAmount: item.rentAmount,
      grossRent: item.grossRent,
      status: item.status,
      damageCharge: item.damageCharge,
    })),
    charges: {
      grossRentTotal,
      discountAmount: row.booking.discountAmount,
      additionalCost: row.booking.additionalCost,
      additionalCostReason: row.booking.additionalCostReason,
      totalAmount: row.booking.totalAmount,
      damageChargeTotal,
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
