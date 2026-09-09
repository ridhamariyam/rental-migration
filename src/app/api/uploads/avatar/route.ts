import { requireTenantUser } from "@/server/auth/guard";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { uploadToStorage } from "@/lib/storage";
import { sniffImageType } from "@/lib/uploads/sniff-image-type";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const UPLOAD_FOLDER = "avatars";

/**
 * A single avatar/logo image upload — used by both the Profile page's own
 * photo and the Business Settings page's shop logo. Deliberately requires
 * only "is a signed-in tenant user" (no specific `Permission`), same
 * reasoning as `POST /api/uploads`: uploading a file and getting back a
 * URL isn't itself the sensitive action — persisting that URL onto a
 * `users`/`shops` row is, and `PATCH /api/profile` / `PATCH /api/business`
 * each enforce their own real permission check for that.
 */
export async function POST(request: Request) {
  try {
    await requireTenantUser();

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
    // the three formats we claim to accept before any of this is stored.
    // The sniffed type, not the client's label, is what gets recorded as
    // the object's content type and served back later.
    const sniffedType = sniffImageType(buffer);
    if (!sniffedType) {
      throw new AppError("The uploaded file is not a valid image", 400, [
        { field: "file", message: "The uploaded file is not a valid image" },
      ]);
    }

    const url = await uploadToStorage(buffer, UPLOAD_FOLDER, sniffedType);

    return apiSuccess({ url }, "Uploaded", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
