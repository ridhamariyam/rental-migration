import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets (webhook tokens, worker
 * secrets, the super-admin credential check) — hashes both sides to a
 * fixed-length digest first so `timingSafeEqual` (which throws on
 * unequal-length buffers) never has to see the raw, variable-length
 * input, and so the comparison time never leaks the correct value's
 * length either. Extracted from `lib/auth/super-admin.ts` so every
 * shared-secret check in the app (not just the super admin's) uses the
 * same safe primitive instead of a plain `===`/`!==`, which leaks timing
 * information proportional to how many leading characters match.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
