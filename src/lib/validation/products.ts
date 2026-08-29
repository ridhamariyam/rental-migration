import { z } from "zod";

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(200, "Search is too long")
    .optional()
    .catch(undefined),
  categoryId: z.string().trim().optional().catch(undefined),
  status: z.enum(["all", "active", "inactive"]).catch("all"),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const productIdParamSchema = z.uuid("Invalid product id");

export const productNameSchema = z
  .string()
  .trim()
  .min(2, "Must be at least 2 characters")
  .max(200, "Must be at most 200 characters");

/**
 * "+ Add product" form, shared between the client form's resolver and the
 * `POST /api/products` route handler. `image` is a URL string, not a file —
 * the file itself is uploaded separately via `POST /api/uploads` first (see
 * `src/app/api/uploads/route.ts`), and this schema only ever sees the
 * resulting path. Keeping upload and catalogue-record-creation as two
 * separate steps means a failed image upload never leaves behind a
 * half-created product.
 */
export const createProductSchema = z.object({
  name: productNameSchema,
  categoryId: z.uuid("Choose a category"),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be at most 2000 characters")
    .optional(),
  image: z.string().trim().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productStatusSchema = z.object({ isActive: z.boolean() });
export type ProductStatusInput = z.infer<typeof productStatusSchema>;
