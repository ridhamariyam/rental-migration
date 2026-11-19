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
  /** Required for a custom plan — the date the deal runs until. */
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
