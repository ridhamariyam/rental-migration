import { z } from "zod";
import { emailSchema, nameSchema, phoneSchema } from "@/lib/validation/common";

/**
 * "Business Settings" (tenant dashboard, admin-only via `Permission
 * .SHOP_MANAGE`) — the shop owner editing their own `shops` row. This is
 * the fix for the known gap in CLAUDE.md's backend notes ("tenant ADMIN
 * can never edit their own shop profile" in the legacy app): here it's a
 * real, permission-gated, self-service screen instead of a super-admin-only
 * action. `logoUrl` is a Cloudinary URL from `POST /api/uploads/avatar`,
 * same upload endpoint a user's own profile photo uses — `""` clears it.
 */
export const updateBusinessSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  address: z
    .string()
    .trim()
    .max(500, "Address must be at most 500 characters")
    .optional(),
  logoUrl: z.string().trim().max(2048).optional(),
});

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
