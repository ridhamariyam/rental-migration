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
  // Uploads (item photos, avatars/logos, booking documents) go to a Railway
  // bucket — S3-compatible object storage in the same project — never local
  // disk: this app runs on ephemeral compute where a local `public/uploads`
  // write wouldn't survive a redeploy or even the next request. See
  // `src/lib/storage.ts`.
  STORAGE_ENDPOINT: z
    .string()
    .url("STORAGE_ENDPOINT must be a valid URL")
    .default("https://t3.storageapi.dev"),
  STORAGE_BUCKET: z.string().min(1, "STORAGE_BUCKET is required"),
  STORAGE_ACCESS_KEY_ID: z.string().min(1, "STORAGE_ACCESS_KEY_ID is required"),
  STORAGE_SECRET_ACCESS_KEY: z
    .string()
    .min(1, "STORAGE_SECRET_ACCESS_KEY is required"),
  // Railway buckets are region-scoped by the bucket itself, so the S3
  // client only needs a placeholder here — `auto` is what Railway's own
  // credentials output reports.
  STORAGE_REGION: z.string().min(1).default("auto"),
  MSG91_AUTHKEY: z.string().default(""),
  MSG91_WHATSAPP_BASE_URL: z
    .string()
    .url("MSG91_WHATSAPP_BASE_URL must be a valid URL")
    .default("https://api.msg91.com/api/v5/whatsapp"),
  // Shared secret the cron/worker must present (as `x-worker-secret`) to
  // trigger `/api/internal/notifications/dispatch`. Previously defaulted
  // to `""`, which meant an operator who never set this could be bypassed
  // by an attacker who simply sent an empty header value — required with
  // a real minimum length now, same floor as `SESSION_SECRET`. Generate
  // with: openssl rand -hex 32
  NOTIFICATION_WORKER_SECRET: z
    .string()
    .min(32, "NOTIFICATION_WORKER_SECRET must be at least 32 characters"),
  // Shared secret MSG91 must include as a `?token=` query param on its
  // webhook callback URL (`/api/webhooks/msg91/whatsapp?token=...`) —
  // MSG91 doesn't sign its webhook payloads, so without this anyone on the
  // internet could POST a forged delivery-status update for any
  // notification whose `crqid`/message id they happened to observe.
  // Generate with: openssl rand -hex 32
  MSG91_WEBHOOK_SECRET: z
    .string()
    .min(32, "MSG91_WEBHOOK_SECRET must be at least 32 characters"),
  WHATSAPP_DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,4}$/, "WHATSAPP_DEFAULT_COUNTRY_CODE must be numeric")
    .default("91"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid environment variables — see log above.");
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
