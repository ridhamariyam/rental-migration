import { z } from "zod";
import {
  emailSchema,
  nameSchema,
  optionalPhoneSchema,
  phoneSchema,
} from "@/lib/validation/common";

/**
 * Shared between the tenant list Server Component (reads `searchParams`)
 * and the `GET /api/admin/tenants` route handler (reads the URL query
 * string) — both are plain string key/value maps, hence `z.coerce` on the
 * numeric fields.
 */
export const tenantListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(200, "Search is too long")
    .optional()
    .catch(undefined),
  status: z.enum(["all", "active", "blocked"]).catch("all"),
});

export type TenantListQuery = z.infer<typeof tenantListQuerySchema>;

export const tenantIdParamSchema = z.uuid("Invalid tenant id");

/**
 * "+ Add Tenant" form, shared between the client form's resolver and the
 * `POST /api/admin/tenants` route handler — the same rules apply whether
 * or not the browser-side check ran first. Creating a tenant always
 * provisions its first admin user in the same step (Phase 5) — these are
 * that user's own fields, distinct from the shop's business contact info.
 */
export const createTenantSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  address: z
    .string()
    .trim()
    .max(500, "Address must be at most 500 characters")
    .optional(),
  ownerFirstName: nameSchema,
  ownerLastName: nameSchema,
  ownerEmail: emailSchema,
  ownerPhone: optionalPhoneSchema,
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const tenantStatusSchema = z.object({
  isActive: z.boolean(),
});

export type TenantStatusInput = z.infer<typeof tenantStatusSchema>;
