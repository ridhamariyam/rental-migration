/**
 * Applies `drizzle/` migrations to the database named by `.env.test`'s
 * `DATABASE_URL`. Run once before the first `pnpm test`, and again after
 * adding a migration:
 *
 *   pnpm test:db:setup
 *
 * Deliberately refuses to run against anything but a `_test` database —
 * the harness in `src/test/db.ts` truncates every table between suites,
 * so pointing this at a real database would be destructive.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set — run via `pnpm test:db:setup`.");
  process.exit(1);
}

if (!/_test(\?|$)/.test(url)) {
  console.error(
    `Refusing to migrate ${url} — the test database name must end in "_test".`,
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const client = postgres(url as string, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    console.log("Test database migrated.");
  } finally {
    await client.end();
  }
}

void main();
