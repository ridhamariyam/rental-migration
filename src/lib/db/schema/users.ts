import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userRoleEnum } from "@/lib/db/schema/enums";
import { outlets } from "@/lib/db/schema/outlets";
import { shops } from "@/lib/db/schema/shops";

/**
 * Staff, owners and customers, mirroring the legacy backend's `User` model.
 * `shopId` is null only for the platform super admin — never read tenant
 * scope from anything other than this row (see plan.md § Target Architecture
 * / Tenant isolation once Phase 3+ introduces tenant-scoped data).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id").references(() => shops.id, {
      onDelete: "cascade",
    }),
    //: The outlet a manager/staff account is assigned to (Phase 8). Null for
    //: the platform super admin, a tenant admin (owner — not outlet-scoped),
    //: and a customer record. Losing the outlet (should one ever be deleted
    //: outright rather than deactivated) unassigns the user rather than
    //: taking their account down with it.
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    role: userRoleEnum("role").notNull().default("customer"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    //: Self-service profile photo (Profile page) — uploaded to Cloudinary,
    //: never local disk (see `src/lib/cloudinary.ts`). Null means "no photo
    //: uploaded yet", in which case every avatar render falls back to the
    //: deterministic gradient/initials or staff placeholder image (see
    //: `src/lib/tenant-avatar.ts`'s `resolveAvatarSrc`).
    avatarUrl: text("avatar_url"),
    //: True immediately after a tenant admin/staff account is provisioned
    //: with a temporary password — the app must force a reset before
    //: allowing any other access. See Phase 5/7 in plan.md.
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Email only needs to be unique per shop (a super admin has no shop, so
    // NULLs are naturally distinct in Postgres and never collide there).
    uniqueIndex("uq_users_shop_email").on(table.shopId, table.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
