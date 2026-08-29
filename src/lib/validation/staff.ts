import { z } from "zod";
import {
  emailSchema,
  nameSchema,
  optionalPhoneSchema,
} from "@/lib/validation/common";

/** Only these two roles are ever assigned through this form — `admin` and
 * `super_admin` accounts are provisioned elsewhere (tenant creation,
 * platform setup), never through "add staff". */
export const staffRoleSchema = z.enum(["manager", "staff"], {
  error: "Choose a role",
});

export const staffListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(200, "Search is too long")
    .optional()
    .catch(undefined),
  role: z.enum(["all", "manager", "staff"]).catch("all"),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
  outletId: z.string().trim().optional().catch(undefined),
});

export type StaffListQuery = z.infer<typeof staffListQuerySchema>;

export const staffIdParamSchema = z.uuid("Invalid staff id");

/**
 * "+ Add staff" form, shared between the client form's resolver and the
 * `POST /api/staff` route handler. `role` is checked again server-side
 * against `canAssignRole()` — the schema only constrains it to the two
 * assignable values, it doesn't know *who* is submitting.
 */
export const createStaffSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: optionalPhoneSchema,
  role: staffRoleSchema,
  outletId: z.uuid("Choose an outlet"),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/**
 * Editing an existing staff/manager account — deliberately excludes email
 * (changing a login identity is a distinct, bigger workflow not in this
 * phase's scope) and password (that's the forced-reset flow from Phase 7,
 * not an admin-set field).
 */
export const updateStaffSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: optionalPhoneSchema,
  role: staffRoleSchema,
  outletId: z.uuid("Choose an outlet"),
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const staffStatusSchema = z.object({ isActive: z.boolean() });
export type StaffStatusInput = z.infer<typeof staffStatusSchema>;
