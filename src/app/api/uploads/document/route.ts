import { requireTenantUser } from "@/server/auth/guard";
import { Permission } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/errors/api-response";
import { uploadDocumentToCloudinary } from "@/lib/cloudinary";
import { sniffDocumentType } from "@/lib/uploads/sniff-image-type";

/** Documents run larger than a cover photo (a scanned, multi-page rental
 * agreement) — 10 MB, still small enough that one bad request can't tie up
 * the route for long. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const UPLOAD_FOLDER = "rental-migration/booking-documents";

/**
 * One booking document (ID proof, signed agreement, handover photo)
 * uploaded ahead of the booking itself, exactly like an item photo is:
 * the booking record only ever stores the URL this returns (see
 * `bookingDocumentSchema`), so a failed upload never leaves a half-created
 * booking and a failed booking never strands a half-attached file.
 *
 * Gated on `BOOKING_CREATE` rather than a blanket "signed in" check —
 * unlike an avatar, a document here is only ever attached to a booking,
 * and the roles that can't create one have no use for the endpoint.
 */
export async function POST(request: Request) {
  try {
    await requireTenantUser(Permission.BOOKING_CREATE);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError("No file was uploaded", 400);
    }

    if (file.size === 0) {
      throw new AppError("The uploaded file is empty", 400);
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new AppError("Documents must be 10 MB or smaller", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // The client's `file.type` is just a label on the request — the bytes
    // themselves decide whether this is one of the four formats accepted.
    if (!sniffDocumentType(buffer)) {
      throw new AppError("Only PDF, JPEG, PNG, or WebP files are allowed", 400, [
        {
          field: "file",
          message: "Only PDF, JPEG, PNG, or WebP files are allowed",
        },
      ]);
    }

    // A file can pass the magic-byte check and still be rejected upstream
    // (a truncated or corrupt PDF, say) — that is the uploader's problem to
    // fix by picking a different file, so it surfaces as a clean error
    // rather than an unexplained 500.
    let url: string;
    try {
      url = await uploadDocumentToCloudinary(buffer, UPLOAD_FOLDER);
    } catch {
      throw new AppError(
        "That file could not be uploaded — try a different one",
        502,
        [
          {
            field: "file",
            message: "That file could not be uploaded",
          },
        ],
      );
    }

    return apiSuccess({ url }, "Uploaded", 201);
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
