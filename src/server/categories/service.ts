import "server-only";

import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { categories, products } from "@/lib/db/schema";
import type {
  CategoryFormInput,
  CategoryListQuery,
} from "@/lib/validation/categories";
import { categoryIdParamSchema } from "@/lib/validation/categories";

export type CategoryRow = typeof categories.$inferSelect;

export type CategoryListItem = CategoryRow & { productCount: number };

export type CategoryListResult = {
  items: CategoryListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Category reads, always scoped to the caller's own tenant. `productCount`
 * is computed alongside the list (not stored) so it can never drift from
 * the actual `products` rows.
 */
export async function listCategories(
  shopId: string,
  query: CategoryListQuery,
): Promise<CategoryListResult> {
  const { page, pageSize, q } = query;

  const where = q
    ? and(eq(categories.shopId, shopId), ilike(categories.name, `%${q}%`))
    : eq(categories.shopId, shopId);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(categories).where(where),
    db
      .select()
      .from(categories)
      .where(where)
      .orderBy(desc(categories.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  const productCounts = rows.length
    ? await db
        .select({ categoryId: products.categoryId, value: count() })
        .from(products)
        .where(eq(products.shopId, shopId))
        .groupBy(products.categoryId)
    : [];
  const countByCategory = new Map(
    productCounts.map((row) => [row.categoryId, row.value]),
  );

  return {
    items: rows.map((row) => ({
      ...row,
      productCount: countByCategory.get(row.id) ?? 0,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** All of a tenant's categories, unpaginated — for the "choose a category"
 * select on the product form. */
export async function listAllCategories(
  shopId: string,
): Promise<CategoryRow[]> {
  return db
    .select()
    .from(categories)
    .where(eq(categories.shopId, shopId))
    .orderBy(categories.name);
}

export async function getCategoryById(
  shopId: string,
  id: string,
): Promise<CategoryRow | null> {
  const parsedId = categoryIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, parsedId.data), eq(categories.shopId, shopId)))
    .limit(1);

  return category ?? null;
}

export async function createCategory(
  shopId: string,
  input: CategoryFormInput,
): Promise<CategoryRow> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.shopId, shopId), ilike(categories.name, input.name)),
    )
    .limit(1);

  if (existing) {
    throw new AppError("A category with this name already exists", 409, [
      { field: "name", message: "A category with this name already exists" },
    ]);
  }

  try {
    const [category] = await db
      .insert(categories)
      .values({
        shopId,
        name: input.name,
        description: input.description || null,
      })
      .returning();

    return category;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("A category with this name already exists", 409, [
        { field: "name", message: "A category with this name already exists" },
      ]);
    }
    throw error;
  }
}

export async function updateCategory(
  shopId: string,
  id: string,
  input: CategoryFormInput,
): Promise<CategoryRow> {
  const existing = await getCategoryById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Category not found");
  }

  const [conflict] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.shopId, shopId), ilike(categories.name, input.name)),
    )
    .limit(1);

  if (conflict && conflict.id !== id) {
    throw new AppError("A category with this name already exists", 409, [
      { field: "name", message: "A category with this name already exists" },
    ]);
  }

  try {
    const [category] = await db
      .update(categories)
      .set({
        name: input.name,
        description: input.description || null,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.id, id), eq(categories.shopId, shopId)))
      .returning();

    return category;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("A category with this name already exists", 409, [
        { field: "name", message: "A category with this name already exists" },
      ]);
    }
    throw error;
  }
}

/**
 * Deletion (not a soft "deactivate" like outlets/staff) — a category with
 * no products is just leftover metadata, safe to remove outright. Blocked
 * with a clear count if any product still references it, rather than
 * letting the database's own FK constraint surface as a raw 500.
 */
export async function deleteCategory(
  shopId: string,
  id: string,
): Promise<void> {
  const existing = await getCategoryById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Category not found");
  }

  const [{ value: productCount }] = await db
    .select({ value: count() })
    .from(products)
    .where(and(eq(products.categoryId, id), eq(products.shopId, shopId)));

  if (productCount > 0) {
    throw new AppError(
      `This category still has ${productCount} product${productCount === 1 ? "" : "s"} in it — move or remove them first`,
      409,
    );
  }

  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.shopId, shopId)));
}
