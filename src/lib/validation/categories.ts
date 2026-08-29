import { z } from "zod";
import { nameSchema } from "@/lib/validation/common";

export const categoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(200, "Search is too long")
    .optional()
    .catch(undefined),
});

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;

export const categoryIdParamSchema = z.uuid("Invalid category id");

/**
 * Shared between the create/edit dialog's client form and the
 * `POST`/`PATCH /api/categories` route handlers. Categories are simple
 * enough (name + description) that create and edit use the exact same
 * schema and the exact same dialog component.
 */
export const categoryFormSchema = z.object({
  name: nameSchema,
  description: z
    .string()
    .trim()
    .max(500, "Description must be at most 500 characters")
    .optional(),
});

export type CategoryFormInput = z.infer<typeof categoryFormSchema>;
