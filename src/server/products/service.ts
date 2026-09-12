import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  ne,
  or,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import {
  bookingItems,
  categories,
  productVariations,
  products,
} from "@/lib/db/schema";
import { requireActiveOutlet } from "@/server/outlets/service";
import {
  insertVariations,
  withIdentifierConflictHandling,
} from "@/server/variations/service";
import type {
  CreateProductInput,
  CreateProductWithItemInput,
  ProductListQuery,
  UpdateProductInput,
} from "@/lib/validation/products";
import { productIdParamSchema } from "@/lib/validation/products";

export type ProductRow = typeof products.$inferSelect;

export type ProductListItem = ProductRow & {
  categoryName: string;
  variationCount: number;
  /** The picture to show for this product — the photo of its oldest
   * physical item that has one (photos live on `productVariations` now,
   * see that table's doc comment), falling back to the catalogue row's own
   * `image` for products created before the upload moved to "Add item". */
  coverImage: string | null;
};

export type ProductListResult = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Product reads, always scoped to the caller's own tenant. All filtering
 * happens in the database, same discipline as `listOutlets`/`listStaff`.
 */
export async function listProducts(
  shopId: string,
  query: ProductListQuery,
): Promise<ProductListResult> {
  const { page, pageSize, q, categoryId, status } = query;

  const conditions = [eq(products.shopId, shopId)];

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(ilike(products.name, pattern), ilike(products.description, pattern))!,
    );
  }

  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }

  if (status === "active") {
    conditions.push(eq(products.isActive, true));
  } else if (status === "inactive") {
    conditions.push(eq(products.isActive, false));
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(products).where(where),
    db
      .select({
        id: products.id,
        shopId: products.shopId,
        categoryId: products.categoryId,
        name: products.name,
        description: products.description,
        image: products.image,
        isActive: products.isActive,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(desc(products.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  const variationCounts = rows.length
    ? await db
        .select({ productId: productVariations.productId, value: count() })
        .from(productVariations)
        .where(
          or(...rows.map((row) => eq(productVariations.productId, row.id))),
        )
        .groupBy(productVariations.productId)
    : [];
  const countByProduct = new Map(
    variationCounts.map((row) => [row.productId, row.value]),
  );

  // One query for the whole page's covers rather than one per row — the
  // oldest photographed item per product wins, so a product's cover stays
  // put as newer copies are added.
  const variationImages = rows.length
    ? await db
        .select({
          productId: productVariations.productId,
          image: productVariations.image,
        })
        .from(productVariations)
        .where(
          and(
            or(...rows.map((row) => eq(productVariations.productId, row.id))),
            isNotNull(productVariations.image),
          ),
        )
        .orderBy(asc(productVariations.createdAt))
    : [];
  const imageByProduct = new Map<string, string>();
  for (const row of variationImages) {
    if (row.image && !imageByProduct.has(row.productId)) {
      imageByProduct.set(row.productId, row.image);
    }
  }

  return {
    items: rows.map((row) => ({
      ...row,
      variationCount: countByProduct.get(row.id) ?? 0,
      coverImage: imageByProduct.get(row.id) ?? row.image,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type ProductStats = {
  total: number;
  active: number;
  inactive: number;
};

export async function getProductStats(shopId: string): Promise<ProductStats> {
  const [totalRow, activeRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(products)
      .where(eq(products.shopId, shopId)),
    db
      .select({ value: count() })
      .from(products)
      .where(and(eq(products.shopId, shopId), eq(products.isActive, true))),
  ]);

  const total = totalRow[0]?.value ?? 0;
  const active = activeRow[0]?.value ?? 0;

  return { total, active, inactive: total - active };
}

/**
 * Returns `null` for an invalid id, a nonexistent product, or a product
 * belonging to a different tenant — the caller turns any of these into a
 * 404, same tenant-isolation reasoning as everywhere else in this app.
 */
export async function getProductById(
  shopId: string,
  id: string,
): Promise<ProductListItem | null> {
  const parsedId = productIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const [row] = await db
    .select({
      id: products.id,
      shopId: products.shopId,
      categoryId: products.categoryId,
      name: products.name,
      description: products.description,
      image: products.image,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.id, parsedId.data), eq(products.shopId, shopId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const [{ value: variationCount }] = await db
    .select({ value: count() })
    .from(productVariations)
    .where(eq(productVariations.productId, row.id));

  const [firstPhotographedItem] = await db
    .select({ image: productVariations.image })
    .from(productVariations)
    .where(
      and(
        eq(productVariations.productId, row.id),
        isNotNull(productVariations.image),
      ),
    )
    .orderBy(asc(productVariations.createdAt))
    .limit(1);

  return {
    ...row,
    variationCount,
    coverImage: firstPhotographedItem?.image ?? row.image,
  };
}

async function requireCategory(shopId: string, categoryId: string) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.shopId, shopId)))
    .limit(1);

  if (!category) {
    throw new AppError("Category not found", 404, [
      { field: "categoryId", message: "Choose a valid category" },
    ]);
  }
}

/** Same product name within the same category is almost always a mistake
 * (an accidental double-submit or someone forgetting one already exists) —
 * blocked case-insensitively, scoped per category so the same name is
 * still fine across two different categories. */
async function requireUniqueName(
  shopId: string,
  categoryId: string,
  name: string,
  excludeId?: string,
) {
  const conditions = [
    eq(products.shopId, shopId),
    eq(products.categoryId, categoryId),
    ilike(products.name, name.trim()),
  ];
  if (excludeId) {
    conditions.push(ne(products.id, excludeId));
  }

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new AppError(
      "A product with this name already exists in this category",
      409,
      [
        {
          field: "name",
          message: "A product with this name already exists in this category",
        },
      ],
    );
  }
}

export async function createProduct(
  shopId: string,
  input: CreateProductInput,
): Promise<ProductRow> {
  await requireCategory(shopId, input.categoryId);
  await requireUniqueName(shopId, input.categoryId, input.name);

  const [product] = await db
    .insert(products)
    .values({
      shopId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description || null,
    })
    .returning();

  return product;
}

/**
 * "Add product" in one submit: the catalogue entry *and* its first
 * barcoded item. Creating a product used to leave it unbookable until
 * someone opened its page and added an item as a separate second step, so
 * the two now happen together — the item half is exactly what "+ Add item"
 * creates (`insertVariations`), sharing this function's transaction so a
 * rejected item (duplicate SKU, duplicate colour/size at an outlet) rolls
 * the product back rather than stranding an empty listing.
 *
 * Every check that reads through the pool runs *before* the transaction
 * opens, for the `max: 1` dev-pool reason documented on `insertVariations`.
 * Field errors raised by the item half come back namespaced (`item.sku`,
 * `item.color`, …), matching the nested shape `createProductWithItemSchema`
 * validates and the form registers its inputs under.
 */
export async function createProductWithItem(
  shopId: string,
  input: CreateProductWithItemInput,
): Promise<ProductRow> {
  await requireCategory(shopId, input.categoryId);
  await requireUniqueName(shopId, input.categoryId, input.name);

  for (const outletId of input.item.outletIds) {
    await requireActiveOutlet(shopId, outletId);
  }

  return withIdentifierConflictHandling(() =>
    db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          shopId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description || null,
        })
        .returning();

      try {
        await insertVariations(tx, {
          productId: product.id,
          productName: product.name,
          input: input.item,
        });
      } catch (error) {
        throw namespaceItemErrors(error);
      }

      return product;
    }),
  );
}

/** Re-labels an item-level `AppError`'s field errors as `item.<field>` so
 * the combined form can attach them to its nested inputs — the item
 * services know nothing about being nested under a product form. */
function namespaceItemErrors(error: unknown): unknown {
  if (!(error instanceof AppError) || error.fieldErrors.length === 0) {
    return error;
  }

  return new AppError(
    error.message,
    error.status,
    error.fieldErrors.map((fieldError) => ({
      field: `item.${fieldError.field}`,
      message: fieldError.message,
    })),
  );
}

/**
 * Permanently removes a catalogue entry and its physical items. Owner-only.
 *
 * Refused once any of its items has ever been booked: those booking lines
 * name this product, and deleting it would leave finished rentals pointing
 * at nothing. Deactivating the product is the answer for "we don't rent
 * this any more" — this is for a listing entered by mistake.
 */
export async function deleteProduct(
  actor: TenantSessionUser,
  id: string,
): Promise<void> {
  if (!hasPermission(actor.role, Permission.RECORD_DELETE)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const existing = await getProductById(actor.shopId, id);
  if (!existing) {
    throw AppError.notFound("Product not found");
  }

  const [{ value: bookedCount }] = await db
    .select({ value: count() })
    .from(bookingItems)
    .where(eq(bookingItems.productId, id));

  if (bookedCount > 0) {
    throw new AppError(
      `This product appears on ${bookedCount} booking${bookedCount === 1 ? "" : "s"} — deactivate it instead so that history stays readable`,
      409,
    );
  }

  await recordAudit(db, {
    shopId: actor.shopId,
    userId: actor.id,
    action: AuditAction.PRODUCT_DELETED,
    entityType: "product",
    entityId: id,
    summary: `Product "${existing.name}" deleted`,
    before: {
      name: existing.name,
      categoryId: existing.categoryId,
      variationCount: existing.variationCount,
    },
  });

  await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.shopId, actor.shopId)));
}

export async function updateProduct(
  shopId: string,
  id: string,
  input: UpdateProductInput,
): Promise<ProductRow> {
  const existing = await getProductById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Product not found");
  }

  await requireCategory(shopId, input.categoryId);
  await requireUniqueName(shopId, input.categoryId, input.name, id);

  const [product] = await db
    .update(products)
    .set({
      categoryId: input.categoryId,
      name: input.name,
      description: input.description || null,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.shopId, shopId)))
    .returning();

  return product;
}

export async function setProductStatus(
  shopId: string,
  id: string,
  isActive: boolean,
): Promise<ProductRow> {
  const existing = await getProductById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Product not found");
  }

  const [product] = await db
    .update(products)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.shopId, shopId)))
    .returning();

  return product;
}
