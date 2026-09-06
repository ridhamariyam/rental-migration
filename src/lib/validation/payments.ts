import { z } from "zod";
import { moneySchema, uuidSchema } from "@/lib/validation/common";
import { compareMoney, ZERO_MONEY } from "@/lib/money";

export const bookingPaymentParamSchema = z.object({ id: uuidSchema });

/** A payment amount must be strictly greater than zero — `moneySchema`
 * alone allows `"0.00"`, which is a valid *money* string but never a valid
 * payment. */
export const positiveMoneySchema = moneySchema.refine(
  (value) => compareMoney(value, ZERO_MONEY) > 0,
  { message: "Amount must be greater than zero" },
);

/**
 * What the "Record payment" dialog may submit. Three of these map
 * one-to-one onto a `payment_type` enum value; two do not:
 *
 * - `full_payment` is a *composite* — the counter's "they paid everything"
 *   button. The server splits the amount across what is actually owed
 *   (rent first, then the deposit) and writes the matching `balance` /
 *   `security_deposit` ledger rows. It is deliberately **not** a new enum
 *   value: income reports sum `advance`/`balance`/`damage_charge` in SQL
 *   (see `INFLOW_PAYMENT_TYPES`), and a single mixed rent-plus-deposit row
 *   could only be counted as all income or none — both wrong.
 * - `damage_charge` stays out entirely: it is raised by the return
 *   workflow itself (`bookings/lifecycle.ts`), never typed in by hand.
 */
export const RECORDABLE_PAYMENT_TYPES = [
  "advance",
  "balance",
  "full_payment",
  "security_deposit",
  "refund",
  "deposit_release",
] as const;

export const PAYMENT_METHOD_VALUES = [
  "cash",
  "upi",
  "card",
  "bank_transfer",
  "other",
] as const;

/** Methods where money changes hands somewhere traceable other than a
 * cash drawer — the counter needs *something* to reconcile against later. */
const REFERENCE_REQUIRED_METHODS = new Set(["upi", "card", "bank_transfer"]);

export const recordPaymentSchema = z
  .object({
    amount: positiveMoneySchema,
    paymentType: z.enum(RECORDABLE_PAYMENT_TYPES),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
    referenceNumber: z
      .string()
      .trim()
      .max(100, "Reference number is too long")
      .optional(),
    note: z.string().trim().max(500, "Note must be at most 500 characters").optional(),
  })
  .superRefine((data, ctx) => {
    if (
      REFERENCE_REQUIRED_METHODS.has(data.paymentMethod) &&
      !data.referenceNumber
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["referenceNumber"],
        message: `A reference number is required for ${data.paymentMethod.replace("_", " ")} payments`,
      });
    }
  });

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
