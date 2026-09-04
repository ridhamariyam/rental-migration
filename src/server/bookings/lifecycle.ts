import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { bookings, payments, type Booking } from "@/lib/db/schema";
import { assertTransition } from "@/lib/booking-state";
import { formatMoney } from "@/lib/format";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import {
  compareMoney,
  subtractMoneyNonNegative,
  ZERO_MONEY,
} from "@/lib/money";
import {
  computePaymentSummary,
  insertPaymentRow,
  type PaymentSummary,
} from "@/server/payments/service";
import { getVariationForBooking } from "@/server/variations/service";
import {
  applyVariationLifecycleStatus,
  openMaintenanceTasksForReturn,
} from "@/server/maintenance/service";
import {
  getMaintenanceBlockedQuantity,
  getRentedOutQuantity,
} from "@/server/variations/capacity";
import { recordSettlementForBooking } from "@/server/settlements/service";
import { AuditAction, recordAudit } from "@/server/audit/service";
import { queueBookingNotification } from "@/server/notifications/service";
import type {
  ConfirmPickupInput,
  ReturnBookingInput,
} from "@/lib/validation/booking-lifecycle";

const REFERENCE_REQUIRED_METHODS = new Set(["upi", "card", "bank_transfer"]);

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

/**
 * Hands the item over the counter (doc §12: scan → verify booking → verify
 * payment → confirm pickup). Optionally collects the balance/security
 * deposit right there — the same ledger `recordPayment()` writes to, just
 * inside this action's own transaction so the payment and the status move
 * either both happen or neither does.
 */
export async function confirmPickup(
  actor: TenantSessionUser,
  bookingId: string,
  input: ConfirmPickupInput,
): Promise<{ booking: Booking; summary: PaymentSummary }> {
  if (!hasPermission(actor.role, Permission.BOOKING_PICKUP)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const booking = await loadBookingForTenant(actor.shopId, bookingId);

  // `canTransition` treats "already at the target status" as a no-op
  // allow (so a plain status pass-through elsewhere doesn't error) — a
  // dedicated action like this one must reject it outright, or a second
  // concurrent pickup would silently redo the payment collection.
  if (booking.status === "rented") {
    throw new AppError("This booking has already been picked up", 409);
  }
  assertTransition(booking.status, "rented");

  const variation = await getVariationForBooking(actor.shopId, booking.variationId);
  if (!variation) {
    throw AppError.notFound("Item not found");
  }

  if (input.barcode !== variation.barcode) {
    throw new AppError("Scanned item does not belong to this booking", 400, [
      { field: "barcode", message: "Scanned item does not belong to this booking" },
    ]);
  }

  if (variation.status === "retired" || variation.status === "in_transfer") {
    throw new AppError(
      `Item is '${variation.status.replace("_", " ")}' and cannot leave the counter`,
      409,
    );
  }

  if (!variation.isAvailable) {
    throw new AppError("Item is withdrawn from rental and cannot leave the counter", 409);
  }

  // A variation can represent several identical physical units (see
  // `bookings.quantity`'s doc comment) — its own `status` is informational
  // once some units are still free, so pickup is only actually blocked
  // when maintenance/cleaning/other active rentals leave too few of them
  // for *this* booking's own quantity, never by the status label alone.
  const capacity = Math.max(1, variation.quantity || 1);
  const { maintenanceQty, cleaningQty } = await getMaintenanceBlockedQuantity(
    variation.id,
  );
  const rentedQty = await getRentedOutQuantity(variation.id);
  const freeNow = capacity - maintenanceQty - cleaningQty - rentedQty;

  if (freeNow < booking.quantity) {
    const reasons: string[] = [];
    if (maintenanceQty > 0) reasons.push(`${maintenanceQty} in maintenance`);
    if (cleaningQty > 0) reasons.push(`${cleaningQty} in cleaning`);
    if (rentedQty > 0) reasons.push(`${rentedQty} already picked up`);
    throw new AppError(
      `Only ${Math.max(freeNow, 0)} of ${capacity} unit(s) are free right now${
        reasons.length ? ` (${reasons.join(", ")})` : ""
      } — this booking needs ${booking.quantity}`,
      409,
    );
  }

  const collectingMoney =
    compareMoney(input.amountCollected ?? ZERO_MONEY, ZERO_MONEY) > 0 ||
    compareMoney(input.depositCollected ?? ZERO_MONEY, ZERO_MONEY) > 0;

  if (collectingMoney && !hasPermission(actor.role, Permission.PAYMENT_RECORD)) {
    throw AppError.forbidden(
      "You do not have permission to record a payment",
    );
  }

  const { booking: updated, summary } = await db.transaction(async (tx) => {
    let rows = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, booking.id));

    if (input.amountCollected && compareMoney(input.amountCollected, ZERO_MONEY) > 0) {
      const row = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: booking.outletId,
        bookingId: booking.id,
        amount: input.amountCollected,
        paymentType: "balance",
        paymentMethod: input.paymentMethod,
        referenceNumber: input.paymentReference,
        recordedById: actor.id,
      });
      rows = [...rows, row];
    }

    if (input.depositCollected && compareMoney(input.depositCollected, ZERO_MONEY) > 0) {
      const row = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: booking.outletId,
        bookingId: booking.id,
        amount: input.depositCollected,
        paymentType: "security_deposit",
        paymentMethod: input.paymentMethod,
        referenceNumber: input.paymentReference,
        recordedById: actor.id,
      });
      rows = [...rows, row];
    }

    const paymentSummary = computePaymentSummary(booking, rows);

    if (
      compareMoney(paymentSummary.outstanding, ZERO_MONEY) > 0 &&
      !input.allowPendingBalance
    ) {
      throw new AppError(
        `Outstanding balance of ${formatMoney(paymentSummary.outstanding)} must be collected before pickup, or explicitly deferred`,
        402,
      );
    }

    const [updatedBooking] = await tx
      .update(bookings)
      .set({
        status: assertTransition(booking.status, "rented"),
        pickedUpAt: new Date(),
        pickedUpById: actor.id,
        paymentStatus: paymentSummary.status,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();

    // Recomputed rather than set directly — with this pickup now counted
    // as "rented", the variation only shows `rented` once every unit is
    // actually spoken for (see `applyVariationLifecycleStatus`), so other
    // free units of the same variation stay pickable for their own
    // bookings.
    await applyVariationLifecycleStatus(tx, variation.id);

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: updatedBooking.outletId,
      userId: actor.id,
      action: AuditAction.BOOKING_PICKED_UP,
      entityType: "booking",
      entityId: updatedBooking.id,
      summary: `${updatedBooking.bookingNumber} picked up`,
      before: { status: booking.status },
      after: { status: updatedBooking.status, paymentStatus: updatedBooking.paymentStatus },
    });

    await queueBookingNotification(tx, updatedBooking, "pickup_confirmed");

    return { booking: updatedBooking, summary: paymentSummary };
  });

  return { booking: updated, summary };
}

/**
 * Takes the item back (doc §14–15): records the condition, settles any
 * damage against the security deposit, refunds what's left, and parks the
 * physical item's lifecycle so it can't be rebooked while cleaning/
 * maintenance is open (Phase 14 is what actually releases it back to
 * `available` once that work is done).
 *
 * Damage is recorded as **two** ledger movements when it eats into the
 * deposit — money leaving the deposit pot, and the same amount recognised
 * as damage income — never just one, or the deposit would look like it's
 * still fully held (ported exactly from the legacy `BookingService
 * .return_booking`).
 */
export async function returnBooking(
  actor: TenantSessionUser,
  bookingId: string,
  input: ReturnBookingInput,
): Promise<{ booking: Booking; summary: PaymentSummary }> {
  if (!hasPermission(actor.role, Permission.BOOKING_RETURN)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const booking = await loadBookingForTenant(actor.shopId, bookingId);

  if (booking.status === "returned") {
    throw new AppError("This booking has already been returned", 409);
  }
  assertTransition(booking.status, "returned");

  const variation = await getVariationForBooking(actor.shopId, booking.variationId);
  if (!variation) {
    throw AppError.notFound("Item not found");
  }

  if (input.barcode && input.barcode !== variation.barcode) {
    throw new AppError("Scanned item does not belong to this booking", 400, [
      { field: "barcode", message: "Scanned item does not belong to this booking" },
    ]);
  }

  // `??` isn't enough here: `optionalMoneySchema` lets a blank form field
  // through as `""` (not `undefined`), and `""` written straight to the
  // `damage_charge` numeric column fails with a Postgres 22P02 error — `||`
  // treats that empty string the same as "not provided".
  const damageCharge = input.damageCharge || ZERO_MONEY;
  // Major damage always needs a maintenance pass, regardless of what the
  // form submits — same rule the legacy backend enforced server-side.
  const maintenanceRequired =
    input.maintenanceRequired || input.returnCondition === "major_damage";

  const { booking: updated, summary } = await db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, booking.id));

    // Deposit held *before* this settlement — `booking.damageCharge` is
    // still the pre-return value ("0.00") at this point, which is correct:
    // the charge being settled right now hasn't been applied yet.
    const priorSummary = computePaymentSummary(booking, existingRows);
    const depositHeld = priorSummary.depositHeld;

    const damageFromDeposit =
      compareMoney(damageCharge, depositHeld) < 0 ? damageCharge : depositHeld;
    const refundable = subtractMoneyNonNegative(depositHeld, damageFromDeposit);

    let rows = existingRows;
    let depositRefunded = ZERO_MONEY;

    if (compareMoney(damageFromDeposit, ZERO_MONEY) > 0) {
      const release = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: booking.outletId,
        bookingId: booking.id,
        amount: damageFromDeposit,
        paymentType: "deposit_release",
        paymentMethod: "other",
        note: "Deposit applied to damage charge",
        recordedById: actor.id,
      });
      const charge = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: booking.outletId,
        bookingId: booking.id,
        amount: damageFromDeposit,
        paymentType: "damage_charge",
        paymentMethod: "other",
        note: "Damage recovered from security deposit",
        recordedById: actor.id,
      });
      rows = [...rows, release, charge];
    }

    if (compareMoney(refundable, ZERO_MONEY) > 0) {
      if (
        REFERENCE_REQUIRED_METHODS.has(input.refundMethod) &&
        !input.refundReference
      ) {
        throw new AppError(
          `A reference number is required for ${input.refundMethod.replace("_", " ")} refunds`,
          400,
          [
            {
              field: "refundReference",
              message: `A reference number is required for ${input.refundMethod.replace("_", " ")} refunds`,
            },
          ],
        );
      }

      const refund = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: booking.outletId,
        bookingId: booking.id,
        amount: refundable,
        paymentType: "deposit_release",
        paymentMethod: input.refundMethod,
        referenceNumber: input.refundReference,
        note: "Security deposit returned at item return",
        recordedById: actor.id,
      });
      rows = [...rows, refund];
      depositRefunded = refundable;
    }

    const paymentSummary = computePaymentSummary(
      { ...booking, damageCharge },
      rows,
    );

    const [updatedBooking] = await tx
      .update(bookings)
      .set({
        status: assertTransition(booking.status, "returned"),
        returnedAt: new Date(),
        returnCondition: input.returnCondition,
        damageNotes: input.damageNotes || null,
        damageCharge,
        depositRefunded,
        cleaningRequired: input.cleaningRequired,
        maintenanceRequired,
        collectedById: actor.id,
        paymentStatus: paymentSummary.status,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();

    // Raises the actual `maintenance_tasks` rows (Phase 14) and parks the
    // variation's own `status` at `needs_cleaning`/`maintenance`/
    // `available` from them — a returned item stays un-rebookable until
    // every task this opens is closed out (`completeMaintenanceTask`/
    // `cancelMaintenanceTask`), never just from this column pair alone.
    await openMaintenanceTasksForReturn(tx, {
      shopId: actor.shopId,
      outletId: booking.outletId,
      variationId: variation.id,
      bookingId: booking.id,
      cleaningRequired: input.cleaningRequired,
      maintenanceRequired,
      damageNotes: input.damageNotes || null,
    });

    // Revenue share (doc §19–21) — a no-op for a shop-owned item;
    // `recordSettlementForBooking` itself checks `ownershipType` and is
    // idempotent on `bookingId`, so replaying this transaction never
    // double-pays an owner.
    await recordSettlementForBooking(tx, {
      shopId: actor.shopId,
      outletId: booking.outletId,
      bookingId: booking.id,
      variation,
      grossRentalAmount: booking.totalAmount,
    });

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: updatedBooking.outletId,
      userId: actor.id,
      action: AuditAction.BOOKING_RETURNED,
      entityType: "booking",
      entityId: updatedBooking.id,
      summary: `${updatedBooking.bookingNumber} returned (${input.returnCondition})`,
      before: { status: booking.status },
      after: {
        status: updatedBooking.status,
        returnCondition: updatedBooking.returnCondition,
        damageCharge: updatedBooking.damageCharge,
        depositRefunded: updatedBooking.depositRefunded,
      },
    });

    await queueBookingNotification(tx, updatedBooking, "booking_returned", {
      extraContext: {
        damage_charge: formatMoney(updatedBooking.damageCharge),
        deposit_refunded: formatMoney(updatedBooking.depositRefunded),
      },
    });

    return { booking: updatedBooking, summary: paymentSummary };
  });

  return { booking: updated, summary };
}
