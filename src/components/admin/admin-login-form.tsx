"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginForm } from "@/components/auth/login-form";
import { adminLoginSchema } from "@/lib/validation/admin-auth";

/** Thin wrapper around the shared `LoginForm` — same fields/validation
 * shape as the tenant-facing `/login`, just posting to the admin route and
 * defaulting to the admin dashboard on success. */
export function AdminLoginForm() {
  return (
    <LoginForm
      resolver={zodResolver(adminLoginSchema)}
      apiPath="/api/admin/auth/login"
      defaultRedirectTo="/admin"
    />
  );
}
