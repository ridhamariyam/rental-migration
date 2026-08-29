import { z } from "zod";
import { moneySchema, optionalUuidSchema, percentageSchema } from "@/lib/validation/common";

export const variationIdParamSchema = z.uuid("Invalid item id");

/** A whole-number-shaped string field — kept as a string (not
 * `z.coerce.number()`) for the same `zodResolver` input/output type-equality
 * reason documented on `optionalNumericString` in `validation/outlets.ts`. */
export const quantitySchema = z
  .string()
  .trim()
  .min(1, "Required")
  .refine(
    (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999;
    },
    { message: "Enter a whole number between 1 and 9,999" },
  );

const optionalSkuSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) => !value || /^[A-Za-z0-9-]{3,50}$/.test(value),
    "Use only letters, numbers, and hyphens (3–50 characters)",
  );

const optionalBarcodeSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) => !value || /^[0-9]{6,20}$/.test(value),
    "Use only digits (6–20 characters)",
  );

/**
 * "+ Add item" form for a product variation, shared between the client
 * form and the `POST /api/products/[id]/variations` route handler. Leaving
 * `sku`/`barcode` blank auto-generates both (see `src/lib/barcode.ts` +
 * the uniqueness-checked allocation in `src/server/variations/service.ts`);
 * providing one lets an owner match an existing physical label rather than
 * printing a new one.
 *
 * Ownership fields (Phase 16, doc §19–21): `ownershipType` defaults to
 * `shop_owned`, in which case none of the owner fields are read. Switching
 * to `customer_owned` requires *some* way to identify the owner (a linked
 * `ownerCustomerId` or a free-text `ownerName`) and a share above 0 — the
 * same two rules the legacy backend's `check_owner_details` validator
 * enforced, ported here rather than left to the database to reject.
 */
export const createVariationSchema = z
  .object({
    color: z.string().trim().max(50, "Must be at most 50 characters").optional(),
    size: z.string().trim().max(50, "Must be at most 50 characters").optional(),
    rentPrice: moneySchema,
    securityDeposit: moneySchema,
    quantity: quantitySchema,
    // One or more outlets this same item is stocked at — each selected
    // outlet becomes its own physical, separately-barcoded copy (see
    // `createVariation` in `server/variations/service.ts`), not one row
    // shared across outlets.
    outletIds: z
      .array(z.uuid("Invalid outlet"))
      .min(1, "Choose at least one outlet"),
    sku: optionalSkuSchema,
    barcode: optionalBarcodeSchema,
    ownershipType: z.enum(["shop_owned", "customer_owned"]),
    ownerName: z
      .string()
      .trim()
      .max(200, "Must be at most 200 characters")
      .optional(),
    ownerPhone: z
      .string()
      .trim()
      .max(30, "Must be at most 30 characters")
      .optional(),
    ownerCustomerId: optionalUuidSchema,
    ownerSharePercentage: percentageSchema.optional(),
    ownerNotes: z
      .string()
      .trim()
      .max(1000, "Must be at most 1000 characters")
      .optional(),
  })
  .superRefine((data, ctx) => {
    // A manual SKU/barcode matches one specific physical label — it can
    // only ever apply to a single new item, never be reused across
    // several outlets' copies at once.
    if (data.outletIds.length > 1) {
      if (data.sku) {
        ctx.addIssue({
          code: "custom",
          path: ["sku"],
          message: "Leave SKU blank when adding to more than one outlet",
        });
      }
      if (data.barcode) {
        ctx.addIssue({
          code: "custom",
          path: ["barcode"],
          message: "Leave barcode blank when adding to more than one outlet",
        });
      }
    }

    if (data.ownershipType !== "customer_owned") {
      return;
    }
    if (!data.ownerName?.trim() && !data.ownerCustomerId) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerName"],
        message: "A customer-owned item needs an owner name or a linked customer",
      });
    }
    if (!data.ownerSharePercentage || Number(data.ownerSharePercentage) <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerSharePercentage"],
        message: "A customer-owned item needs a revenue share above 0",
      });
    }
  });

export type CreateVariationInput = z.infer<typeof createVariationSchema>;

/**
 * Editing an existing item — deliberately excludes `sku`/`barcode`. Those
 * are allocated once at creation and printed onto a physical label; letting
 * them change later would desync the label already stuck on the item.
 * Ownership fields follow the exact same rule `createVariationSchema` does.
 */
export const updateVariationSchema = z
  .object({
    color: z.string().trim().max(50, "Must be at most 50 characters").optional(),
    size: z.string().trim().max(50, "Must be at most 50 characters").optional(),
    rentPrice: moneySchema,
    securityDeposit: moneySchema,
    quantity: quantitySchema,
    outletId: z.uuid("Choose an outlet"),
    ownershipType: z.enum(["shop_owned", "customer_owned"]),
    ownerName: z
      .string()
      .trim()
      .max(200, "Must be at most 200 characters")
      .optional(),
    ownerPhone: z
      .string()
      .trim()
      .max(30, "Must be at most 30 characters")
      .optional(),
    ownerCustomerId: optionalUuidSchema,
    ownerSharePercentage: percentageSchema.optional(),
    ownerNotes: z
      .string()
      .trim()
      .max(1000, "Must be at most 1000 characters")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.ownershipType !== "customer_owned") {
      return;
    }
    if (!data.ownerName?.trim() && !data.ownerCustomerId) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerName"],
        message: "A customer-owned item needs an owner name or a linked customer",
      });
    }
    if (!data.ownerSharePercentage || Number(data.ownerSharePercentage) <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["ownerSharePercentage"],
        message: "A customer-owned item needs a revenue share above 0",
      });
    }
  });

export type UpdateVariationInput = z.infer<typeof updateVariationSchema>;

export const variationAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});
export type VariationAvailabilityInput = z.infer<
  typeof variationAvailabilitySchema
>;

/**
 * Only the three lifecycle states reachable *by hand* in this phase — the
 * other four (`rented`/`needs_cleaning`/`cleaning`/`in_transfer`) are only
 * ever written by later phases' own workflows (bookings, cleaning,
 * transfers), never picked from a dropdown here.
 */
export const variationStatusSchema = z.object({
  status: z.enum(["available", "maintenance", "retired"]),
});
export type VariationStatusInput = z.infer<typeof variationStatusSchema>;
