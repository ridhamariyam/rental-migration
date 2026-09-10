import "server-only";

import { AppError } from "@/lib/errors/app-error";
import { sniffImageType } from "@/lib/uploads/sniff-image-type";

/** Same ceiling as `POST /api/uploads/avatar`. A camera capture lands far
 * under this (a 720p JPEG is ~100-200 KB); the limit is here so a
 * hand-crafted request can't stream an arbitrarily large body at us. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ValidatedImage = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

/**
 * Reads one image field out of a multipart body and returns it only if it
 * really is an image, with the type read from its own magic bytes rather
 * than the `Content-Type` the client attached — that label is caller
 * controlled, so trusting it would let arbitrary bytes through under an
 * image's name (same reasoning as the `/api/uploads/*` routes).
 *
 * `field` names the form field so the error tells the caller which part of
 * their request was wrong.
 */
export async function readImageUpload(
  value: FormDataEntryValue | null,
  field: string,
): Promise<ValidatedImage> {
  if (!(value instanceof File) || value.size === 0) {
    throw new AppError("No photo was captured", 400, [
      { field, message: "No photo was captured" },
    ]);
  }

  if (value.size > MAX_IMAGE_BYTES) {
    throw new AppError("The photo is too large", 400, [
      { field, message: "Images must be 5 MB or smaller" },
    ]);
  }

  const buffer = Buffer.from(await value.arrayBuffer());
  const contentType = sniffImageType(buffer);

  if (!contentType) {
    throw new AppError("That file isn't a supported image", 400, [
      { field, message: "Only JPEG, PNG, or WebP images are allowed" },
    ]);
  }

  return { buffer, contentType };
}
