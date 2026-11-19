/**
 * Builds the sales-demo tenant ("RentQue Demo Boutique", owner login
 * demo@rentque.online) from scratch: the shop, its owner, three outlets,
 * staff, catalogue, customers, six months of orders/payments, returns,
 * maintenance, owner settlements, attendance, leave and payroll — so every
 * dashboard, report and table has something believable to show a
 * prospective client.
 *
 * Purely additive and self-guarding: it creates a brand-new shop and only
 * ever inserts rows that belong to it. It refuses to run if a shop with
 * the demo email (or a user with the demo login) already exists, so it can
 * never touch an existing tenant. Everything happens in one transaction —
 * a failure leaves nothing behind.
 *
 * The rows go in with raw Drizzle inserts (not the `src/server/**` service
 * functions, which import "server-only" and refuse to load under tsx) and
 * backdated timestamps, which the real API deliberately rejects. Money and
 * id helpers are reused from `src/lib/*` so totals follow the app's own
 * formulas.
 *
 * Demo customer and staff phone numbers are fictitious, and the demo shop
 * has no WhatsApp number connected, so no notification is ever sent.
 *
 * Usage (against the database in .env.local, or DATABASE_URL):
 *   pnpm exec tsx scripts/seed-demo-showcase.ts
 *   DEMO_OWNER_EMAIL=… DEMO_SHOP_EMAIL=… DEMO_OWNER_PASSWORD=… \
 *     pnpm exec tsx scripts/seed-demo-showcase.ts   # override the defaults
 *
 * It also sets `isDemo` on the new shop, which clears that flag from any
 * other shop (only one demo shop exists at a time) — never point it at the
 * production database without meaning to.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import {
  attendances,
  bookingItems,
  bookings,
  categories,
  customers,
  maintenanceTasks,
  outlets,
  ownerSettlements,
  payments,
  products,
  productVariations,
  salaries,
  salaryPayslips,
  shops,
  staffLeaves,
  users,
} from "../src/lib/db/schema";
import { generateBookingNumberCandidate } from "../src/lib/booking-number";
import { generateBarcode, generateSku } from "../src/lib/barcode";
import {
  addMoney,
  compareMoney,
  multiplyMoneyByDays,
  subtractMoneyNonNegative,
} from "../src/lib/money";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — check .env.local");
}

const DEMO_SHOP_NAME = "RentQue Demo Boutique";
const DEMO_SHOP_EMAIL = process.env.DEMO_SHOP_EMAIL ?? "demo@rentque.online";
const DEMO_SHOP_PHONE = "+91 99999 00001";
// Must pass the login form: a valid email, and a password of at least
// PASSWORD_MIN_LENGTH (10) characters.
const DEMO_OWNER_EMAIL = (process.env.DEMO_OWNER_EMAIL ?? "demo@rentque.online").toLowerCase();
const DEMO_OWNER_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? "Demo@123@rentque";
const STAFF_PASSWORD = "Staff@123@demo";
const STAFF_EMAIL_DOMAIN = "demo.rentque.online";

const client = postgres(databaseUrl, { max: 1 });
const rootDb = drizzle(client);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function offsetDateIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function offsetTimestamp(days: number, hour = 11, minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  // Hours here are IST; store the matching UTC instant.
  d.setUTCHours(hour - 5, minute - 30, 0, 0);
  return d;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function money(n: number): string {
  return n.toFixed(2);
}

function gt(a: string, b: string): boolean {
  return compareMoney(a, b) > 0;
}

type Db = Parameters<Parameters<typeof rootDb.transaction>[0]>[0];

async function seed(db: Db) {
  // -------------------------------------------------------------------------
  // Guard: never touch an existing tenant.
  // -------------------------------------------------------------------------
  const existingShop = await db
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.email, DEMO_SHOP_EMAIL));
  const existingOwner = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_OWNER_EMAIL));
  if (existingShop.length > 0 || existingOwner.length > 0) {
    throw new Error(
      `A shop or user with ${DEMO_SHOP_EMAIL} already exists — refusing to seed. Nothing was changed.`,
    );
  }

  // Only one demo shop at a time (mirrors `setTenantDemo`).
  await db.update(shops).set({ isDemo: false }).where(eq(shops.isDemo, true));

  // -------------------------------------------------------------------------
  // Shop + owner
  // -------------------------------------------------------------------------
  const [shop] = await db
    .insert(shops)
    .values({
      name: DEMO_SHOP_NAME,
      email: DEMO_SHOP_EMAIL,
      phone: DEMO_SHOP_PHONE,
      address: "Fort Road, Kannur, Kerala 670001",
      // Flag it as the platform's demo shop (powers "Try the live demo" and
      // blocks account-level changes) with an active plan, so no renewal
      // banner or lock ever shows during a client walkthrough.
      isDemo: true,
      plan: "yearly",
      subscriptionEndsAt: offsetTimestamp(365, 10),
      createdAt: offsetTimestamp(-200, 10),
    })
    .returning();
  const SHOP_ID = shop.id;

  const [owner] = await db
    .insert(users)
    .values({
      shopId: SHOP_ID,
      role: "admin",
      firstName: "Demo",
      lastName: "Owner",
      email: DEMO_OWNER_EMAIL,
      phone: "+91 99999 00002",
      passwordHash: await bcrypt.hash(DEMO_OWNER_PASSWORD, 12),
      mustChangePassword: false,
      isActive: true,
      createdAt: offsetTimestamp(-200, 10),
    })
    .returning();
  console.log(`Shop ${SHOP_ID}, owner ${owner.id}`);

  // -------------------------------------------------------------------------
  // Outlets
  // -------------------------------------------------------------------------
  const [kannur, kochi, kozhikode] = await db
    .insert(outlets)
    .values([
      {
        shopId: SHOP_ID,
        name: "Kannur Flagship",
        code: "KNR",
        address: "Fort Road, Kannur, Kerala 670001",
        phone: "+91 99999 10001",
        latitude: 11.8745,
        longitude: 75.3704,
        allowedRadiusMetres: 150,
        isActive: true,
      },
      {
        shopId: SHOP_ID,
        name: "Kochi MG Road",
        code: "KCH",
        address: "MG Road, Ernakulam, Kochi, Kerala 682016",
        phone: "+91 99999 10002",
        latitude: 9.9716,
        longitude: 76.2856,
        allowedRadiusMetres: 150,
        isActive: true,
      },
      {
        shopId: SHOP_ID,
        name: "Kozhikode SM Street",
        code: "KZK",
        address: "SM Street, Kozhikode, Kerala 673001",
        phone: "+91 99999 10003",
        latitude: 11.2509,
        longitude: 75.7804,
        allowedRadiusMetres: 150,
        isActive: true,
      },
    ])
    .returning();
  const outletList = [kannur, kochi, kozhikode];
  console.log("Outlets: +3");

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------
  const staffHash = await bcrypt.hash(STAFF_PASSWORD, 12);
  const staffPlan = [
    { first: "Fathima", last: "Rasheed", role: "manager", outlet: kannur },
    { first: "Arjun", last: "Menon", role: "manager", outlet: kochi },
    { first: "Nikhil", last: "Varma", role: "manager", outlet: kozhikode },
    { first: "Sneha", last: "Pillai", role: "staff", outlet: kannur },
    { first: "Rahul", last: "Das", role: "staff", outlet: kannur },
    { first: "Vishnu", last: "Nair", role: "staff", outlet: kochi },
    { first: "Meera", last: "Joseph", role: "staff", outlet: kochi },
    { first: "Anagha", last: "Krishnan", role: "staff", outlet: kozhikode },
    { first: "Shabeer", last: "Ali", role: "staff", outlet: kozhikode },
  ] as const;
  const staffRows = await db
    .insert(users)
    .values(
      staffPlan.map((s, i) => ({
        shopId: SHOP_ID,
        outletId: s.outlet.id,
        role: s.role,
        firstName: s.first,
        lastName: s.last,
        email: `${s.first.toLowerCase()}.${s.last.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`,
        phone: `+91 99999 2${String(i + 1).padStart(4, "0")}`,
        passwordHash: staffHash,
        mustChangePassword: false,
        isActive: true,
        createdAt: offsetTimestamp(-190 + i, 10),
      })),
    )
    .returning();
  const payableStaff = staffRows.map((row) => ({
    id: row.id,
    outletId: row.outletId as string,
    role: row.role,
  }));
  const managerFor = (outletId: string) =>
    payableStaff.find((s) => s.outletId === outletId && s.role === "manager")!.id;
  const staffAt = (outletId: string) => payableStaff.filter((s) => s.outletId === outletId);
  console.log(`Staff: +${staffRows.length}`);

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------
  const categoryRows = await db
    .insert(categories)
    .values([
      { shopId: SHOP_ID, name: "Bridal Lehenga", description: "Bridal and reception lehengas" },
      { shopId: SHOP_ID, name: "Sherwani & Groom Wear", description: "Groom sherwanis, suits and jodhpuris" },
      { shopId: SHOP_ID, name: "Wedding Saree", description: "Silk and designer wedding sarees" },
      { shopId: SHOP_ID, name: "Gowns & Party Wear", description: "Reception gowns and party outfits" },
      { shopId: SHOP_ID, name: "Kids Ethnic Wear", description: "Ethnic outfits for children" },
      { shopId: SHOP_ID, name: "Jewellery & Accessories", description: "Bridal jewellery, turbans and accessories" },
    ])
    .returning();
  const [catLehenga, catSherwani, catSaree, catGown, catKids, catJewellery] = categoryRows;
  console.log(`Categories: +${categoryRows.length}`);

  // -------------------------------------------------------------------------
  // Products + items (one physical, barcoded row per outlet)
  // -------------------------------------------------------------------------
  type ItemPlan = {
    color: string;
    size: string;
    rent: number;
    deposit: number;
    buy: number;
    qty: number;
    outlet: number;
    owner?: { name: string; phone: string; share: number };
  };
  type ProductPlan = { name: string; categoryId: string; description: string; items: ItemPlan[] };

  const productPlans: ProductPlan[] = [
    {
      name: "Royal Maroon Bridal Lehenga",
      categoryId: catLehenga.id,
      description: "Heavy zari-work bridal lehenga with double dupatta",
      items: [
        { color: "Maroon", size: "S", rent: 4200, deposit: 3000, buy: 38000, qty: 2, outlet: 0 },
        { color: "Maroon", size: "M", rent: 4200, deposit: 3000, buy: 38000, qty: 3, outlet: 1 },
        { color: "Maroon", size: "L", rent: 4200, deposit: 3000, buy: 38000, qty: 2, outlet: 2 },
      ],
    },
    {
      name: "Golden Zari Reception Lehenga",
      categoryId: catLehenga.id,
      description: "Gold tissue lehenga, the reception favourite",
      items: [
        { color: "Gold", size: "M", rent: 4800, deposit: 3500, buy: 42000, qty: 2, outlet: 0 },
        {
          color: "Gold", size: "L", rent: 4800, deposit: 3500, buy: 0, qty: 1, outlet: 1,
          owner: { name: "Devika Menon", phone: "+91 99999 30001", share: 2500 },
        },
      ],
    },
    {
      name: "Pastel Pink Bridal Lehenga",
      categoryId: catLehenga.id,
      description: "Pastel pink lehenga with hand embroidery and sequins",
      items: [
        { color: "Pastel Pink", size: "S", rent: 3800, deposit: 2500, buy: 31000, qty: 2, outlet: 2 },
        { color: "Pastel Pink", size: "M", rent: 3800, deposit: 2500, buy: 31000, qty: 3, outlet: 0 },
        { color: "Pastel Pink", size: "L", rent: 3800, deposit: 2500, buy: 31000, qty: 2, outlet: 1 },
      ],
    },
    {
      name: "Emerald Velvet Lehenga",
      categoryId: catLehenga.id,
      description: "Deep emerald velvet with antique gold embroidery",
      items: [
        { color: "Emerald", size: "M", rent: 4500, deposit: 3200, buy: 36000, qty: 2, outlet: 1 },
        { color: "Emerald", size: "L", rent: 4500, deposit: 3200, buy: 36000, qty: 1, outlet: 2 },
      ],
    },
    {
      name: "Ivory Silk Sherwani",
      categoryId: catSherwani.id,
      description: "Ivory raw-silk sherwani with brooch and stole",
      items: [
        { color: "Ivory", size: "38", rent: 2400, deposit: 1500, buy: 16000, qty: 3, outlet: 0 },
        { color: "Ivory", size: "40", rent: 2400, deposit: 1500, buy: 16000, qty: 4, outlet: 1 },
        { color: "Ivory", size: "42", rent: 2400, deposit: 1500, buy: 16000, qty: 3, outlet: 2 },
      ],
    },
    {
      name: "Black Velvet Sherwani",
      categoryId: catSherwani.id,
      description: "Black velvet sherwani with zardozi work",
      items: [
        { color: "Black", size: "40", rent: 2600, deposit: 1800, buy: 18000, qty: 2, outlet: 2 },
        {
          color: "Black", size: "42", rent: 2600, deposit: 1800, buy: 0, qty: 1, outlet: 0,
          owner: { name: "Rajeev Kurup", phone: "+91 99999 30002", share: 1300 },
        },
      ],
    },
    {
      name: "Navy Jodhpuri Suit",
      categoryId: catSherwani.id,
      description: "Bandhgala jodhpuri suit for reception",
      items: [
        { color: "Navy", size: "40", rent: 2000, deposit: 1200, buy: 14000, qty: 3, outlet: 1 },
        { color: "Navy", size: "42", rent: 2000, deposit: 1200, buy: 14000, qty: 2, outlet: 2 },
      ],
    },
    {
      name: "Classic Three-Piece Suit",
      categoryId: catSherwani.id,
      description: "Tailored three-piece groom suit",
      items: [
        { color: "Charcoal", size: "40", rent: 1800, deposit: 1200, buy: 12000, qty: 4, outlet: 0 },
        { color: "Charcoal", size: "42", rent: 1800, deposit: 1200, buy: 12000, qty: 3, outlet: 1 },
      ],
    },
    {
      name: "Kanjivaram Silk Saree",
      categoryId: catSaree.id,
      description: "Pure Kanjivaram silk wedding saree with temple border",
      items: [
        { color: "Red", size: "Free Size", rent: 2200, deposit: 2000, buy: 22000, qty: 3, outlet: 0 },
        {
          color: "Green", size: "Free Size", rent: 2200, deposit: 2000, buy: 0, qty: 1, outlet: 1,
          owner: { name: "Lakshmi Warrier", phone: "+91 99999 30003", share: 1200 },
        },
        { color: "Blue", size: "Free Size", rent: 2200, deposit: 2000, buy: 22000, qty: 2, outlet: 2 },
      ],
    },
    {
      name: "Kerala Kasavu Bridal Saree",
      categoryId: catSaree.id,
      description: "Traditional off-white kasavu saree with gold border",
      items: [
        { color: "Off-white Gold", size: "Free Size", rent: 1500, deposit: 1200, buy: 9500, qty: 5, outlet: 0 },
        { color: "Off-white Gold", size: "Free Size", rent: 1500, deposit: 1200, buy: 9500, qty: 4, outlet: 2 },
      ],
    },
    {
      name: "Banarasi Wedding Saree",
      categoryId: catSaree.id,
      description: "Handwoven Banarasi silk saree",
      items: [
        { color: "Maroon", size: "Free Size", rent: 2000, deposit: 1800, buy: 19000, qty: 2, outlet: 2 },
        { color: "Mustard", size: "Free Size", rent: 2000, deposit: 1800, buy: 19000, qty: 2, outlet: 1 },
      ],
    },
    {
      name: "Champagne Reception Gown",
      categoryId: catGown.id,
      description: "Flowing off-shoulder reception gown",
      items: [
        { color: "Champagne", size: "S", rent: 3200, deposit: 2000, buy: 24000, qty: 2, outlet: 1 },
        { color: "Champagne", size: "M", rent: 3200, deposit: 2000, buy: 24000, qty: 3, outlet: 2 },
        { color: "Wine", size: "M", rent: 3400, deposit: 2200, buy: 25000, qty: 2, outlet: 0 },
      ],
    },
    {
      name: "Sequinned Cocktail Gown",
      categoryId: catGown.id,
      description: "Midnight-blue sequinned gown for sangeet nights",
      items: [
        { color: "Midnight Blue", size: "S", rent: 2500, deposit: 1500, buy: 17000, qty: 2, outlet: 0 },
        { color: "Midnight Blue", size: "M", rent: 2500, deposit: 1500, buy: 17000, qty: 2, outlet: 1 },
      ],
    },
    {
      name: "Indo-Western Party Kurta",
      categoryId: catGown.id,
      description: "Asymmetric kurta set for haldi and mehendi",
      items: [
        { color: "Mint", size: "M", rent: 900, deposit: 600, buy: 5500, qty: 4, outlet: 2 },
        { color: "Peach", size: "L", rent: 900, deposit: 600, buy: 5500, qty: 4, outlet: 0 },
      ],
    },
    {
      name: "Kids Sherwani Set",
      categoryId: catKids.id,
      description: "Sherwani set for little groomsmen",
      items: [
        { color: "Cream", size: "Age 6-8", rent: 700, deposit: 500, buy: 4200, qty: 4, outlet: 0 },
        { color: "Cream", size: "Age 8-10", rent: 750, deposit: 500, buy: 4400, qty: 3, outlet: 1 },
      ],
    },
    {
      name: "Kids Lehenga Choli",
      categoryId: catKids.id,
      description: "Lehenga choli set for little bridesmaids",
      items: [
        { color: "Pink", size: "Age 6-8", rent: 650, deposit: 400, buy: 3800, qty: 4, outlet: 2 },
        { color: "Yellow", size: "Age 8-10", rent: 650, deposit: 400, buy: 3800, qty: 4, outlet: 0 },
      ],
    },
    {
      name: "Bridal Temple Jewellery Set",
      categoryId: catJewellery.id,
      description: "Necklace, haaram, jhumkas and maang tikka",
      items: [
        { color: "Antique Gold", size: "Free Size", rent: 1200, deposit: 2000, buy: 9000, qty: 4, outlet: 0 },
        { color: "Antique Gold", size: "Free Size", rent: 1200, deposit: 2000, buy: 9000, qty: 3, outlet: 1 },
      ],
    },
    {
      name: "Kundan Choker Set",
      categoryId: catJewellery.id,
      description: "Kundan choker with matching earrings",
      items: [
        { color: "Gold-tone", size: "Free Size", rent: 900, deposit: 1500, buy: 6500, qty: 3, outlet: 2 },
        { color: "Silver-tone", size: "Free Size", rent: 800, deposit: 1200, buy: 5800, qty: 3, outlet: 1 },
      ],
    },
    {
      name: "Groom Safa & Mala Set",
      categoryId: catJewellery.id,
      description: "Turban with sehra, brooch and mala",
      items: [
        { color: "Red-Gold", size: "Free Size", rent: 600, deposit: 400, buy: 3200, qty: 5, outlet: 0 },
        { color: "Maroon-Gold", size: "Free Size", rent: 600, deposit: 400, buy: 3200, qty: 4, outlet: 2 },
      ],
    },
  ];

  const allItems: (typeof productVariations.$inferSelect)[] = [];
  const customerOwnedIds = new Set<string>();
  for (const [index, plan] of productPlans.entries()) {
    const [product] = await db
      .insert(products)
      .values({
        shopId: SHOP_ID,
        categoryId: plan.categoryId,
        name: plan.name,
        description: plan.description,
        isActive: true,
        createdAt: offsetTimestamp(-185 + index, 12),
      })
      .returning();

    const inserted = await db
      .insert(productVariations)
      .values(
        plan.items.map((v) => ({
          productId: product.id,
          outletId: outletList[v.outlet].id,
          color: v.color,
          size: v.size,
          rentPrice: money(v.rent),
          securityDeposit: money(v.deposit),
          buyingPrice: v.buy ? money(v.buy) : null,
          quantity: v.qty,
          sku: generateSku(plan.name),
          barcode: generateBarcode(),
          isAvailable: true,
          status: "available" as const,
          ownershipType: v.owner ? ("customer_owned" as const) : ("shop_owned" as const),
          ownerName: v.owner?.name ?? null,
          ownerPhone: v.owner?.phone ?? null,
          ownerShareAmount: v.owner ? money(v.owner.share) : "0",
          createdAt: offsetTimestamp(-185 + index, 12),
        })),
      )
      .returning();
    allItems.push(...inserted);
    inserted.forEach((row, i) => {
      if (plan.items[i].owner) customerOwnedIds.add(row.id);
    });
  }
  console.log(`Products: +${productPlans.length}, Items: +${allItems.length}`);

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------
  const firstNames = [
    "Aditi", "Aparna", "Bhavya", "Chinmayi", "Deepak", "Farhan", "Gopika", "Hari",
    "Irfan", "Jyothi", "Kiran", "Lakshmi", "Manoj", "Nithya", "Omkar", "Priya",
    "Rahul", "Sana", "Tarun", "Uma", "Varun", "Wilson", "Yamini", "Zara",
    "Abhinav", "Bindu", "Cyril", "Divya", "Ebin", "Fida", "Gautham", "Hiba",
    "Ishaan", "Jasmine", "Kavya", "Linu", "Midhun", "Nasrin", "Pooja", "Reshma",
  ];
  const lastNames = [
    "Nair", "Menon", "Pillai", "Iyer", "Kurup", "Warrier", "Panicker", "Namboothiri",
    "Varma", "Thomas", "George", "Jacob", "Rahman", "Basheer", "Salim", "Fernandes",
  ];
  const locations = ["Kannur", "Thalassery", "Kochi", "Aluva", "Kozhikode", "Vadakara", "Payyanur", "Thrissur"];
  const customerRows = await db
    .insert(customers)
    .values(
      firstNames.map((firstName, index) => {
        const lastName = pick(lastNames);
        return {
          shopId: SHOP_ID,
          firstName,
          lastName,
          phone: `+91 99999 4${String(index + 1).padStart(4, "0")}`,
          email: index % 3 === 0 ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com` : null,
          location: pick(locations),
          primaryStaffId: pick(payableStaff).id,
          isActive: index !== 7,
          createdAt: offsetTimestamp(-180 + index * 4, 11),
        };
      }),
    )
    .returning();
  console.log(`Customers: +${customerRows.length}`);

  // -------------------------------------------------------------------------
  // Orders, items and payments over the last six months
  // -------------------------------------------------------------------------
  const usedNumbers = new Set<string>();
  const freshBookingNumber = () => {
    let candidate = generateBookingNumberCandidate();
    while (usedNumbers.has(candidate)) candidate = generateBookingNumberCandidate();
    usedNumbers.add(candidate);
    return candidate;
  };

  type Status = "draft" | "confirmed" | "rented" | "overdue" | "returned" | "cancelled";
  type OrderPlan = { status: Status; from: number; days: number };
  const plans: OrderPlan[] = [
    // Returned history, weighted towards recent months so the trend rises.
    ...Array.from({ length: 110 }, (): OrderPlan => {
      const from = -Math.round(6 + Math.pow(Math.random(), 1.6) * 174);
      return { status: "returned", from, days: randomInt(1, 4) };
    }),
    ...Array.from({ length: 12 }, (): OrderPlan => ({ status: "rented", from: randomInt(-4, 0), days: randomInt(3, 7) })),
    // Due back today, and going out today — so "Return today" and
    // "Pickup today" are never empty on the day of a walkthrough.
    ...Array.from({ length: 3 }, (): OrderPlan => {
      const days = randomInt(2, 4);
      return { status: "rented", from: -(days - 1), days };
    }),
    ...Array.from({ length: 4 }, (): OrderPlan => ({ status: "confirmed", from: 0, days: randomInt(1, 3) })),
    ...Array.from({ length: 4 }, (): OrderPlan => ({ status: "overdue", from: randomInt(-14, -8), days: randomInt(2, 4) })),
    ...Array.from({ length: 22 }, (): OrderPlan => ({ status: "confirmed", from: randomInt(1, 40), days: randomInt(1, 4) })),
    ...Array.from({ length: 5 }, (): OrderPlan => ({ status: "draft", from: randomInt(3, 30), days: randomInt(1, 3) })),
    ...Array.from({ length: 9 }, (): OrderPlan => ({ status: "cancelled", from: randomInt(-120, 20), days: randomInt(1, 3) })),
  ];

  const counts = { returned: 0, settlements: 0, maintenance: 0, payments: 0, items: 0 };

  for (const plan of plans) {
    const outlet = pick(outletList);
    const outletItems = allItems.filter((v) => v.outletId === outlet.id);
    const lineCount = Math.random() < 0.3 ? 2 : 1;
    const lines = Array.from({ length: lineCount }, () => pick(outletItems)).filter(
      (v, i, arr) => arr.findIndex((x) => x.id === v.id) === i,
    );
    const customer = pick(customerRows);
    const handler = pick(staffAt(outlet.id));
    const fromDate = offsetDateIso(plan.from);
    const toDate = offsetDateIso(plan.from + plan.days - 1);
    const createdAt = offsetTimestamp(plan.from - randomInt(3, 15), randomInt(10, 19), randomInt(0, 59));

    const lineCalcs = lines.map((v) => ({
      variation: v,
      grossRent: multiplyMoneyByDays(v.rentPrice, plan.days),
    }));
    const gross = lineCalcs.reduce((sum, l) => addMoney(sum, l.grossRent), "0.00");
    const discount = Math.random() < 0.2 ? money(Math.min(500, Number(gross) * 0.1)) : "0.00";
    const totalAmount = subtractMoneyNonNegative(gross, discount);
    const deposit = lineCalcs.reduce((sum, l) => addMoney(sum, l.variation.securityDeposit), "0.00");

    const bookingId = randomUUID();
    const paymentStatus =
      plan.status === "draft" ? "unpaid"
      : plan.status === "cancelled" ? "unpaid"
      : plan.status === "confirmed" ? (Math.random() < 0.25 ? "paid" : "partial")
      : plan.status === "returned" ? "paid"
      : Math.random() < 0.7 ? "paid" : "partial";

    const cancelledAt = plan.status === "cancelled" ? offsetTimestamp(plan.from - 2, 15) : null;
    const cancellationReason =
      plan.status === "cancelled"
        ? pick(["Customer rescheduled the event", "Event postponed", "Customer chose a different outfit"])
        : null;

    await db.insert(bookings).values({
      id: bookingId,
      bookingNumber: freshBookingNumber(),
      shopId: SHOP_ID,
      customerId: customer.id,
      discountAmount: discount,
      securityDeposit: deposit,
      totalAmount,
      status: plan.status === "draft" ? "draft" : plan.status === "cancelled" ? "cancelled" : "confirmed",
      paymentStatus,
      cancelledAt,
      cancellationReason,
      createdById: handler.id,
      handledById: handler.id,
      notes: Math.random() < 0.2 ? pick(["Wedding on Sunday — alteration done", "Reception outfit, deliver ironed", "Bride's sister booking"]) : null,
      createdAt,
      updatedAt: createdAt,
    });

    const pay = async (amount: string, paymentType: string, days: number, method?: string, note?: string) => {
      if (!gt(amount, "0.00")) return;
      const paymentMethod = (method ?? pick(["cash", "upi", "upi", "card"])) as "cash";
      await db.insert(payments).values({
        shopId: SHOP_ID,
        outletId: outlet.id,
        bookingId,
        amount,
        paymentType: paymentType as "advance",
        paymentMethod,
        referenceNumber: paymentMethod === "cash" ? null : `TXN${randomInt(10000000, 99999999)}`,
        note: note ?? null,
        recordedById: handler.id,
        createdAt: offsetTimestamp(days, randomInt(10, 19), randomInt(0, 59)),
      });
      counts.payments += 1;
    };

    for (const line of lineCalcs) {
      const v = line.variation;
      const itemId = randomUUID();
      const itemBase = {
        id: itemId,
        bookingId,
        shopId: SHOP_ID,
        outletId: outlet.id,
        productId: v.productId,
        variationId: v.id,
        fromDate,
        toDate,
        totalDays: plan.days,
        quantity: 1,
        rentAmount: v.rentPrice,
        grossRent: line.grossRent,
        createdAt,
      };
      counts.items += 1;

      if (plan.status === "draft" || plan.status === "confirmed") {
        await db.insert(bookingItems).values({ ...itemBase, status: plan.status });
      } else if (plan.status === "cancelled") {
        await db.insert(bookingItems).values({ ...itemBase, status: "cancelled", cancelledAt, cancellationReason });
      } else if (plan.status === "rented" || plan.status === "overdue") {
        await db.insert(bookingItems).values({
          ...itemBase,
          status: plan.status,
          pickedUpAt: offsetTimestamp(plan.from, 11),
          pickedUpById: handler.id,
        });
      } else {
        counts.returned += 1;
        const damaged = counts.returned % 7 === 0;
        const damageCharge = damaged
          ? money(Math.min(randomInt(3, 8) * 100, Math.floor(Number(v.securityDeposit) * 0.5)))
          : "0.00";
        const depositRefunded = subtractMoneyNonNegative(v.securityDeposit, damageCharge);
        const returnedAt = offsetTimestamp(plan.from + plan.days, randomInt(11, 19));
        await db.insert(bookingItems).values({
          ...itemBase,
          status: "returned",
          pickedUpAt: offsetTimestamp(plan.from, 11),
          pickedUpById: handler.id,
          returnedAt,
          returnCondition: damaged ? "minor_damage" : "good",
          damageCharge,
          damageNotes: damaged ? pick(["Small stain on dupatta", "Loose embroidery on sleeve", "Hook missing"]) : null,
          depositRefunded,
          cleaningRequired: Math.random() < 0.5,
          maintenanceRequired: damaged,
          collectedById: handler.id,
        });
        if (damaged) {
          await pay(damageCharge, "damage_charge", plan.from + plan.days, "cash", "Deducted from deposit");
          if (counts.maintenance < 8) {
            counts.maintenance += 1;
            const done = counts.maintenance % 3 !== 0;
            await db.insert(maintenanceTasks).values({
              shopId: SHOP_ID,
              outletId: outlet.id,
              variationId: v.id,
              bookingId: itemId,
              taskType: pick(["cleaning", "maintenance"] as const),
              status: done ? "completed" : "in_progress",
              notes: "Opened at return — damage reported",
              assignedToId: handler.id,
              startedAt: offsetTimestamp(plan.from + plan.days, 18),
              completedAt: done ? offsetTimestamp(plan.from + plan.days + 2, 13) : null,
              completedById: done ? handler.id : null,
              createdAt: returnedAt,
            });
          }
        }
        await pay(depositRefunded, "deposit_release", plan.from + plan.days);

        if (customerOwnedIds.has(v.id)) {
          counts.settlements += 1;
          const ownerAmount = gt(v.ownerShareAmount, line.grossRent) ? line.grossRent : v.ownerShareAmount;
          const paid = plan.from < -20;
          await db.insert(ownerSettlements).values({
            shopId: SHOP_ID,
            outletId: outlet.id,
            bookingId: itemId,
            variationId: v.id,
            ownerName: v.ownerName,
            ownerPhone: v.ownerPhone,
            grossRentalAmount: line.grossRent,
            shareAmount: v.ownerShareAmount,
            ownerAmount,
            shopAmount: subtractMoneyNonNegative(line.grossRent, ownerAmount),
            status: paid ? "paid" : "pending",
            paidAt: paid ? offsetTimestamp(plan.from + plan.days + 5, 15) : null,
            paidById: paid ? managerFor(outlet.id) : null,
            paymentReference: paid ? `UPI${randomInt(100000, 999999)}` : null,
            createdAt: returnedAt,
          });
        }
      }
    }

    // Order-level money in, matching the payment status above.
    if (plan.status === "cancelled") {
      if (Math.random() < 0.4) {
        await pay(deposit, "security_deposit", plan.from - 6);
        await pay(deposit, "refund", plan.from - 2, undefined, "Booking cancelled — deposit refunded");
      }
    } else if (plan.status !== "draft") {
      const advanceDay = Math.min(plan.from - 1, -0);
      const advance = paymentStatus === "paid" && plan.status !== "confirmed" ? money(Number(totalAmount) * 0.5) : money(Number(totalAmount) * 0.4);
      await pay(addMoney(advance, plan.status === "confirmed" ? "0.00" : deposit), "advance", plan.status === "confirmed" ? Math.min(-randomInt(0, 6), 0) : advanceDay);
      if (paymentStatus === "paid") {
        const balanceDay = plan.status === "confirmed" ? Math.min(-randomInt(0, 3), 0) : plan.from;
        await pay(subtractMoneyNonNegative(totalAmount, advance), "balance", balanceDay);
      }
    }
  }
  console.log(
    `Orders: +${plans.length} (items ${counts.items}, returned ${counts.returned}), payments +${counts.payments}, settlements +${counts.settlements}, maintenance +${counts.maintenance}`,
  );

  // A few standalone maintenance tasks.
  await db.insert(maintenanceTasks).values([
    {
      shopId: SHOP_ID,
      outletId: allItems[0].outletId,
      variationId: allItems[0].id,
      taskType: "maintenance",
      status: "pending",
      notes: "Zip needs replacing before next rental",
      assignedToId: managerFor(allItems[0].outletId!),
    },
    {
      shopId: SHOP_ID,
      outletId: allItems[5].outletId,
      variationId: allItems[5].id,
      taskType: "cleaning",
      status: "pending",
      notes: "Dry clean after long storage",
      assignedToId: staffAt(allItems[5].outletId!)[1]?.id ?? null,
    },
  ]);

  // -------------------------------------------------------------------------
  // Attendance (last 45 days, Sundays off), leave, salary + payslips
  // -------------------------------------------------------------------------
  const outletById = new Map(outletList.map((o) => [o.id, o]));
  let attendanceCount = 0;
  for (const s of payableStaff) {
    const o = outletById.get(s.outletId)!;
    for (let day = -45; day <= 0; day += 1) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + day);
      if (date.getUTCDay() === 0) continue;
      if (Math.random() < 0.07) continue; // absent
      const isToday = day === 0;
      const inMinute = randomInt(0, 40);
      await db.insert(attendances).values({
        shopId: SHOP_ID,
        outletId: s.outletId!,
        staffId: s.id,
        date: offsetDateIso(day),
        status: Math.random() < 0.04 ? "corrected" : "present",
        checkInTime: offsetTimestamp(day, 9, inMinute),
        checkInLatitude: o.latitude!,
        checkInLongitude: o.longitude!,
        checkInDistanceMetres: randomInt(3, 90),
        checkOutTime: isToday ? null : offsetTimestamp(day, 19, randomInt(0, 45)),
        checkOutLatitude: isToday ? null : o.latitude,
        checkOutLongitude: isToday ? null : o.longitude,
        checkOutDistanceMetres: isToday ? null : randomInt(3, 90),
      });
      attendanceCount += 1;
    }
  }
  console.log(`Attendance: +${attendanceCount}`);

  const reasons = ["Family function", "Medical appointment", "Personal work", "Festival travel", "Sister's wedding"];
  let leaveCount = 0;
  for (const s of payableStaff) {
    for (let i = 0; i < randomInt(1, 3); i += 1) {
      const from = randomInt(-60, 20);
      const decided = from < 0 || Math.random() < 0.4;
      const approved = decided && Math.random() < 0.8;
      await db.insert(staffLeaves).values({
        shopId: SHOP_ID,
        staffId: s.id,
        fromDate: offsetDateIso(from),
        toDate: offsetDateIso(from + randomInt(0, 2)),
        reason: pick(reasons),
        status: decided ? (approved ? "approved" : "rejected") : "pending",
        decidedById: decided ? owner.id : null,
        decidedAt: decided ? offsetTimestamp(Math.min(from - 2, -1), 14) : null,
        createdAt: offsetTimestamp(Math.min(from - 5, -1), 12),
      });
      leaveCount += 1;
    }
  }
  console.log(`Leave requests: +${leaveCount}`);

  const now = new Date();
  let payslipCount = 0;
  for (const s of payableStaff) {
    const baseSalary = s.role === "manager" ? pick([28000, 30000, 32000]) : pick([16000, 18000, 20000, 22000]);
    await db.insert(salaries).values({
      shopId: SHOP_ID,
      staffId: s.id,
      amount: money(baseSalary),
      weeklyOffDay: 0,
      standardHoursPerDay: "8.00",
      effectiveDate: offsetDateIso(-190),
      note: "Standard monthly salary",
    });
    for (const monthsAgo of [3, 2, 1]) {
      const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
      const periodYear = period.getUTCFullYear();
      const periodMonth = period.getUTCMonth() + 1;
      const workingDays = 26;
      const presentDays = randomInt(21, 26);
      const approvedLeaveDays = Math.min(randomInt(0, 2), workingDays - presentDays);
      const payableDays = Math.min(workingDays, presentDays + approvedLeaveDays);
      const hourlyRate = money(baseSalary / (workingDays * 8));
      const basePay = money(Number(hourlyRate) * payableDays * 8);
      await db.insert(salaryPayslips).values({
        shopId: SHOP_ID,
        staffId: s.id,
        periodStart: `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`,
        periodEnd: new Date(Date.UTC(periodYear, periodMonth, 0)).toISOString().slice(0, 10),
        periodYear,
        periodMonth,
        baseSalary: money(baseSalary),
        weeklyOffDay: 0,
        standardHoursPerDay: "8.00",
        workingDays,
        presentDays,
        absentDays: workingDays - payableDays,
        approvedLeaveDays,
        hourlyRate,
        basePay,
        netAmount: basePay,
        generatedById: owner.id,
        generatedAt: new Date(Date.UTC(periodYear, periodMonth, 2, 5, 0)),
      });
      payslipCount += 1;
    }
  }
  console.log(`Salaries: +${payableStaff.length}, Payslips: +${payslipCount}`);

  return SHOP_ID;
}

rootDb
  .transaction(seed)
  .then((shopId) => console.log(`Done. Demo shop id: ${shopId}`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
