import "server-only";

import { randomUUID } from "node:crypto";

import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

/**
 * Uploaded files live in a Railway bucket (S3-compatible object storage in
 * the same project/region as the app), never on local disk: this app runs
 * on ephemeral compute where a `public/uploads` write wouldn't survive a
 * redeploy, let alone reliably outlive the request that made it.
 *
 * Railway buckets are **private** — there is no public-read ACL and
 * `PutBucketPolicy` returns `NotImplemented` — so nothing here ever hands
 * out a bucket URL. Uploads return an app-relative `/api/files/<key>` path
 * and `GET /api/files/[...key]` streams the object back through the app
 * (see that route). That indirection is what lets the app decide who may
 * read a given file, which a public Cloudinary URL never could.
 */
const client = new S3Client({
  region: env.STORAGE_REGION,
  endpoint: env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
});

/** The folders a key may live under. The serving route decides access per
 * folder, so a key outside this set is not something it knows how to make
 * an access decision about — it is rejected rather than served. */
export const STORAGE_FOLDERS = [
  "products",
  "avatars",
  "booking-documents",
] as const;

export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Stores one already-validated file and returns the app-relative URL that
 * gets persisted on the record (`products.image`, `users.avatarUrl`,
 * `bookings.documents[].url`, …).
 *
 * The key is a server-generated UUID plus an extension derived from the
 * *sniffed* content type — never from the client's filename, so there is
 * nothing here that a caller could steer into another folder or overwrite
 * an existing object with.
 *
 * Callers (the `/api/uploads/*` routes) have already checked size and
 * sniffed the real type from the file's magic bytes; `contentType` must be
 * that sniffed value, since it is what the serving route later hands the
 * browser.
 */
export async function uploadToStorage(
  buffer: Buffer,
  folder: StorageFolder,
  contentType: string,
): Promise<string> {
  const extension = EXTENSION_BY_TYPE[contentType] ?? "bin";
  const key = `${folder}/${randomUUID()}.${extension}`;

  await client.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Objects are immutable — a new upload always gets a fresh UUID key,
      // so the serving route can cache hard and never worry about staleness.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return `/api/files/${key}`;
}

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
};

/**
 * Fetches one object for `GET /api/files/[...key]` to stream back, or
 * `null` when it does not exist — a missing file is a 404 the caller
 * renders, not a 500. The body is handed over as a web stream so the route
 * never buffers a whole 10 MB document in memory just to forward it.
 */
export async function getStorageObject(
  key: string,
): Promise<StoredObject | null> {
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }),
    );

    if (!result.Body) {
      return null;
    }

    return {
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType ?? "application/octet-stream",
      contentLength: result.ContentLength,
    };
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return null;
    }

    // Some S3-compatible backends answer a missing key with a bare 404
    // rather than a typed `NoSuchKey`, which would otherwise surface as a
    // 500 for what is really "this file isn't there".
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) {
      return null;
    }

    throw error;
  }
}
