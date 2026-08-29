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

const queryClient =
  globalForDb.queryClient ??
  postgres(env.DATABASE_URL, {
    // Small pool: this is an MVP for 2-3 tenants, not a fleet of instances.
    max: env.NODE_ENV === "production" ? 10 : 1,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
