import "server-only";

import { env } from "@/lib/env";
import { constantTimeEquals } from "@/lib/crypto/constant-time-equals";

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
