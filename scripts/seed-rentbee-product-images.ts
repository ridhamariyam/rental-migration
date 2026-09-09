/**
 * Dev-only: fills in a cover photo for every Rentbee ("c5a33db7-...") demo
 * product that doesn't have one yet, uploaded to this project's own
 * Railway bucket, then updates `products.image` with the result.
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
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { products } from "../src/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set — check .env.local");

const bucket = process.env.STORAGE_BUCKET;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
if (!bucket || !accessKeyId || !secretAccessKey) {
  throw new Error("STORAGE_* env vars are not set — check .env.local");
}

const s3 = new S3Client({
  region: process.env.STORAGE_REGION || "auto",
  endpoint: process.env.STORAGE_ENDPOINT || "https://t3.storageapi.dev",
  credentials: { accessKeyId, secretAccessKey },
});

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const SHOP_ID = "c5a33db7-0edd-470d-aedd-26dfcca3db82";
const UPLOAD_FOLDER = "products";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Mirrors `uploadToStorage` in `src/lib/storage.ts` — kept separate because
 * this script runs outside Next.js and so can't import a `server-only`
 * module. Picsum always returns JPEG. */
async function uploadBufferToStorage(buffer: Buffer, folder: string): Promise<string> {
  const key = `${folder}/${randomUUID()}.jpg`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `/api/files/${key}`;
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

    const secureUrl = await uploadBufferToStorage(buffer, UPLOAD_FOLDER);

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
