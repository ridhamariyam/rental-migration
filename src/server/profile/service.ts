import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyAllSessionsForUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import type {
  ChangeOwnPasswordInput,
  UpdateProfileInput,
} from "@/lib/validation/profile";

export type ProfileRow = typeof users.$inferSelect;

/**
 * The full row for the caller's own "Profile" page — `SessionUser` (see
 * `lib/auth/session.ts`) deliberately carries only what most of the app
 * needs on every request, and doesn't include `phone`; this is the one
 * place that needs it, so it's its own small query rather than widening
 * the session type everywhere.
 */
export async function getOwnProfile(userId: string): Promise<ProfileRow> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw AppError.notFound("Account not found");
  }

  return row;
}

/**
 * Self-service profile edit (any signed-in tenant role) — always scoped to
 * the caller's own row by `userId` from the session, never a client-
 * supplied id, so there's no way to edit anyone else's account through
 * this path. Deliberately narrow (name/phone/avatar only): see
 * `updateProfileSchema`'s doc comment for why email/role/scope are
 * excluded.
 */
export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileRow> {
  const [updated] = await db
    .update(users)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
      avatarUrl: input.avatarUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw AppError.notFound("Account not found");
  }

  return updated;
}

/**
 * Genuine self-service password change, distinct from the forced first-
 * login reset in `server/auth/service.ts`'s `changePassword` (which trusts
 * the session alone because the account is already known to be on a
 * system-generated temporary password). This one requires proving the
 * *current* password first — same reasoning `changePasswordSchema`'s doc
 * comment in `validation/auth.ts` gives for why that one has no such
 * field. On success, every other session for this account is invalidated
 * (same as the forced-reset path) so a stolen/still-open session elsewhere
 * doesn't silently keep working past a deliberate password change.
 */
export async function changeOwnPassword(
  userId: string,
  input: ChangeOwnPasswordInput,
): Promise<void> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    throw AppError.notFound("Account not found");
  }

  const isCurrentPasswordValid = await verifyPassword(
    input.currentPassword,
    row.passwordHash,
  );

  if (!isCurrentPasswordValid) {
    throw new AppError("Current password is incorrect", 400, [
      { field: "currentPassword", message: "Current password is incorrect" },
    ]);
  }

  // No-loophole rule: a "change" that lands on the exact same password
  // isn't a real change — reject it explicitly instead of silently
  // accepting a no-op that would give a false sense of "I rotated my
  // password" (e.g. after a suspected compromise).
  if (await verifyPassword(input.newPassword, row.passwordHash)) {
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

  const passwordHash = await hashPassword(input.newPassword);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await destroyAllSessionsForUser(userId);
  await createSession(userId);
}
