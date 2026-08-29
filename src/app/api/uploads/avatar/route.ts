import { requireTenantUser } from "@/server/auth/guard";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { uploadImageToCloudinary } from "@/lib/cloudinary";
import { sniffImageType } from "@/lib/uploads/sniff-image-type";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const UPLOAD_FOLDER = "rental-migration/avatars";

/**
 * A single avatar/logo image upload — used by both the Profile page's own
 * photo and the Business Settings page's shop logo. Deliberately requires
 * only "is a signed-in tenant user" (no specific `Permission`), same
 * reasoning as `POST /api/uploads`: uploading a file and getting back a
 * Cloudinary URL isn't itself the sensitive action — persisting that URL
 * onto a `users`/`shops` row is, and `PATCH /api/profile` / `PATCH
 * /api/business` each enforce their own real permission check for that.
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
