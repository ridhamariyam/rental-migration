import { z } from "zod";
import {
  nameSchema,
  optionalPhoneSchema,
  passwordSchema,
} from "@/lib/validation/common";

/**
 * The self-service "Profile" page (any signed-in tenant role). Deliberately
 * excludes `email`/`role`/`shopId`/`outletId` — those are either an
 * account's login identity or its tenant-assigned scope, and letting a
 * self-edit change them is exactly the legacy backend bug documented in
 * CLAUDE.md ("self-edit path skips ALL permission checks ... lets a
 * customer set their own outlet_id"). `avatarUrl` is the URL an upload to
 * `POST /api/uploads/avatar` returned — this schema never receives a file
 * itself, same separation as `createProductSchema`'s `image` field.
 * `avatarUrl: ""` means "remove my photo" (falls back to the deterministic
 * gradient/initials avatar everywhere it renders).
 */
export const updateProfileSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: optionalPhoneSchema,
  avatarUrl: z.string().trim().max(2048).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Genuine self-service password change — unlike `changePasswordSchema` in
 * `validation/auth.ts` (the forced first-login reset, which trusts the
 * session alone), this requires proving the *current* password since the
 * account isn't already known to be on a system-generated temporary one.
 */
export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordSchema>;
