import "server-only";

import { and, asc, count, desc, eq, ilike, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { categories, productVariations, products } from "@/lib/db/schema";
import type {
  CreateProductInput,
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

export async function createProduct(
  shopId: string,
  input: CreateProductInput,
): Promise<ProductRow> {
  await requireCategory(shopId, input.categoryId);

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
