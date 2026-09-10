import { requireTenantUser } from "@/server/auth/guard";
import { apiError } from "@/lib/errors/api-response";
import { AppError } from "@/lib/errors/app-error";
import {
  STORAGE_FOLDERS,
  getStorageObject,
  type StorageFolder,
} from "@/lib/storage";

/** Folders whose contents are only ever served to a signed-in tenant user.
 * A booking document is an ID proof or a signed agreement — the one class
 * of upload here that is genuinely about a customer rather than about the
 * catalogue, so it is not readable by anyone who merely has the link.
 *
 * Item photos, avatars and shop logos stay open: they are rendered in
 * plain `<img>` tags all over the app (including places that load before a
 * session is resolved), and gating them would break those for no real
 * gain — same posture the public Cloudinary URLs they replace already had. */
const AUTHENTICATED_FOLDERS = new Set<StorageFolder>(["booking-documents"]);

const ALLOWED_FOLDERS = new Set<string>(STORAGE_FOLDERS);

/** Shop ids are uuids; anything else in that position is not an owner
 * segment (a legacy key, or something a caller made up). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams one uploaded file back out of the Railway bucket (see
 * `src/lib/storage.ts`). Railway buckets are private with no public-read
 * option, so this route *is* how an uploaded file is ever read — every
 * URL written by `POST /api/uploads/*` points here.
 *
 * The key comes off the URL, so it is treated as untrusted: only the
 * known folders are served, and any key trying to climb out of one (`..`,
 * an absolute path, an empty segment) is rejected before it reaches the
 * bucket.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const { key: segments } = await params;

    if (
      segments.length < 2 ||
      segments.some((segment) => segment.length === 0 || segment === "..")
    ) {
      throw new AppError("File not found", 404);
    }

    const [folder] = segments;
    if (!ALLOWED_FOLDERS.has(folder)) {
      throw new AppError("File not found", 404);
    }

    if (AUTHENTICATED_FOLDERS.has(folder as StorageFolder)) {
      const user = await requireTenantUser();

      // Private uploads carry their owning shop in the key itself
      // (`booking-documents/<shopId>/<uuid>.pdf`, see `uploadToStorage`).
      // Being signed in *somewhere* used to be enough, so any tenant's
      // user could stream any other tenant's customer ID proofs given the
      // URL — the uuid was the only thing standing in the way (RQ-13).
      //
      // Keys written before ownership was recorded have no shop segment.
      // They are refused rather than served: there is no way to tell whose
      // they are, and failing closed on a customer's ID document is the
      // only safe default.
      const ownerShopId = segments[1];
      if (!UUID_PATTERN.test(ownerShopId) || ownerShopId !== user.shopId) {
        throw new AppError("File not found", 404);
      }
    }

    const key = segments.join("/");
    const object = await getStorageObject(key);

    if (!object) {
      throw new AppError("File not found", 404);
    }

    const headers = new Headers({
      "Content-Type": object.contentType,
      // Keys are UUIDs and objects are never rewritten in place, so a
      // stored file can be cached indefinitely. Private folders are marked
      // `private` so only the requesting browser — not a shared proxy —
      // holds on to a customer's document.
      "Cache-Control": AUTHENTICATED_FOLDERS.has(folder as StorageFolder)
        ? "private, max-age=31536000, immutable"
        : "public, max-age=31536000, immutable",
      // These are user-uploaded bytes: render them as their own content or
      // download them, never as active content in this origin.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    });

    if (object.contentLength !== undefined) {
      headers.set("Content-Length", String(object.contentLength));
    }

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    return apiError(error);
  }
}

export const dynamic = "force-dynamic";
