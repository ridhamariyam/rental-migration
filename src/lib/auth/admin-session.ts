import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env, isProduction } from "@/lib/env";
import { AppError } from "@/lib/errors/app-error";

/**
 * The platform super admin is not a database row (see `super-admin.ts`), so
 * there is nothing to revoke by deleting a session row the way the DB-backed
 * `session.ts` module works for real tenant users (Phase 6+). Instead this
 * is a stateless, HMAC-signed cookie: `<payload>.<signature>`, where payload
 * is `<issuedAtMs>.<expiresAtMs>` and signature is an HMAC-SHA256 over the
 * payload keyed by `SESSION_SECRET`. Tampering with either timestamp
 * invalidates the signature; there is no other claim to forge.
 */
export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 hours

function sign(payload: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest("hex");
}

function buildToken(issuedAt: number, expiresAt: number): string {
  const payload = `${issuedAt}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): { expiresAt: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [issuedAtRaw, expiresAtRaw, signature] = parts;
  const payload = `${issuedAtRaw}.${expiresAtRaw}`;
  const expectedSignature = sign(payload);

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt)) {
    return null;
  }

  return { expiresAt };
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

export async function createAdminSession(): Promise<void> {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ADMIN_SESSION_DURATION_MS;
  const token = buildToken(issuedAt, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(
    ADMIN_SESSION_COOKIE_NAME,
    token,
    cookieOptions(new Date(expiresAt)),
  );
}

/** Whether the request carries a valid, unexpired super-admin session. */
export async function isSuperAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  const verified = verifyToken(token);
  return verified !== null && verified.expiresAt > Date.now();
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
}

/**
 * Route-handler guard: throws `AppError.unauthorized()` if the request
 * isn't a valid super-admin session. Every admin API route that reads or
 * writes tenant data must call this first — the `(dashboard)` layout only
 * guards pages, not route handlers, which are a separate request lifecycle.
 */
export async function requireSuperAdmin(): Promise<void> {
  if (!(await isSuperAdminAuthenticated())) {
    throw AppError.unauthorized("Sign-in required");
  }
}
