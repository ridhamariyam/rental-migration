import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  bookingItems,
  bookings,
  payments,
  type Booking,
  type BookingItem,
} from "@/lib/db/schema";
import { assertTransition, isTerminal } from "@/lib/booking-state";
import { formatMoney } from "@/lib/format";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import {
  addMoney,
  compareMoney,
  subtractMoneyNonNegative,
  ZERO_MONEY,
} from "@/lib/money";
import {
  computePaymentSummary,
  insertPaymentRow,
  sumOrderDamageCharge,
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
  BulkConfirmPickupInput,
  ConfirmPickupInput,
  ReturnBookingInput,
} from "@/lib/validation/booking-lifecycle";

const REFERENCE_REQUIRED_METHODS = new Set(["upi", "card", "bank_transfer"]);

async function loadOrderForTenant(shopId: string, bookingId: string): Promise<Booking> {
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

async function loadItemForTenant(
  shopId: string,
  bookingId: string,
  itemId: string,
): Promise<BookingItem> {
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

/**
 * Hands one item over the counter (doc §12: scan → verify booking →
 * verify payment → confirm pickup). Optionally collects the balance/
 * security deposit right there — the same ledger `recordPayment()`
 * writes to (against the *order*, not this one item — the ledger is one
 * per order), just inside this action's own transaction so the payment
 * and the status move either both happen or neither does.
 */
export async function confirmPickup(
  actor: TenantSessionUser,
  bookingId: string,
  itemId: string,
  input: ConfirmPickupInput,
): Promise<{ item: BookingItem; summary: PaymentSummary }> {
  if (!hasPermission(actor.role, Permission.BOOKING_PICKUP)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const order = await loadOrderForTenant(actor.shopId, bookingId);
  const item = await loadItemForTenant(actor.shopId, bookingId, itemId);

  // `canTransition` treats "already at the target status" as a no-op
  // allow (so a plain status pass-through elsewhere doesn't error) — a
  // dedicated action like this one must reject it outright, or a second
  // concurrent pickup would silently redo the payment collection.
  if (item.status === "rented") {
    throw new AppError("This item has already been picked up", 409);
  }
  assertTransition(item.status, "rented");

  const variation = await getVariationForBooking(actor.shopId, item.variationId);
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
  // `booking_items.quantity`'s doc comment) — its own `status` is
  // informational once some units are still free, so pickup is only
  // actually blocked when maintenance/cleaning/other active rentals leave
  // too few of them for *this* item's own quantity, never by the status
  // label alone.
  const capacity = Math.max(1, variation.quantity || 1);
  const { maintenanceQty, cleaningQty } = await getMaintenanceBlockedQuantity(
    variation.id,
  );
  const rentedQty = await getRentedOutQuantity(variation.id);
  const freeNow = capacity - maintenanceQty - cleaningQty - rentedQty;

  if (freeNow < item.quantity) {
    const reasons: string[] = [];
    if (maintenanceQty > 0) reasons.push(`${maintenanceQty} in maintenance`);
    if (cleaningQty > 0) reasons.push(`${cleaningQty} in cleaning`);
    if (rentedQty > 0) reasons.push(`${rentedQty} already picked up`);
    throw new AppError(
      `Only ${Math.max(freeNow, 0)} of ${capacity} unit(s) are free right now${
        reasons.length ? ` (${reasons.join(", ")})` : ""
      } — this item needs ${item.quantity}`,
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

  const { item: updatedItem, summary } = await db.transaction(async (tx) => {
    let rows = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, order.id));

    if (input.amountCollected && compareMoney(input.amountCollected, ZERO_MONEY) > 0) {
      const row = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: item.outletId,
        bookingId: order.id,
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
        outletId: item.outletId,
        bookingId: order.id,
        amount: input.depositCollected,
        paymentType: "security_deposit",
        paymentMethod: input.paymentMethod,
        referenceNumber: input.paymentReference,
        recordedById: actor.id,
      });
      rows = [...rows, row];
    }

    const totalDamageCharge = await sumOrderDamageCharge(tx, order.id);
    const paymentSummary = computePaymentSummary(order, totalDamageCharge, rows);

    if (
      compareMoney(paymentSummary.outstanding, ZERO_MONEY) > 0 &&
      !input.allowPendingBalance
    ) {
      throw new AppError(
        `Outstanding balance of ${formatMoney(paymentSummary.outstanding)} must be collected before pickup, or explicitly deferred`,
        402,
      );
    }

    const [updatedBookingItem] = await tx
      .update(bookingItems)
      .set({
        status: assertTransition(item.status, "rented"),
        pickedUpAt: new Date(),
        pickedUpById: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(bookingItems.id, item.id))
      .returning();

    await tx
      .update(bookings)
      .set({ paymentStatus: paymentSummary.status, updatedAt: new Date() })
      .where(eq(bookings.id, order.id));

    // Recomputed rather than set directly — with this pickup now counted
    // as "rented", the variation only shows `rented` once every unit is
    // actually spoken for (see `applyVariationLifecycleStatus`), so other
    // free units of the same variation stay pickable for their own
    // bookings.
    await applyVariationLifecycleStatus(tx, variation.id);

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: updatedBookingItem.outletId,
      userId: actor.id,
      action: AuditAction.BOOKING_PICKED_UP,
      entityType: "booking",
      entityId: updatedBookingItem.id,
      summary: `${order.bookingNumber} picked up`,
      before: { status: item.status },
      after: { status: updatedBookingItem.status, paymentStatus: paymentSummary.status },
    });

    await queueBookingNotification(tx, order, "pickup_confirmed", { itemId: item.id });

    return { item: updatedBookingItem, summary: paymentSummary };
  });

  return { item: updatedItem, summary };
}

/**
 * Hands over every remaining item of a multi-item order in one counter
 * visit — same checks as `confirmPickup` per item (barcode, capacity,
 * outstanding balance), just batched so scanning item 2 of 3 doesn't
 * require re-opening the whole flow and re-deciding how to split a
 * payment that was always one shared ledger anyway. All-or-nothing: if
 * any item's barcode or capacity check fails, nothing in the batch is
 * picked up.
 */
export async function confirmPickupOrder(
  actor: TenantSessionUser,
  bookingId: string,
  input: BulkConfirmPickupInput,
): Promise<{ items: BookingItem[]; summary: PaymentSummary }> {
  if (!hasPermission(actor.role, Permission.BOOKING_PICKUP)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const order = await loadOrderForTenant(actor.shopId, bookingId);

  const loadedItems = await Promise.all(
    input.items.map((line) => loadItemForTenant(actor.shopId, bookingId, line.itemId)),
  );

  for (const item of loadedItems) {
    if (item.status === "rented") {
      throw new AppError("An item in this order has already been picked up", 409);
    }
    assertTransition(item.status, "rented");
  }

  // Verify every scanned barcode and every item's own capacity up front —
  // before anything is written, so a bad scan on item 2 can't leave item 1
  // already handed over.
  const variationByItemId = new Map<
    string,
    Awaited<ReturnType<typeof getVariationForBooking>>
  >();
  for (let i = 0; i < loadedItems.length; i++) {
    const item = loadedItems[i];
    const barcode = input.items[i].barcode;
    const variation = await getVariationForBooking(actor.shopId, item.variationId);
    if (!variation) {
      throw AppError.notFound("Item not found");
    }
    if (barcode !== variation.barcode) {
      throw new AppError(
        `Scanned barcode doesn't match ${variation.productName} in this order`,
        400,
        [{ field: `items.${i}.barcode`, message: "Doesn't match this item" }],
      );
    }
    if (variation.status === "retired" || variation.status === "in_transfer") {
      throw new AppError(
        `${variation.productName} is '${variation.status.replace("_", " ")}' and cannot leave the counter`,
        409,
      );
    }
    if (!variation.isAvailable) {
      throw new AppError(
        `${variation.productName} is withdrawn from rental and cannot leave the counter`,
        409,
      );
    }
    variationByItemId.set(item.id, variation);
  }

  // One capacity check per distinct variation, covering every line in the
  // batch that shares it — same reasoning as `createBooking`'s own
  // capacity check.
  const requestedQtyByVariation = new Map<string, number>();
  for (const item of loadedItems) {
    requestedQtyByVariation.set(
      item.variationId,
      (requestedQtyByVariation.get(item.variationId) ?? 0) + item.quantity,
    );
  }
  for (const [variationId, requestedQty] of requestedQtyByVariation) {
    const variation = [...variationByItemId.values()].find(
      (candidate) => candidate?.id === variationId,
    );
    if (!variation) continue;
    const capacity = Math.max(1, variation.quantity || 1);
    const { maintenanceQty, cleaningQty } = await getMaintenanceBlockedQuantity(
      variationId,
    );
    const rentedQty = await getRentedOutQuantity(variationId);
    const freeNow = capacity - maintenanceQty - cleaningQty - rentedQty;

    if (freeNow < requestedQty) {
      const reasons: string[] = [];
      if (maintenanceQty > 0) reasons.push(`${maintenanceQty} in maintenance`);
      if (cleaningQty > 0) reasons.push(`${cleaningQty} in cleaning`);
      if (rentedQty > 0) reasons.push(`${rentedQty} already picked up`);
      throw new AppError(
        `Only ${Math.max(freeNow, 0)} of ${capacity} unit(s) of ${variation.productName} are free right now${
          reasons.length ? ` (${reasons.join(", ")})` : ""
        } — this order needs ${requestedQty}`,
        409,
      );
    }
  }

  const collectingMoney =
    compareMoney(input.amountCollected ?? ZERO_MONEY, ZERO_MONEY) > 0 ||
    compareMoney(input.depositCollected ?? ZERO_MONEY, ZERO_MONEY) > 0;

  if (collectingMoney && !hasPermission(actor.role, Permission.PAYMENT_RECORD)) {
    throw AppError.forbidden("You do not have permission to record a payment");
  }

  const { items: updatedItems, summary } = await db.transaction(async (tx) => {
    let rows = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, order.id));

    const firstOutletId = loadedItems[0]?.outletId ?? null;

    if (input.amountCollected && compareMoney(input.amountCollected, ZERO_MONEY) > 0) {
      const row = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: firstOutletId,
        bookingId: order.id,
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
        outletId: firstOutletId,
        bookingId: order.id,
        amount: input.depositCollected,
        paymentType: "security_deposit",
        paymentMethod: input.paymentMethod,
        referenceNumber: input.paymentReference,
        recordedById: actor.id,
      });
      rows = [...rows, row];
    }

    const totalDamageCharge = await sumOrderDamageCharge(tx, order.id);
    const paymentSummary = computePaymentSummary(order, totalDamageCharge, rows);

    if (
      compareMoney(paymentSummary.outstanding, ZERO_MONEY) > 0 &&
      !input.allowPendingBalance
    ) {
      throw new AppError(
        `Outstanding balance of ${formatMoney(paymentSummary.outstanding)} must be collected before pickup, or explicitly deferred`,
        402,
      );
    }

    const updated: BookingItem[] = [];
    for (const item of loadedItems) {
      const [updatedBookingItem] = await tx
        .update(bookingItems)
        .set({
          status: assertTransition(item.status, "rented"),
          pickedUpAt: new Date(),
          pickedUpById: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(bookingItems.id, item.id))
        .returning();
      updated.push(updatedBookingItem);

      await recordAudit(tx, {
        shopId: actor.shopId,
        outletId: updatedBookingItem.outletId,
        userId: actor.id,
        action: AuditAction.BOOKING_PICKED_UP,
        entityType: "booking",
        entityId: updatedBookingItem.id,
        summary: `${order.bookingNumber} picked up`,
        before: { status: item.status },
        after: { status: updatedBookingItem.status, paymentStatus: paymentSummary.status },
      });

      await queueBookingNotification(tx, order, "pickup_confirmed", { itemId: item.id });
    }

    await tx
      .update(bookings)
      .set({ paymentStatus: paymentSummary.status, updatedAt: new Date() })
      .where(eq(bookings.id, order.id));

    for (const variationId of requestedQtyByVariation.keys()) {
      await applyVariationLifecycleStatus(tx, variationId);
    }

    return { items: updated, summary: paymentSummary };
  });

  return { items: updatedItems, summary };
}

/**
 * Takes one item back (doc §14–15): records the condition, settles any
 * damage against the order's shared security deposit, and parks the
 * physical item's lifecycle so it can't be rebooked while cleaning/
 * maintenance is open. The deposit is pooled across the whole order now
 * (not per item), so a remaining balance is only auto-refunded once
 * every *other* item in the order has also reached a terminal state —
 * handing back part of a shared deposit while another item is still out
 * would be wrong. Until then the deposit just sits reduced by whatever
 * this item's damage took from it; staff can settle the rest manually
 * via Record Payment once the whole order is done.
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
  itemId: string,
  input: ReturnBookingInput,
): Promise<{ item: BookingItem; summary: PaymentSummary }> {
  if (!hasPermission(actor.role, Permission.BOOKING_RETURN)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const order = await loadOrderForTenant(actor.shopId, bookingId);
  const item = await loadItemForTenant(actor.shopId, bookingId, itemId);

  if (item.status === "returned") {
    throw new AppError("This item has already been returned", 409);
  }
  assertTransition(item.status, "returned");

  const variation = await getVariationForBooking(actor.shopId, item.variationId);
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

  const { item: updatedItem, summary } = await db.transaction(async (tx) => {
    const existingRows = await tx
      .select()
      .from(payments)
      .where(eq(payments.bookingId, order.id));

    // Deposit held *before* this settlement — this item's own
    // `damageCharge` is still the pre-return value ("0.00") at this point,
    // which is correct: the charge being settled right now hasn't been
    // applied yet.
    const priorTotalDamage = await sumOrderDamageCharge(tx, order.id);
    const priorSummary = computePaymentSummary(order, priorTotalDamage, existingRows);
    const depositHeld = priorSummary.depositHeld;

    const damageFromDeposit =
      compareMoney(damageCharge, depositHeld) < 0 ? damageCharge : depositHeld;
    const remainingAfterDamage = subtractMoneyNonNegative(depositHeld, damageFromDeposit);

    let rows = existingRows;
    let depositRefunded = ZERO_MONEY;

    if (compareMoney(damageFromDeposit, ZERO_MONEY) > 0) {
      // One row, typed `deposit_applied` rather than `deposit_release`:
      // this deposit is being kept against the damage, not handed back,
      // and the summary credits it toward what the customer owes. The
      // old pairing of a `deposit_release` with an inert `damage_charge`
      // row recorded the outflow without ever crediting it (RQ-01).
      const applied = await insertPaymentRow(tx, {
        shopId: actor.shopId,
        outletId: item.outletId,
        bookingId: order.id,
        amount: damageFromDeposit,
        paymentType: "deposit_applied",
        paymentMethod: "other",
        note: "Security deposit applied to damage charge",
        recordedById: actor.id,
      });
      rows = [...rows, applied];
    }

    // Only refund what's left once every *other* item in the order is
    // also done — a shared deposit shouldn't get handed back while
    // another item is still out with the customer.
    const siblingItems = await tx
      .select({ id: bookingItems.id, status: bookingItems.status })
      .from(bookingItems)
      .where(and(eq(bookingItems.bookingId, order.id), ne(bookingItems.id, itemId)));
    const isLastItemToSettle = siblingItems.every((sibling) => isTerminal(sibling.status));

    if (isLastItemToSettle && compareMoney(remainingAfterDamage, ZERO_MONEY) > 0) {
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
        outletId: item.outletId,
        bookingId: order.id,
        amount: remainingAfterDamage,
        paymentType: "deposit_release",
        paymentMethod: input.refundMethod,
        referenceNumber: input.refundReference,
        note: "Security deposit returned at item return",
        recordedById: actor.id,
      });
      rows = [...rows, refund];
      depositRefunded = remainingAfterDamage;
    }

    const newTotalDamage = addMoney(priorTotalDamage, damageCharge);
    const paymentSummary = computePaymentSummary(order, newTotalDamage, rows);

    const [updatedBookingItem] = await tx
      .update(bookingItems)
      .set({
        status: assertTransition(item.status, "returned"),
        returnedAt: new Date(),
        returnCondition: input.returnCondition,
        damageNotes: input.damageNotes || null,
        damageCharge,
        depositRefunded,
        cleaningRequired: input.cleaningRequired,
        maintenanceRequired,
        collectedById: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(bookingItems.id, item.id))
      .returning();

    await tx
      .update(bookings)
      .set({ paymentStatus: paymentSummary.status, updatedAt: new Date() })
      .where(eq(bookings.id, order.id));

    // Raises the actual `maintenance_tasks` rows (Phase 14) and parks the
    // variation's own `status` at `needs_cleaning`/`maintenance`/
    // `available` from them — a returned item stays un-rebookable until
    // every task this opens is closed out, never just from this column
    // pair alone.
    await openMaintenanceTasksForReturn(tx, {
      shopId: actor.shopId,
      outletId: item.outletId,
      variationId: variation.id,
      bookingId: item.id,
      cleaningRequired: input.cleaningRequired,
      maintenanceRequired,
      damageNotes: input.damageNotes || null,
    });

    // Revenue share (doc §19–21) — a no-op for a shop-owned item;
    // `recordSettlementForBooking` itself checks `ownershipType` and is
    // idempotent on this item's id, so replaying this transaction never
    // double-pays an owner. Basis is this item's own gross rent — the
    // order's `additionalCost` is a shop-billed surcharge (alteration,
    // delivery), never something an item owner gets a cut of, and it was
    // never part of any one item's own rent to begin with.
    await recordSettlementForBooking(tx, {
      shopId: actor.shopId,
      outletId: item.outletId,
      bookingId: item.id,
      variation,
      grossRentalAmount: item.grossRent,
    });

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: updatedBookingItem.outletId,
      userId: actor.id,
      action: AuditAction.BOOKING_RETURNED,
      entityType: "booking",
      entityId: updatedBookingItem.id,
      summary: `${order.bookingNumber} returned (${input.returnCondition})`,
      before: { status: item.status },
      after: {
        status: updatedBookingItem.status,
        returnCondition: updatedBookingItem.returnCondition,
        damageCharge: updatedBookingItem.damageCharge,
        depositRefunded: updatedBookingItem.depositRefunded,
      },
    });

    await queueBookingNotification(tx, order, "booking_returned", {
      itemId: item.id,
      extraContext: {
        damage_charge: formatMoney(updatedBookingItem.damageCharge),
        deposit_refunded: formatMoney(updatedBookingItem.depositRefunded),
      },
    });

    // Once every item in the order has come back, schedule the one
    // booking-level "how was your experience" WhatsApp for ~2 days later
    // — not per item, so a multi-item order only ever gets one.
    if (isLastItemToSettle) {
      const feedbackDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      await queueBookingNotification(tx, order, "feedback_request", {
        scheduledFor: feedbackDate,
      });
    }

    return { item: updatedBookingItem, summary: paymentSummary };
  });

  return { item: updatedItem, summary };
}
