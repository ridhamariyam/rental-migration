import { z } from "zod";
import { emailSchema } from "@/lib/validation/common";
import { SUPER_ADMIN_PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

/**
 * Deliberately not the shared `passwordSchema` (that policy governs
 * creating or resetting a password, not logging in with one that already
 * exists) — but a login value shorter than
 * `SUPER_ADMIN_PASSWORD_MIN_LENGTH` can never be correct (env validation
 * enforces that floor on boot), so rejecting it client-side is safe and
 * saves a round trip, without leaking anything about the real password.
 */
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(
      SUPER_ADMIN_PASSWORD_MIN_LENGTH,
      `Password must be at least ${SUPER_ADMIN_PASSWORD_MIN_LENGTH} characters`,
    ),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
