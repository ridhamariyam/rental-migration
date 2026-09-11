import { z } from "zod";
import { createVariationSchema } from "@/lib/validation/variations";

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
 * The catalogue half of a product — the shared base of
 * `createProductWithItemSchema` (what the "Add product" form actually
 * submits), `createProductRequestSchema` and `updateProductSchema`.
 * Deliberately has **no** image field:
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

/**
 * The "Add product" form's real payload: the catalogue entry *and* its
 * first physical item, created together in one submit. Adding a product
 * used to be two steps — create the listing, then open its page and add an
 * item to it — which left a product unbookable (and easy to forget about)
 * until the second step happened. The item half is the same
 * `createVariationSchema` "+ Add item" uses, nested rather than restated,
 * so both entry points validate a physical item identically.
 */
export const createProductWithItemSchema = createProductSchema.extend({
  item: createVariationSchema,
});

export type CreateProductWithItemInput = z.infer<
  typeof createProductWithItemSchema
>;

/**
 * What `POST /api/products` accepts: the item is *optional* here, unlike
 * the form schema above. A shop with no active outlet yet has nothing to
 * stock an item at, so the form falls back to creating the catalogue row
 * on its own and the item is added later from the product's page.
 */
export const createProductRequestSchema = createProductSchema.extend({
  item: createVariationSchema.optional(),
});

export type CreateProductRequestInput = z.infer<
  typeof createProductRequestSchema
>;

export const updateProductSchema = createProductSchema;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productStatusSchema = z.object({ isActive: z.boolean() });
export type ProductStatusInput = z.infer<typeof productStatusSchema>;
