import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { isProduction } from "@/lib/env";

export const SESSION_COOKIE_NAME = "session_token";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * DB-backed sessions, not stateless JWTs: the raw token only ever lives in
 * the httpOnly cookie, and only its SHA-256 hash is stored — so a database
 * leak alone can't be replayed as a valid session, and revoking access
 * (blocking a tenant, deactivating a user, forcing a password reset) is a
 * plain row delete instead of needing a token denylist.
 */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export async function createSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, cookieOptions(expiresAt));
}

export type SessionUser = {
  id: string;
  shopId: string | null;
  outletId: string | null;
  role: (typeof users.$inferSelect)["role"];
  firstName: string;
  lastName: string;
  email: string;
  mustChangePassword: boolean;
  isActive: boolean;
};

/**
 * Reads the session cookie and returns the signed-in user, or `null` if
 * there is no session, it has expired, or the account has been deactivated
 * since the session was created. Callers must still check `isActive` /
 * `mustChangePassword` themselves for anything beyond "is someone signed
 * in" — this function does not throw or redirect.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      id: users.id,
      shopId: users.shopId,
      outletId: users.outletId,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!row || row.expiresAt < new Date()) {
    return null;
  }

  return {
    id: row.id,
    shopId: row.shopId,
    outletId: row.outletId,
    role: row.role,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    mustChangePassword: row.mustChangePassword,
    isActive: row.isActive,
  };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(rawToken)));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Revokes every session belonging to a user — used to force logout on the
 * other side of a password reset or a block/deactivate action. */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Revokes every session for every user under a shop — this is what makes
 * blocking a tenant take effect immediately instead of on next natural
 * token expiry (see plan.md § Phase 4 security considerations). A no-op
 * today (no tenant users exist until Phase 6+), but wired up now so
 * blocking behaves correctly the moment they do.
 */
export async function destroySessionsForShop(shopId: string): Promise<void> {
  const shopUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.shopId, shopId));

  if (shopUsers.length === 0) {
    return;
  }

  await db.delete(sessions).where(
    inArray(
      sessions.userId,
      shopUsers.map((user) => user.id),
    ),
  );
}
