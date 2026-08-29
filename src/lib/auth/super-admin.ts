import "server-only";

import { timingSafeEqual, createHash } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Constant-time string comparison: hash both sides to a fixed-length
 * digest first so `timingSafeEqual` (which throws on unequal-length
 * buffers) never has to see the raw, variable-length input, and so the
 * comparison time never leaks the correct value's length either.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * There is exactly one super admin account for this MVP, defined by
 * environment variables rather than a database row (see plan.md § Phase 1).
 * Email comparison is case-insensitive (how email addresses are normally
 * treated); password comparison is exact and constant-time.
 */
export function verifySuperAdminCredentials(
  email: string,
  password: string,
): boolean {
  const emailMatches = constantTimeEquals(
    email.trim().toLowerCase(),
    env.SUPER_ADMIN_EMAIL.trim().toLowerCase(),
  );
  const passwordMatches = constantTimeEquals(
    password,
    env.SUPER_ADMIN_PASSWORD,
  );

  return emailMatches && passwordMatches;
}
