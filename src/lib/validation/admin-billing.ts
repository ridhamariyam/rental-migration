import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const OFFLINE_PAYMENT_METHODS = ["UPI", "Bank transfer", "Cash", "Cheque", "Other"] as const;

/** Super admin: a payment received outside Razorpay. Amounts in rupees. */
export const recordOfflinePaymentSchema = z.object({
  plan: z.enum(["yearly", "monthly", "custom"]),
  amount: z.coerce
    .number({ message: "Enter an amount" })
    .positive("Enter an amount above 0")
    .max(10_000_000, "That amount is too large"),
  setupFee: z.coerce.number().min(0).max(10_000_000).optional(),
  method: z.enum(OFFLINE_PAYMENT_METHODS),
  reference: z.string().trim().max(100, "Must be at most 100 characters").optional(),
  note: z.string().trim().max(300, "Must be at most 300 characters").optional(),
  paidOn: dateString.optional(),
  /** Custom plan: how long this payment covers — one month or one year. */
  cycle: z.enum(["monthly", "yearly"]).optional(),
  /** false = the end date was already set by hand; just log the payment
   * against that period instead of adding another one on top. */
  extend: z.boolean().default(true),
  /** Custom plan, legacy alternative to `cycle`: an explicit end date. */
  endsAt: dateString.optional(),
});

export type RecordOfflinePaymentInput = z.infer<typeof recordOfflinePaymentSchema>;

export const resolvePaymentSchema = z.object({
  note: z.string().trim().min(1, "Say how it was resolved").max(300, "Must be at most 300 characters"),
});

export type ResolvePaymentInput = z.infer<typeof resolvePaymentSchema>;

export const resetOwnerPasswordSchema = z.object({
  userId: z.uuid("Invalid owner"),
});

const rupees = (label: string, min: number) =>
  z.coerce
    .number({ message: `Enter the ${label}` })
    .int("Whole rupees only")
    .min(min, min > 0 ? `The ${label} must be at least ₹${min}` : `The ${label} can't be negative`)
    .max(1_000_000, `The ${label} is too large`);

const planPriceSchema = z.object({
  price: rupees("price", 1),
  setupFee: rupees("setup fee", 0),
});

/** Super admin: new prices for both standard plans, in whole rupees. */
export const updatePlanPricesSchema = z.object({
  yearly: planPriceSchema,
  monthly: planPriceSchema,
});

export type UpdatePlanPricesInput = z.infer<typeof updatePlanPricesSchema>;
