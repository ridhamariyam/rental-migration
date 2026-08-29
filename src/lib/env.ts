import "server-only";

import { z } from "zod";
import { SUPER_ADMIN_PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

/**
 * Validates process.env once at module load. Fail fast on boot rather than
 * hitting an undefined-env-var bug deep inside a request handler.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3003"),
  // Platform super admin credentials (Phase 1): intentionally sourced from
  // the environment, not a database row — there is exactly one super admin
  // account for this MVP. See rental-migration/plan.md § Phase 1.
  SUPER_ADMIN_EMAIL: z.email("SUPER_ADMIN_EMAIL must be a valid email"),
  SUPER_ADMIN_PASSWORD: z
    .string()
    .min(
      SUPER_ADMIN_PASSWORD_MIN_LENGTH,
      `SUPER_ADMIN_PASSWORD must be at least ${SUPER_ADMIN_PASSWORD_MIN_LENGTH} characters`,
    ),
  // Image uploads (Phase 9 — product/variation cover images) go straight to
  // Cloudinary, never local disk: this app may run on ephemeral/serverless
  // compute where a local `public/uploads` write wouldn't survive a
  // redeploy or even the next request. See `src/lib/cloudinary.ts`.
  CLOUDINARY_CLOUD_NAME: z.string().min(1, "CLOUDINARY_CLOUD_NAME is required"),
  CLOUDINARY_API_KEY: z.string().min(1, "CLOUDINARY_API_KEY is required"),
  CLOUDINARY_API_SECRET: z.string().min(1, "CLOUDINARY_API_SECRET is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables — see log above.");
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
