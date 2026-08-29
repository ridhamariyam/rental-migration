import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "@/lib/db/schema/users";

/**
 * DB-backed sessions (not stateless JWTs). Only a hash of the session token
 * is stored — the raw token lives only in the httpOnly cookie — so a leaked
 * database row can never be replayed as a valid session. Blocking a tenant,
 * deactivating a user, or forcing a password reset can all revoke access
 * immediately by deleting rows here, which a stateless JWT cannot do without
 * a denylist. See plan.md § Target Architecture / Authentication.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
