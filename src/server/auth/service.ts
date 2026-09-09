import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessionsForUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";

export type LoginResult = {
  mustChangePassword: boolean;
};

/**
 * Tenant-facing login. Ported from the old backend's `AuthService.login`,
 * adapted to the new session module (a DB-backed cookie session instead of
 * a JWT pair) — the multi-candidate approach itself was correct and is kept
 * as-is: `users.email` is only unique *per shop* (`uq_users_shop_email`),
 * not globally, so more than one account across different businesses can
 * share an email address. Every row matching the email is tried until one
 * password verifies, rather than looking the user up by email alone.
 *
 * The failure message is the same generic "Invalid email or password"
 * regardless of *why* — wrong email, wrong password for every candidate —
 * never confirming whether an email exists on the platform.
 */
export async function loginTenantUser(
  email: string,
  password: string,
): Promise<LoginResult> {
  const candidates = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      shopIsActive: shops.isActive,
    })
    .from(users)
    .innerJoin(shops, eq(users.shopId, shops.id))
    // Case-insensitive: matches regardless of the casing stored on the row
    // or typed at the login form (emails aren't case-sensitive in practice).
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()));

  let matched: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (await verifyPassword(password, candidate.passwordHash)) {
      matched = candidate;
      break;
    }
  }

  if (!matched) {
    throw AppError.unauthorized("Invalid email or password");
  }

  if (!matched.isActive) {
    throw AppError.forbidden("This account has been deactivated");
  }

  if (!matched.shopIsActive) {
    throw AppError.forbidden("This business has been deactivated");
  }

  await createSession(matched.id);

  return { mustChangePassword: matched.mustChangePassword };
}

/**
 * Forced first-login password reset (Phase 7). Callers must already have
 * checked the caller *is* the flagged user (via their session, in the
 * route handler) — this function trusts `userId` completely, it's not a
 * public "reset any account" endpoint's implementation.
 *
 * Hashes the new password with the same `bcryptjs` path as account
 * creation, clears `mustChangePassword`, then invalidates *every* existing
 * session for this user — including the one making this request — and
 * issues a fresh one. Without that, a second stale session (another tab,
 * another device that captured the temporary-password session before the
 * reset) would keep working and would never itself be re-checked against
 * the now-cleared flag.
 *
 * Rejects a new password identical to the one being replaced (the
 * system-generated temporary password, here) — otherwise someone could
 * satisfy the "you must change your password" gate without actually
 * changing anything, defeating the point of forcing a reset at all.
 */
export async function changePassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const [existing] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!existing) {
    throw AppError.notFound("Account not found");
  }

  if (await verifyPassword(newPassword, existing.passwordHash)) {
    throw new AppError(
      "New password must be different from your current password",
      400,
      [
        {
          field: "newPassword",
          message:
            "New password must be different from your current password",
        },
      ],
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await destroyAllSessionsForUser(userId);
  await createSession(userId);
}
