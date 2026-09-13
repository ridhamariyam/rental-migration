import { ApiClientError } from "@/lib/api-client";

/** Far longer than a compressed photo needs even on a weak mobile link, and
 * longer than the server's own bucket timeouts plus retries (see
 * `src/lib/storage.ts`), so a slow upload gets the server's error rather
 * than this one. Past it the request is abandoned with a message instead of
 * leaving the spinner running indefinitely. */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Posts one file to an `/api/uploads/*` route and returns the stored
 * `/api/files/...` URL — shared by `ImageUploadField` and
 * `BookingDocumentsField`.
 *
 * A dropped connection (fetch rejects with a `TypeError`) is retried once:
 * on a flaky mobile network that usually succeeds, and the server gives
 * every upload a fresh key, so a retry can never overwrite anything. An
 * error the server actually answered with, or a timeout, is not retried.
 */
export async function uploadFile(
  endpoint: string,
  file: File,
): Promise<string> {
  try {
    return await postFile(endpoint, file);
  } catch (error) {
    if (error instanceof TypeError) {
      return await postFile(endpoint, file);
    }
    throw error;
  }
}

async function postFile(endpoint: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      success: boolean;
      message: string;
      data: { url: string } | null;
    } | null;

    if (!response.ok || !payload?.success || !payload.data) {
      throw new ApiClientError(
        payload?.message ?? "Upload failed. Please try again.",
        response.status,
      );
    }

    return payload.data.url;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiClientError(
        "The upload timed out. Check your connection and try again.",
        408,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
