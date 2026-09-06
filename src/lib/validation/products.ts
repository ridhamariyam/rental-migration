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
 * `POST /api/products` route handler. Deliberately has **no** image field:
 * a photo belongs to a physical item, not to the catalogue entry (see
 * `createVariationSchema`), so it is uploaded from "Add item" instead.
 * `products.image` still exists for rows created before that move and is
 * read as a fallback cover (see `listProducts`), but nothing writes it any
 * more.
 */
export const createProductSchema = z.object({
  name: productNameSchema,
  categoryId: z.uuid("Choose a category"),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be at most 2000 characters")
    .optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productStatusSchema = z.object({ isActive: z.boolean() });
export type ProductStatusInput = z.infer<typeof productStatusSchema>;
