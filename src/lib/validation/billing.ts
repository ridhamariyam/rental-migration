import { z } from "zod";
import {
  emailSchema,
  nameSchema,
  optionalPhoneSchema,
  passwordSchema,
  phoneSchema,
} from "@/lib/validation/common";
import { PLAN_IDS } from "@/lib/plans";

/**
 * Public "Buy" form — shared by the client form and
 * `POST /api/billing/signup`. The owner picks their own password here
 * (unlike an admin-provisioned tenant, there is nobody to hand a temporary
 * one to), so the account is ready to use the moment payment succeeds.
 */
export const signupSchema = z
  .object({
    plan: z.enum(PLAN_IDS),
    businessName: nameSchema,
    businessEmail: emailSchema,
    businessPhone: phoneSchema,
    address: z
      .string()
      .trim()
      .max(500, "Address must be at most 500 characters")
      .optional(),
    ownerFirstName: nameSchema,
    ownerLastName: nameSchema,
    ownerEmail: emailSchema,
    ownerPhone: optionalPhoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      error: "Please accept to continue",
    }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export type SignupInput = z.infer<typeof signupSchema>;

/** What Razorpay Checkout hands the success handler. */
export const checkoutResultSchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

export type CheckoutResult = z.infer<typeof checkoutResultSchema>;

export const renewSchema = z.object({
  plan: z.enum(PLAN_IDS),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().trim().max(500, "Must be at most 500 characters").optional(),
});

/** Super admin: set a tenant's plan/end date by hand (offline payment,
 * custom deal, comp extension). `endsAt` null clears the subscription so
 * the tenant never locks. */
export const adminSubscriptionSchema = z.object({
  plan: z.enum(["yearly", "monthly", "custom"]).nullable(),
  endsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
    .nullable(),
});

export const adminDemoSchema = z.object({
  isDemo: z.boolean(),
});

export const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  status: z.enum(["all", "paid", "created", "failed", "attention"]).catch("all"),
});

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
