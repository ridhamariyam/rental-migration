/**
 * Duplicate-name-in-category guard on `createProduct`/`updateProduct` —
 * against a real database because the check itself is a database query.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { db, resetDatabase, seedShop } from "@/test/db";
import { categories } from "@/lib/db/schema";
import { AppError } from "@/lib/errors/app-error";
import { createProduct, updateProduct } from "@/server/products/service";

test("blocks a second product with the same name in the same category", async () => {
  await resetDatabase();
  const fixture = await seedShop();

  await createProduct(fixture.shopId, {
    name: "Ring",
    categoryId: fixture.categoryId,
  });

  await assert.rejects(
    createProduct(fixture.shopId, {
      name: "Ring",
      categoryId: fixture.categoryId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 409);
      return true;
    },
  );
});

test("the duplicate-name check is case-insensitive", async () => {
  await resetDatabase();
  const fixture = await seedShop();

  await createProduct(fixture.shopId, {
    name: "Ring",
    categoryId: fixture.categoryId,
  });

  await assert.rejects(
    createProduct(fixture.shopId, {
      name: "RiNg",
      categoryId: fixture.categoryId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 409);
      return true;
    },
  );
});

test("the same name is allowed in a different category", async () => {
  await resetDatabase();
  const fixture = await seedShop();

  const [otherCategory] = await db
    .insert(categories)
    .values({ shopId: fixture.shopId, name: "Other Category" })
    .returning();

  await createProduct(fixture.shopId, {
    name: "Ring",
    categoryId: fixture.categoryId,
  });

  const secondProduct = await createProduct(fixture.shopId, {
    name: "Ring",
    categoryId: otherCategory.id,
  });

  assert.equal(secondProduct.name, "Ring");
});

test("updateProduct blocks renaming into a duplicate but allows keeping its own name", async () => {
  await resetDatabase();
  const fixture = await seedShop();

  const first = await createProduct(fixture.shopId, {
    name: "Ring",
    categoryId: fixture.categoryId,
  });
  const second = await createProduct(fixture.shopId, {
    name: "Necklace",
    categoryId: fixture.categoryId,
  });

  await assert.rejects(
    updateProduct(fixture.shopId, second.id, {
      name: "Ring",
      categoryId: fixture.categoryId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 409);
      return true;
    },
  );

  // Saving the first product again with its own unchanged name must not
  // trip over itself.
  const resaved = await updateProduct(fixture.shopId, first.id, {
    name: "Ring",
    categoryId: fixture.categoryId,
  });
  assert.equal(resaved.name, "Ring");
});
