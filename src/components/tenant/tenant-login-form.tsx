"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginForm } from "@/components/auth/login-form";
import { loginSchema } from "@/lib/validation/auth";

/** Thin wrapper around the shared `LoginForm` for the tenant-facing
 * `/login` — posts to the tenant login route and lands on `/dashboard`. */
export function TenantLoginForm() {
  return (
    <LoginForm
      resolver={zodResolver(loginSchema)}
      apiPath="/api/auth/login"
      defaultRedirectTo="/dashboard"
    />
  );
}
