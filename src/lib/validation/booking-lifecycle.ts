import { z } from "zod";
import { optionalMoneySchema } from "@/lib/validation/common";
import { PAYMENT_METHOD_VALUES } from "@/lib/validation/payments";
import { compareMoney, ZERO_MONEY } from "@/lib/money";

const REFERENCE_REQUIRED_METHODS = new Set(["upi", "card", "bank_transfer"]);

/**
 * Confirming pickup (doc §12: scan → verify booking → verify payment →
 * confirm pickup). Collecting the balance/deposit right at the counter is
 * optional — a staff member who already recorded it earlier (Phase 12's
 * "Record payment") just leaves these blank.
 */
export const confirmPickupSchema = z
  .object({
    barcode: z
      .string()
      .trim()
      .min(1, "Scan the item's barcode to confirm pickup")
      .max(50),
    amountCollected: optionalMoneySchema,
    depositCollected: optionalMoneySchema,
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
    paymentReference: z
      .string()
      .trim()
      .max(100, "Reference number is too long")
      .optional(),
    // Explicit "I know the balance isn't fully collected yet" override —
    // without it, an outstanding balance blocks pickup outright (doc's
    // "Verify Payment" step).
    allowPendingBalance: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const collectingSomething =
      (data.amountCollected &&
        compareMoney(data.amountCollected, ZERO_MONEY) > 0) ||
      (data.depositCollected &&
        compareMoney(data.depositCollected, ZERO_MONEY) > 0);

    if (
      collectingSomething &&
      REFERENCE_REQUIRED_METHODS.has(data.paymentMethod) &&
      !data.paymentReference
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentReference"],
        message: `A reference number is required for ${data.paymentMethod.replace("_", " ")} payments`,
      });
    }
  });

export type ConfirmPickupInput = z.infer<typeof confirmPickupSchema>;

/**
 * Whole-order pickup — same idea as `confirmPickupSchema`, but for handing
 * over every remaining item in a multi-item order in one counter visit
 * instead of one dialog per item. Each item still needs its own barcode
 * scanned (that's the actual anti-fraud handover check, not busywork), but
 * the balance/deposit is collected once for the whole order, matching how
 * the ledger already works (one payment ledger per order, not per item).
 */
export const bulkConfirmPickupSchema = z
  .object({
    items: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          barcode: z
            .string()
            .trim()
            .min(1, "Scan this item's barcode to confirm pickup")
            .max(50),
        }),
      )
      .min(1, "Select at least one item to pick up"),
    amountCollected: optionalMoneySchema,
    depositCollected: optionalMoneySchema,
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
    paymentReference: z
      .string()
      .trim()
      .max(100, "Reference number is too long")
      .optional(),
    allowPendingBalance: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const collectingSomething =
      (data.amountCollected &&
        compareMoney(data.amountCollected, ZERO_MONEY) > 0) ||
      (data.depositCollected &&
        compareMoney(data.depositCollected, ZERO_MONEY) > 0);

    if (
      collectingSomething &&
      REFERENCE_REQUIRED_METHODS.has(data.paymentMethod) &&
      !data.paymentReference
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentReference"],
        message: `A reference number is required for ${data.paymentMethod.replace("_", " ")} payments`,
      });
    }
  });

export type BulkConfirmPickupInput = z.infer<typeof bulkConfirmPickupSchema>;

const RETURN_CONDITION_VALUES = ["good", "minor_damage", "major_damage"] as const;

/**
 * Return inspection + damage/deposit settlement (doc §14–15). `damageCharge`
 * only makes sense once damage has actually been flagged; `refundMethod`/
 * `refundReference` describe how any refundable deposit is handed back.
 */
export const returnBookingSchema = z
  .object({
    barcode: z.string().trim().max(50).optional(),
    returnCondition: z.enum(RETURN_CONDITION_VALUES),
    damageCharge: optionalMoneySchema,
    damageNotes: z
      .string()
      .trim()
      .max(1000, "Notes must be at most 1000 characters")
      .optional(),
    cleaningRequired: z.boolean(),
    maintenanceRequired: z.boolean(),
    refundMethod: z.enum(PAYMENT_METHOD_VALUES),
    refundReference: z
      .string()
      .trim()
      .max(100, "Reference number is too long")
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasDamageCharge =
      data.damageCharge && compareMoney(data.damageCharge, ZERO_MONEY) > 0;

    if (hasDamageCharge && data.returnCondition === "good") {
      ctx.addIssue({
        code: "custom",
        path: ["damageCharge"],
        message: "A damage charge requires the item to be marked as damaged",
      });
    }
  });

export type ReturnBookingInput = z.infer<typeof returnBookingSchema>;
