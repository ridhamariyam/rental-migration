/**
 * SKU/barcode generation — ported from the legacy backend's
 * `app/utils/helpers.py` (`generate_sku`/`generate_barcode`/`slugify_code`).
 * Pure functions; the actual uniqueness check (retry loop against the
 * database) lives in `src/server/variations/service.ts`, which is the only
 * caller that has a DB connection.
 */

const SKU_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomFrom(alphabet: string, length: number): string {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

/** "Anaya Bridal Lehenga" → "ANAYA" (first 6 alphanumeric characters,
 * uppercased) — the human-readable prefix on a generated SKU. */
export function slugifyCode(value: string, fallback = "ITEM"): string {
  const cleaned = (value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return cleaned || fallback;
}

export function generateSku(productName: string): string {
  const prefix = slugifyCode(productName, "ITM");
  return `${prefix}-${randomFrom(SKU_ALPHABET, 8)}`;
}

/** A 13-digit numeric code, never starting with 0 so it survives
 * round-tripping through anything that treats it as a number. */
export function generateBarcode(): string {
  const first = randomFrom("123456789", 1);
  const rest = randomFrom("0123456789", 12);
  return `${first}${rest}`;
}
