/**
 * Dev-only: fills in a cover photo for every Rentbee ("c5a33db7-...") demo
 * product that doesn't have one yet, uploaded to this project's own
 * Cloudinary account, then updates `products.image` with the result.
 *
 * Image source: Lorem Picsum (`https://picsum.photos`) — real photography,
 * freely licensed for both personal and commercial use with no permission
 * or attribution required (see https://picsum.photos/ — "Lorem Ipsum for
 * photos"), fetched deterministically by a per-product seed so re-running
 * this script is idempotent (same product always gets the same photo).
 * Deliberately NOT scraped from a general web/image search — this
 * project doesn't redistribute arbitrary images pulled off the internet
 * without a clear license to do so.
 *
 * Usage: pnpm exec tsx scripts/seed-rentbee-product-images.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, or } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";
import { products } from "../src/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set — check .env.local");

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
if (!cloudName || !apiKey || !apiSecret) {
  throw new Error("CLOUDINARY_* env vars are not set — check .env.local");
}

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const SHOP_ID = "c5a33db7-0edd-470d-aedd-26dfcca3db82";
const UPLOAD_FOLDER = "rental-migration/products";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function uploadBufferToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: "image" }, (error, result) => {
      if (error || !result) {
        reject(error ?? new Error("Cloudinary upload returned no result"));
        return;
      }
      resolve(result.secure_url);
    });
    stream.end(buffer);
  });
}

async function main() {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.shopId, SHOP_ID), or(isNull(products.image), eq(products.image, ""))));

  console.log(`${rows.length} product(s) need a cover image.`);

  let done = 0;
  for (const product of rows) {
    const seed = slugify(product.name);
    const photoUrl = `https://picsum.photos/seed/${seed}/900/700`;

    const response = await fetch(photoUrl);
    if (!response.ok) {
      console.warn(`  ! Skipped "${product.name}" — Picsum returned ${response.status}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    const secureUrl = await uploadBufferToCloudinary(buffer, UPLOAD_FOLDER);

    await db.update(products).set({ image: secureUrl, updatedAt: new Date() }).where(eq(products.id, product.id));

    done += 1;
    console.log(`  ✓ ${product.name} -> ${secureUrl}`);
  }

  console.log(`Done. Updated ${done}/${rows.length} product image(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
