/**
 * Shrinks a picked photo in the browser before it is uploaded.
 *
 * A phone camera hands over a 3-12 MB original — slow to push over a
 * mobile connection, and anything past the 5 MB route limit used to be
 * rejected only *after* the whole upload finished. Nothing in this app
 * renders an item photo, avatar or logo anywhere near camera resolution,
 * so scaling to `maxDimension` on the longest edge and re-encoding turns
 * that into a few hundred KB with no visible loss.
 *
 * Anything that isn't an image (a PDF), or that this browser can't decode
 * (a HEIC outside Safari), is returned untouched and left to the server's
 * own checks — this is a speed-up, never a gate.
 */

/** Longest edge, in pixels, a photo is scaled down to by default. */
const DEFAULT_MAX_DIMENSION = 1600;

const QUALITY = 0.82;

/** An accepted file this small is already cheap to send; re-encoding it
 * would only cost quality. */
const SKIP_BELOW_BYTES = 400 * 1024;

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function compressImage(
  file: File,
  { maxDimension = DEFAULT_MAX_DIMENSION }: { maxDimension?: number } = {},
): Promise<File> {
  if (file.type && !file.type.startsWith("image/")) {
    return file;
  }

  if (file.size <= SKIP_BELOW_BYTES && ACCEPTED_TYPES.has(file.type)) {
    return file;
  }

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decodeImage(file);
  } catch {
    return file;
  }

  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height =
    "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxDimension / Math.max(width, height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  // A PNG/WebP may carry transparency (a shop logo), so it is re-encoded
  // as WebP, which keeps it. Everything else becomes a JPEG, which has no
  // alpha channel — fill white first so a transparent pixel doesn't turn
  // black.
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  if (!keepAlpha) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) {
    source.close();
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, keepAlpha ? "image/webp" : "image/jpeg", QUALITY),
  );

  // Safari can't encode WebP and quietly hands back a PNG instead, which
  // can come out larger than what was picked — keep whichever is smaller.
  if (!blob || (blob.size >= file.size && ACCEPTED_TYPES.has(file.type))) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]*$/, "") || "photo";
  const extension = EXTENSION_BY_TYPE[blob.type] ?? "jpg";

  return new File([blob], `${baseName}.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

async function decodeImage(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` applies the EXIF rotation, so a portrait phone photo
      // isn't stored sideways.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img>, which decodes more formats on some
      // browsers (HEIC on Safari).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
