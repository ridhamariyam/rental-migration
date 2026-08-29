/**
 * Dev-only: seeds a handful of clearly-synthetic demo tenants so the admin
 * tenant list's search/filter/pagination can actually be exercised locally
 * (Add Tenant doesn't exist until Phase 4, so there's otherwise no way to
 * get real rows in here yet). Never run in production. Idempotent — reruns
 * skip any row that collides on name/email/phone (all unique).
 *
 * Usage: pnpm db:seed:tenants
 */
import { config } from "dotenv";

// This script runs standalone via `tsx`, outside the Next.js process, so
// `.env.local` isn't loaded automatically the way it is for `next dev` —
// same reason `drizzle.config.ts` loads it explicitly too.
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
// Deliberately NOT importing `@/lib/db/client` here: it (and `@/lib/env`)
// import the `server-only` package, whose real npm module unconditionally
// throws outside Next's bundler (Next aliases it away at build time; a bare
// `tsx` process has no such alias). A tiny standalone connection avoids
// that entirely — the schema import below is safe, schema files don't pull
// in `server-only`.
import { shops } from "../src/lib/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — check .env.local");
}

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const demoTenants: (typeof shops.$inferInsert)[] = [
  {
    name: "Anaya Bridal Studio",
    email: "contact@anayabridal.example",
    phone: "+91 90000 00001",
    address: "12 MG Road, Kochi, Kerala",
    isActive: true,
    createdAt: daysAgo(58),
  },
  {
    name: "Meherbaan Wedding Wear",
    email: "hello@meherbaan.example",
    phone: "+91 90000 00002",
    address: "45 Linking Road, Mumbai, Maharashtra",
    isActive: true,
    createdAt: daysAgo(52),
  },
  {
    name: "Sundari Silks & Sarees",
    email: "info@sundarisilks.example",
    phone: "+91 90000 00003",
    address: "8 T Nagar, Chennai, Tamil Nadu",
    isActive: true,
    createdAt: daysAgo(47),
  },
  {
    name: "Royal Nikah Collection",
    email: "support@royalnikah.example",
    phone: "+91 90000 00004",
    address: "3 Hazratganj, Lucknow, Uttar Pradesh",
    isActive: false,
    createdAt: daysAgo(44),
  },
  {
    name: "Chandni Chowk Bridal House",
    email: "book@chandnichowk.example",
    phone: "+91 90000 00005",
    address: "27 Chandni Chowk, Delhi",
    isActive: true,
    createdAt: daysAgo(40),
  },
  {
    name: "Panache Wedding Boutique",
    email: "team@panacheweddings.example",
    phone: "+91 90000 00006",
    address: "19 Camac Street, Kolkata, West Bengal",
    isActive: true,
    createdAt: daysAgo(36),
  },
  {
    name: "Zeeshan Sherwani House",
    email: "contact@zeeshansherwani.example",
    phone: "+91 90000 00007",
    address: "5 Charminar Road, Hyderabad, Telangana",
    isActive: false,
    createdAt: daysAgo(33),
  },
  {
    name: "Vivaha Bridal Emporium",
    email: "hello@vivahabridal.example",
    phone: "+91 90000 00008",
    address: "61 Brigade Road, Bengaluru, Karnataka",
    isActive: true,
    createdAt: daysAgo(29),
  },
  {
    name: "Rangoli Wedding Rentals",
    email: "info@rangoliweddings.example",
    phone: "+91 90000 00009",
    address: "14 SG Highway, Ahmedabad, Gujarat",
    isActive: true,
    createdAt: daysAgo(24),
  },
  {
    name: "Shaadi Studio Rajkot",
    email: "support@shaadistudio.example",
    phone: "+91 90000 00010",
    address: "9 Race Course Road, Rajkot, Gujarat",
    isActive: true,
    createdAt: daysAgo(20),
  },
  {
    name: "Ambar Bridal Attire",
    email: "team@ambarbridal.example",
    phone: "+91 90000 00011",
    address: "22 Malviya Nagar, Jaipur, Rajasthan",
    isActive: false,
    createdAt: daysAgo(17),
  },
  {
    name: "Kanjivaram Wedding House",
    email: "contact@kanjivaramwedding.example",
    phone: "+91 90000 00012",
    address: "3 Anna Salai, Chennai, Tamil Nadu",
    isActive: true,
    createdAt: daysAgo(13),
  },
  {
    name: "Nazakat Bridal Couture",
    email: "hello@nazakatcouture.example",
    phone: "+91 90000 00013",
    address: "16 Residency Road, Bengaluru, Karnataka",
    isActive: true,
    createdAt: daysAgo(9),
  },
  {
    name: "Suhaag Rentals & Rituals",
    email: "book@suhaagrentals.example",
    phone: "+91 90000 00014",
    address: "31 Park Street, Kolkata, West Bengal",
    isActive: true,
    createdAt: daysAgo(5),
  },
  {
    name: "Mehak Wedding Collection",
    email: "info@mehakweddings.example",
    phone: "+91 90000 00015",
    address: "7 Sector 17, Chandigarh",
    isActive: true,
    createdAt: daysAgo(2),
  },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  let inserted = 0;

  for (const tenant of demoTenants) {
    const result = await db
      .insert(shops)
      .values(tenant)
      .onConflictDoNothing()
      .returning({ id: shops.id });

    if (result.length > 0) {
      inserted += 1;
    }
  }

  console.log(
    `Seeded ${inserted} new demo tenant(s); ${demoTenants.length - inserted} already existed.`,
  );
  await client.end();
  process.exit(0);
}

main().catch(async (error: unknown) => {
  console.error("Failed to seed demo tenants:", error);
  await client.end();
  process.exit(1);
});
