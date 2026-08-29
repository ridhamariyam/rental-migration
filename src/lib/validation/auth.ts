import { z } from "zod";
import { emailSchema, passwordSchema } from "@/lib/validation/common";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

/**
 * Tenant-facing login (`/login`, distinct from `/admin/login`). Deliberately
 * not the shared `passwordSchema` (that policy governs creating or
 * resetting a password, not logging in with one that already exists) — but
 * a login value shorter than `PASSWORD_MIN_LENGTH` can never be correct
 * (every password in this app, including generated temporary ones, is held
 * to that floor), so rejecting it client-side is safe and saves a round
 * trip without leaking anything about the real password.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    ),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Forced first-login password reset (Phase 7) — no current-password field,
 * deliberately: the account is already known to be in the forced-reset
 * state (checked server-side via the session, not client input) precisely
 * *because* it's still on a system-generated temporary password, so there
 * is no legitimate "current password" a real owner would be proving they
 * know beyond having the session itself. Held to the same `passwordSchema`
 * every other created-or-reset password in the app uses.
 */
export const changePasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
