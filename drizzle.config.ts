import { config } from "dotenv";
import type { Config } from "drizzle-kit";

/**
 * NOTE: this reads `process.env` directly (not `src/lib/env.ts`) because
 * drizzle-kit runs as a standalone CLI outside the Next.js process — it
 * never imports application code, so `.env.local` is loaded explicitly here.
 */
config({ path: ".env.local" });

export default {
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
