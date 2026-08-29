import "server-only";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import { generateBarcode, generateSku } from "@/lib/barcode";
import { outlets, productVariations, products } from "@/lib/db/schema";
import { requireActiveOutlet } from "@/server/outlets/service";
import type {
  CreateVariationInput,
  UpdateVariationInput,
} from "@/lib/validation/variations";
import { variationIdParamSchema } from "@/lib/validation/variations";

export type VariationRow = typeof productVariations.$inferSelect;

export type VariationListItem = VariationRow & {
  outletName: string | null;
  outletCode: string | null;
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
 * All of a product's physical items, most-recent first — deliberately
 * unpaginated. A single product realistically has a handful to a few dozen
 * barcoded copies, browsed alongside the product itself, not as its own
 * app-wide list (that's what the top-level Products list is for).
 */
export async function listVariationsForProduct(
  shopId: string,
  productId: string,
): Promise<VariationListItem[]> {
  return db
    .select({
      id: productVariations.id,
      productId: productVariations.productId,
      outletId: productVariations.outletId,
      color: productVariations.color,
      size: productVariations.size,
      rentPrice: productVariations.rentPrice,
      securityDeposit: productVariations.securityDeposit,
      quantity: productVariations.quantity,
      sku: productVariations.sku,
      barcode: productVariations.barcode,
      gallery: productVariations.gallery,
      isAvailable: productVariations.isAvailable,
      status: productVariations.status,
      ownershipType: productVariations.ownershipType,
      ownerName: productVariations.ownerName,
      ownerPhone: productVariations.ownerPhone,
      ownerCustomerId: productVariations.ownerCustomerId,
      ownerSharePercentage: productVariations.ownerSharePercentage,
      ownerNotes: productVariations.ownerNotes,
      createdAt: productVariations.createdAt,
      updatedAt: productVariations.updatedAt,
      outletName: outlets.name,
      outletCode: outlets.code,
    })
    .from(productVariations)
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(outlets, eq(productVariations.outletId, outlets.id))
    .where(
      and(
        eq(productVariations.productId, productId),
        eq(products.shopId, shopId),
      ),
    )
    .orderBy(desc(productVariations.createdAt));
}

/**
 * Returns `null` for an invalid id, a nonexistent item, or an item whose
 * product belongs to another tenant — same "don't reveal which case it
 * was" 404 reasoning used everywhere else.
 */
export async function getVariationById(
  shopId: string,
  id: string,
): Promise<VariationListItem | null> {
  const parsedId = variationIdParamSchema.safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  const [row] = await db
    .select({
      id: productVariations.id,
      productId: productVariations.productId,
      outletId: productVariations.outletId,
      color: productVariations.color,
      size: productVariations.size,
      rentPrice: productVariations.rentPrice,
      securityDeposit: productVariations.securityDeposit,
      quantity: productVariations.quantity,
      sku: productVariations.sku,
      barcode: productVariations.barcode,
      gallery: productVariations.gallery,
      isAvailable: productVariations.isAvailable,
      status: productVariations.status,
      ownershipType: productVariations.ownershipType,
      ownerName: productVariations.ownerName,
      ownerPhone: productVariations.ownerPhone,
      ownerCustomerId: productVariations.ownerCustomerId,
      ownerSharePercentage: productVariations.ownerSharePercentage,
      ownerNotes: productVariations.ownerNotes,
      createdAt: productVariations.createdAt,
      updatedAt: productVariations.updatedAt,
      outletName: outlets.name,
      outletCode: outlets.code,
    })
    .from(productVariations)
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(outlets, eq(productVariations.outletId, outlets.id))
    .where(
      and(eq(productVariations.id, parsedId.data), eq(products.shopId, shopId)),
    )
    .limit(1);

  return row ?? null;
}

/** Retries the generator against the database until it lands on a value
 * that isn't already taken — mirrors the legacy backend's `unique_value`
 * helper. SKU/barcode are unique **globally**, not per tenant (see the
 * table-level doc comment in `schema/product-variations.ts`). */
async function allocateUnique(
  generator: () => string,
  column: typeof productVariations.sku | typeof productVariations.barcode,
  attempts = 12,
): Promise<string> {
  for (let i = 0; i < attempts; i += 1) {
    const candidate = generator();
    const [existing] = await db
      .select({ id: productVariations.id })
      .from(productVariations)
      .where(eq(column, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }
  }

  throw new Error("Could not generate a unique value after several attempts");
}

async function allocateIdentifiers(
  productName: string,
  manualSku: string | undefined,
  manualBarcode: string | undefined,
): Promise<{ sku: string; barcode: string }> {
  let sku: string;
  if (manualSku) {
    const [existing] = await db
      .select({ id: productVariations.id })
      .from(productVariations)
      .where(eq(productVariations.sku, manualSku))
      .limit(1);
    if (existing) {
      throw new AppError(`SKU '${manualSku}' is already in use`, 409, [
        { field: "sku", message: "This SKU is already in use" },
      ]);
    }
    sku = manualSku;
  } else {
    sku = await allocateUnique(
      () => generateSku(productName),
      productVariations.sku,
    );
  }

  let barcode: string;
  if (manualBarcode) {
    const [existing] = await db
      .select({ id: productVariations.id })
      .from(productVariations)
      .where(eq(productVariations.barcode, manualBarcode))
      .limit(1);
    if (existing) {
      throw new AppError(`Barcode '${manualBarcode}' is already in use`, 409, [
        { field: "barcode", message: "This barcode is already in use" },
      ]);
    }
    barcode = manualBarcode;
  } else {
    barcode = await allocateUnique(generateBarcode, productVariations.barcode);
  }

  return { sku, barcode };
}

async function requireProduct(shopId: string, productId: string) {
  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.shopId, shopId)))
    .limit(1);

  if (!product) {
    throw AppError.notFound("Product not found");
  }

  return product;
}

export async function createVariation(
  shopId: string,
  productId: string,
  input: CreateVariationInput,
): Promise<VariationRow[]> {
  const product = await requireProduct(shopId, productId);

  for (const outletId of input.outletIds) {
    await requireActiveOutlet(shopId, outletId);
  }

  const created: VariationRow[] = [];

  try {
    await db.transaction(async (tx) => {
      for (const outletId of input.outletIds) {
        // A manual sku/barcode only ever applies to a single outlet's copy
        // (enforced by `createVariationSchema`'s superRefine) — every
        // other outlet in the batch always gets a freshly auto-generated
        // pair.
        const { sku, barcode } = await allocateIdentifiers(
          product.name,
          input.outletIds.length === 1 ? input.sku : undefined,
          input.outletIds.length === 1 ? input.barcode : undefined,
        );

        const [variation] = await tx
          .insert(productVariations)
          .values({
            productId,
            outletId,
            color: input.color || null,
            size: input.size || null,
            rentPrice: input.rentPrice,
            securityDeposit: input.securityDeposit,
            quantity: Number(input.quantity),
            sku,
            barcode,
            ownershipType: input.ownershipType,
            ownerName: input.ownershipType === "customer_owned" ? input.ownerName || null : null,
            ownerPhone: input.ownershipType === "customer_owned" ? input.ownerPhone || null : null,
            ownerCustomerId:
              input.ownershipType === "customer_owned" ? input.ownerCustomerId || null : null,
            ownerSharePercentage:
              input.ownershipType === "customer_owned" ? input.ownerSharePercentage || "0" : "0",
            ownerNotes: input.ownershipType === "customer_owned" ? input.ownerNotes || null : null,
          })
          .returning();

        created.push(variation);
      }
    });

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        "That SKU or barcode was just taken by another item — try again",
        409,
      );
    }
    throw error;
  }
}

export async function updateVariation(
  shopId: string,
  id: string,
  input: UpdateVariationInput,
): Promise<VariationRow> {
  const existing = await getVariationById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Item not found");
  }

  await requireActiveOutlet(shopId, input.outletId);

  const [variation] = await db
    .update(productVariations)
    .set({
      color: input.color || null,
      size: input.size || null,
      rentPrice: input.rentPrice,
      securityDeposit: input.securityDeposit,
      quantity: Number(input.quantity),
      outletId: input.outletId,
      ownershipType: input.ownershipType,
      ownerName: input.ownershipType === "customer_owned" ? input.ownerName || null : null,
      ownerPhone: input.ownershipType === "customer_owned" ? input.ownerPhone || null : null,
      ownerCustomerId:
        input.ownershipType === "customer_owned" ? input.ownerCustomerId || null : null,
      ownerSharePercentage:
        input.ownershipType === "customer_owned" ? input.ownerSharePercentage || "0" : "0",
      ownerNotes: input.ownershipType === "customer_owned" ? input.ownerNotes || null : null,
      updatedAt: new Date(),
    })
    .where(eq(productVariations.id, id))
    .returning();

  return variation;
}

export async function setVariationAvailability(
  shopId: string,
  id: string,
  isAvailable: boolean,
): Promise<VariationRow> {
  const existing = await getVariationById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Item not found");
  }

  const [variation] = await db
    .update(productVariations)
    .set({ isAvailable, updatedAt: new Date() })
    .where(eq(productVariations.id, id))
    .returning();

  return variation;
}

export async function setVariationStatus(
  shopId: string,
  id: string,
  status: "available" | "maintenance" | "retired",
): Promise<VariationRow> {
  const existing = await getVariationById(shopId, id);
  if (!existing) {
    throw AppError.notFound("Item not found");
  }

  const [variation] = await db
    .update(productVariations)
    .set({ status, updatedAt: new Date() })
    .where(eq(productVariations.id, id))
    .returning();

  return variation;
}

export type VariationSearchResult = {
  id: string;
  productId: string;
  productName: string;
  color: string | null;
  size: string | null;
  rentPrice: string;
  securityDeposit: string;
  quantity: number;
  sku: string;
  barcode: string;
  isAvailable: boolean;
  status: VariationRow["status"];
  outletId: string | null;
  outletName: string | null;
  outletCode: string | null;
  ownershipType: VariationRow["ownershipType"];
  ownerName: string | null;
  ownerPhone: string | null;
  ownerCustomerId: string | null;
  ownerSharePercentage: string;
};

const VARIATION_SEARCH_SELECT = {
  id: productVariations.id,
  productId: productVariations.productId,
  productName: products.name,
  color: productVariations.color,
  size: productVariations.size,
  rentPrice: productVariations.rentPrice,
  securityDeposit: productVariations.securityDeposit,
  quantity: productVariations.quantity,
  sku: productVariations.sku,
  barcode: productVariations.barcode,
  isAvailable: productVariations.isAvailable,
  status: productVariations.status,
  outletId: productVariations.outletId,
  outletName: outlets.name,
  outletCode: outlets.code,
  ownershipType: productVariations.ownershipType,
  ownerName: productVariations.ownerName,
  ownerPhone: productVariations.ownerPhone,
  ownerCustomerId: productVariations.ownerCustomerId,
  ownerSharePercentage: productVariations.ownerSharePercentage,
} as const;

/**
 * Finds one item by its exact barcode — the "scan at the counter" path
 * into booking creation. Tenant-scoped via the product's own `shopId`.
 */
export async function getVariationByBarcode(
  shopId: string,
  barcode: string,
): Promise<VariationSearchResult | null> {
  const [row] = await db
    .select(VARIATION_SEARCH_SELECT)
    .from(productVariations)
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(outlets, eq(productVariations.outletId, outlets.id))
    .where(
      and(eq(productVariations.barcode, barcode), eq(products.shopId, shopId)),
    )
    .limit(1);

  return row ?? null;
}

/** Same shape as `getVariationByBarcode`/`searchVariationsForBooking`, but
 * looked up by id — used when a booking's item was picked from a search
 * result rather than a barcode scan. */
export async function getVariationForBooking(
  shopId: string,
  id: string,
): Promise<VariationSearchResult | null> {
  const [row] = await db
    .select(VARIATION_SEARCH_SELECT)
    .from(productVariations)
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(outlets, eq(productVariations.outletId, outlets.id))
    .where(and(eq(productVariations.id, id), eq(products.shopId, shopId)))
    .limit(1);

  return row ?? null;
}

/**
 * Cross-product item search (by SKU, barcode or product name) for the
 * booking form's item picker — deliberately small and unpaginated, this is
 * a picker not a browse list. Availability itself (date-range overlap) is
 * decided separately by `checkAvailability()`; this only excludes items
 * that can never be rebooked (`retired`) or are withdrawn.
 */
export async function searchVariationsForBooking(
  shopId: string,
  query: string,
): Promise<VariationSearchResult[]> {
  const pattern = `%${query}%`;

  return db
    .select(VARIATION_SEARCH_SELECT)
    .from(productVariations)
    .innerJoin(products, eq(productVariations.productId, products.id))
    .leftJoin(outlets, eq(productVariations.outletId, outlets.id))
    .where(
      and(
        eq(products.shopId, shopId),
        eq(productVariations.isAvailable, true),
        or(
          ilike(productVariations.sku, pattern),
          ilike(productVariations.barcode, pattern),
          ilike(products.name, pattern),
        ),
      ),
    )
    .orderBy(desc(productVariations.createdAt))
    .limit(10);
}
