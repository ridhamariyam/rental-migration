import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "@/lib/db/schema";

/**
 * A single pooled connection, cached across Next.js dev hot-reloads (each
 * reload re-evaluates this module; without the global cache it would open a
 * fresh pool every time and eventually exhaust Postgres' connection limit).
 */
const globalForDb = globalThis as unknown as {
  queryClient: postgres.Sql | undefined;
};

/**
 * Small pool: this is an MVP for 2-3 tenants, not a fleet of instances.
 * `test` gets a real pool rather than dev's single connection — the
 * concurrency suites open several transactions at once to prove the
 * booking row locks work, and `max: 1` would serialise them into a queue
 * that passes for the wrong reason.
 */
function poolSize(): number {
  switch (env.NODE_ENV) {
    case "production":
      return 10;
    case "test":
      return 10;
    default:
      return 1;
  }
}

/**
 * Every tenant is an Indian business, so "today", "this month" and every
 * report bucket mean the India calendar day. Pinning the session zone
 * makes `created_at::date` / `date_trunc` group by IST instead of the
 * server's UTC — otherwise a payment taken at 00:30 IST lands on the
 * previous day. Stored timestamps are absolute instants and unaffected;
 * the Node side is pinned the same way by `TZ` in package.json.
 */
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

const queryClient =
  globalForDb.queryClient ??
  postgres(env.DATABASE_URL, {
    max: poolSize(),
    connection: { TimeZone: BUSINESS_TIME_ZONE },
  });

if (env.NODE_ENV !== "production") {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
