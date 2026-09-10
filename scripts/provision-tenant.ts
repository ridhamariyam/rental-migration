/**
 * Wipes every tenant record and provisions one fresh shop + owner login.
 *
 * DESTRUCTIVE. Run it only against a database you intend to empty, and
 * only after you have a backup you have actually restored from once.
 *
 * The platform super admin is deliberately NOT created here: it is not a
 * database row. `verifySuperAdminCredentials` compares against
 * `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from the environment
 * (see `src/lib/auth/super-admin.ts`), so it is set by changing those two
 * variables and redeploying — no SQL involved, and wiping the database
 * neither removes nor recreates it.
 *
 * Usage:
 *
 *   CONFIRM_WIPE=<database name> \
 *   DATABASE_URL=<url> \
 *   SHOP_NAME="Brides of Khair" \
 *   SHOP_EMAIL=... SHOP_PHONE=... \
 *   OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   pnpm exec tsx scripts/provision-tenant.ts
 *
 * `CONFIRM_WIPE` must exactly match the database name in `DATABASE_URL`.
 * That is the guard: pointing this at the wrong database fails loudly
 * instead of emptying it.
 */
import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import postgres from "postgres";

import { passwordPolicyIssues } from "../src/lib/auth/password-policy";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = required("DATABASE_URL");
const confirmWipe = process.env.CONFIRM_WIPE;

const shopName = process.env.SHOP_NAME ?? "Brides of Khair";
const shopEmail = process.env.SHOP_EMAIL ?? required("OWNER_EMAIL");
const shopPhone = process.env.SHOP_PHONE ?? "+910000000000";
const outletName = process.env.OUTLET_NAME ?? "Main";
const outletCode = process.env.OUTLET_CODE ?? "MAIN";

const ownerEmail = required("OWNER_EMAIL");
const ownerPassword = required("OWNER_PASSWORD");
const ownerFirstName = process.env.OWNER_FIRST_NAME ?? "Shop";
const ownerLastName = process.env.OWNER_LAST_NAME ?? "Owner";

function databaseNameFrom(url: string): string {
  const path = new URL(url).pathname;
  return path.replace(/^\//, "");
}

async function main(): Promise<void> {
  const databaseName = databaseNameFrom(databaseUrl);

  if (confirmWipe !== databaseName) {
    console.error(
      [
        "Refusing to run.",
        "",
        `  DATABASE_URL points at : ${databaseName}`,
        `  CONFIRM_WIPE is        : ${confirmWipe ?? "(unset)"}`,
        "",
        `Re-run with CONFIRM_WIPE="${databaseName}" once you are certain,`,
        "and only after taking a backup.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const policyIssues = passwordPolicyIssues(ownerPassword);
  if (policyIssues.length > 0) {
    console.error(
      `OWNER_PASSWORD does not meet the password policy:\n  - ${policyIssues.join("\n  - ")}`,
    );
    process.exit(1);
  }

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
    // Show what is about to be destroyed. A wipe that prints "0 rows" when
    // you expected thousands — or the reverse — is the last chance to stop.
    const counts = await client<{ table: string; rows: number }[]>`
      SELECT 'shops' AS table, count(*)::int AS rows FROM shops
      UNION ALL SELECT 'users', count(*)::int FROM users
      UNION ALL SELECT 'customers', count(*)::int FROM customers
      UNION ALL SELECT 'bookings', count(*)::int FROM bookings
      UNION ALL SELECT 'booking_items', count(*)::int FROM booking_items
      UNION ALL SELECT 'payments', count(*)::int FROM payments
      UNION ALL SELECT 'product_variations', count(*)::int FROM product_variations
      UNION ALL SELECT 'owner_settlements', count(*)::int FROM owner_settlements
      UNION ALL SELECT 'notification_logs', count(*)::int FROM notification_logs
      ORDER BY 1
    `;

    console.log(`\nAbout to wipe "${databaseName}". Current contents:\n`);
    for (const row of counts) {
      console.log(`  ${row.table.padEnd(20)} ${String(row.rows).padStart(7)}`);
    }
    console.log("");

    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    await client.begin(async (tx) => {
      // `shops` cascades to outlets, users, customers, bookings, items,
      // payments, settlements, notifications and audit logs, so one
      // truncate is enough — but sessions hang off users, and the
      // notification asset tables are shop-scoped, so name them all
      // explicitly rather than relying on the cascade graph staying the
      // same shape as the schema evolves.
      await tx`
        TRUNCATE TABLE
          notification_logs, notification_rules, whatsapp_templates, whatsapp_numbers,
          audit_logs, owner_settlements, salary_payslips, salaries,
          staff_leaves, attendance_corrections, attendances,
          maintenance_tasks, payments,
          booking_items, bookings, customers, product_variations, products,
          categories, sessions, users, outlets, shops
        RESTART IDENTITY CASCADE
      `;

      const shopId = randomUUID();
      await tx`
        INSERT INTO shops (id, name, email, phone, is_active)
        VALUES (${shopId}, ${shopName}, ${shopEmail}, ${shopPhone}, true)
      `;

      const outletId = randomUUID();
      await tx`
        INSERT INTO outlets (id, shop_id, name, code, is_active)
        VALUES (${outletId}, ${shopId}, ${outletName}, ${outletCode}, true)
      `;

      await tx`
        INSERT INTO users (
          shop_id, outlet_id, role, first_name, last_name,
          email, password_hash, must_change_password, is_active
        ) VALUES (
          ${shopId}, ${outletId}, 'admin', ${ownerFirstName}, ${ownerLastName},
          ${ownerEmail}, ${passwordHash}, false, true
        )
      `;
    });

    console.log("Done.\n");
    console.log(`  Shop          ${shopName}`);
    console.log(`  Outlet        ${outletName} (${outletCode})`);
    console.log(`  Owner login   ${ownerEmail}`);
    console.log("  Owner role    admin (tenant owner, full access to this shop)");
    console.log("");
    console.log("The platform super admin is NOT in the database. Set it on the");
    console.log("app service and redeploy:");
    console.log("");
    console.log("  SUPER_ADMIN_EMAIL=<email>");
    console.log("  SUPER_ADMIN_PASSWORD=<password, at least 8 characters>");
    console.log("");
  } finally {
    await client.end();
  }
}

void main();
