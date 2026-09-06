import "server-only";

/**
 * Sniffs a buffer's real image type from its magic bytes — used as a
 * defense-in-depth check alongside the client-reported `file.type` on
 * every image upload route. A browser's `File.type` is just an
 * attacker-controllable label read off the request; trusting it alone
 * would let someone upload arbitrary (non-image) content mislabeled as
 * `image/png`, etc. Only the three types this app accepts are checked —
 * anything else (including a real image format we don't support) returns
 * `null` and the caller rejects the upload.
 */
export function sniffImageType(
  buffer: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Same magic-byte check as `sniffImageType`, widened to the file types a
 * *booking document* may be: the three image formats plus PDF (an ID
 * proof or a signed agreement is usually scanned as one). Returns `null`
 * for anything else, and the caller rejects the upload — a client's
 * `File.type` is an attacker-controllable label, never proof of content.
 */
export function sniffDocumentType(
  buffer: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  const imageType = sniffImageType(buffer);
  if (imageType) {
    return imageType;
  }

  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return "application/pdf";
  }

  return null;
}
