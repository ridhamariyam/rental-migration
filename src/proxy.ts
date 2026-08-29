import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/admin-session";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (same behavior, new file
 * name/export — see plan.md § Target Architecture / Authentication).
 *
 * This only checks for the *presence* of a session cookie so unauthenticated
 * requests get redirected before rendering — it deliberately does not touch
 * the database (proxy/middleware should stay fast and side-effect free).
 * The actual session lookup (validity, expiry, role, must-change-password)
 * happens in each protected layout via `getCurrentUser()`/
 * `isSuperAdminAuthenticated()`. Real authorization is never enforced here
 * alone.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminLoginRoute = pathname === "/admin/login";
  const isTenantRoute =
    pathname.startsWith("/dashboard") || pathname.startsWith("/reset-password");

  if (isAdminRoute && !isAdminLoginRoute) {
    const hasAdminSessionCookie = request.cookies.has(
      ADMIN_SESSION_COOKIE_NAME,
    );

    if (!hasAdminSessionCookie) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (isTenantRoute) {
    const hasTenantSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

    if (!hasTenantSessionCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/reset-password/:path*"],
};
