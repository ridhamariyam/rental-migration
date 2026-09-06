import "server-only";

import { v2 as cloudinary } from "cloudinary";
import { env } from "@/lib/env";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Uploads a single image buffer to Cloudinary and returns its public,
 * permanent `https://res.cloudinary.com/...` URL. Used for product/
 * variation cover images (Phase 9) — see `src/app/api/uploads/route.ts`,
 * the only caller, which has already validated the file's size and MIME
 * type before this ever runs.
 *
 * Cloudinary's own upload pipeline assigns the public id (we don't derive
 * one from the client's filename), so there's nothing here that trusts
 * client-supplied naming.
 */
export async function uploadImageToCloudinary(
  buffer: Buffer,
  folder: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve(result.secure_url);
      },
    );

    uploadStream.end(buffer);
  });
}

/**
 * Uploads one booking document — an image *or* a PDF — and returns its
 * public URL. Separate from `uploadImageToCloudinary` because of the
 * `resource_type`: `"image"` rejects a PDF outright, and `"auto"` lets
 * Cloudinary route a PDF to its `raw`/`image` pipeline as appropriate.
 * The caller (`POST /api/uploads/document`) has already checked the file's
 * size and sniffed its real type — nothing here trusts a client-supplied
 * filename or MIME label.
 */
export async function uploadDocumentToCloudinary(
  buffer: Buffer,
  folder: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve(result.secure_url);
      },
    );

    uploadStream.end(buffer);
  });
}
