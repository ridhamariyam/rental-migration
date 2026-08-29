import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { sniffImageType } from "@/lib/uploads/sniff-image-type";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Sniffed MIME types this endpoint accepts — checked before the file ever
 * reaches Cloudinary, not relied on as the only guard (Cloudinary itself
 * also rejects non-image uploads). */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const UPLOAD_FOLDER = "rental-migration/products";

/**
 * A single product/variation image upload, kept as its own step separate
 * from creating or editing the catalogue record itself (see
 * `createProductSchema`'s doc comment) — the record only ever stores the
 * resulting Cloudinary URL this returns.
 *
 * Uploaded straight to Cloudinary (see `src/lib/cloudinary.ts`), not local
 * disk — this app may run on ephemeral/serverless compute where a local
 * `public/uploads` write wouldn't reliably survive past the current
 * request, let alone a redeploy.
 */
export async function POST(request: Request) {
  try {
    await requireTenantUser(Permission.PRODUCT_MANAGE);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError("No file was uploaded", 400);
    }

    if (file.size === 0) {
      throw new AppError("The uploaded file is empty", 400);
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new AppError("Images must be 5 MB or smaller", 400);
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw new AppError("Only JPEG, PNG, or WebP images are allowed", 400, [
        {
          field: "file",
          message: "Only JPEG, PNG, or WebP images are allowed",
        },
      ]);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Defense-in-depth: `file.type` above is just a client-supplied label
    // read off the request — cross-check the bytes actually match one of
    // the three formats we claim to accept before this ever reaches
    // Cloudinary.
    if (!sniffImageType(buffer)) {
      throw new AppError("The uploaded file is not a valid image", 400, [
        { field: "file", message: "The uploaded file is not a valid image" },
      ]);
    }

    const url = await uploadImageToCloudinary(buffer, UPLOAD_FOLDER);

    return apiSuccess({ url }, "Uploaded", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
