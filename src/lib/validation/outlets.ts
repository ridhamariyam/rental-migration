import { z } from "zod";
import { optionalPhoneSchema } from "@/lib/validation/common";

/**
 * Shared between the outlet list Server Component (reads `searchParams`)
 * and the `GET /api/outlets` route handler — mirrors
 * `tenantListQuerySchema`'s shape/reasoning exactly (`.catch()` fallbacks
 * rather than throwing, since these are UI list params, not a form
 * submission).
 */
export const outletListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(200, "Search is too long")
    .optional()
    .catch(undefined),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
});

export type OutletListQuery = z.infer<typeof outletListQuerySchema>;

export const outletIdParamSchema = z.uuid("Invalid outlet id");

export const outletNameSchema = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters")
  .max(150, "Must be at most 150 characters");

/**
 * Uppercased in the service layer (not here via `.transform()`) — a
 * `.transform()` on a schema shared with `zodResolver()` breaks its
 * generic's input/output type equality, the same gotcha documented for
 * `optionalPhoneSchema`.
 */
export const outletCodeSchema = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters")
  .max(30, "Must be at most 30 characters")
  .regex(/^[A-Za-z0-9-]+$/, "Use only letters, numbers, and hyphens");

/** A number-shaped string field, optional, validated in range if present —
 * kept as a string (not `z.coerce.number()`) so an empty input box isn't
 * coerced to `0`/`NaN` and the schema's input/output types stay identical
 * for `zodResolver`. Parsed to a real number only in the service layer. */
function optionalNumericString(
  min: number,
  max: number,
  message: string,
  integerOnly = false,
) {
  return z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => {
        if (!value) return true;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
          return false;
        }
        return !integerOnly || Number.isInteger(parsed);
      },
      { message },
    );
}

export const outletFormFields = {
  name: outletNameSchema,
  code: outletCodeSchema,
  address: z
    .string()
    .trim()
    .max(500, "Address must be at most 500 characters")
    .optional(),
  phone: optionalPhoneSchema,
  latitude: optionalNumericString(
    -90,
    90,
    "Latitude must be between -90 and 90",
  ),
  longitude: optionalNumericString(
    -180,
    180,
    "Longitude must be between -180 and 180",
  ),
  allowedRadiusMetres: optionalNumericString(
    10,
    100_000,
    "Radius must be a whole number of metres between 10 and 100,000",
    true,
  ),
};

export const createOutletSchema = z.object(outletFormFields);
export type CreateOutletInput = z.infer<typeof createOutletSchema>;

export const updateOutletSchema = z.object(outletFormFields);
export type UpdateOutletInput = z.infer<typeof updateOutletSchema>;

export const outletStatusSchema = z.object({ isActive: z.boolean() });
export type OutletStatusInput = z.infer<typeof outletStatusSchema>;
