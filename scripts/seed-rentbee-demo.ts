/**
 * Dev-only: fleshes out ONE specific, already-existing tenant ("Rentbee",
 * shop id below — signed in as m.ashiq@codely.ai) with a realistic spread
 * of data across every module, so the dashboard/reports/tables all have
 * something to show instead of one lonely product and two bookings.
 * Never run in production, and never run against any tenant other than
 * the one hard-coded below — this is a one-off "make my own demo account
 * look alive" script, not a general-purpose seeder.
 *
 * Deliberately raw Drizzle inserts, not the real `src/server/**\/service.ts`
 * functions — those all start with `import "server-only"`, which throws
 * immediately in a bare `tsx` process outside Next's bundler (see
 * `scripts/seed-demo-tenants.ts`'s doc comment for the same reasoning).
 * Money/date/id helpers are still reused from the plain `src/lib/*`
 * modules (no `server-only`) so the numbers match the app's own formulas
 * exactly rather than being hand-approximated.
 *
 * Usage: pnpm exec tsx scripts/seed-rentbee-demo.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
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

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

// The one tenant this script ever touches — "Rentbee", m.ashiq@codely.ai.
const SHOP_ID = "c5a33db7-0edd-470d-aedd-26dfcca3db82";
const OUTLET_KANNUR_ID = "b03d2f13-c1c8-439e-b02d-cbfa2881206b";
const MANAGER_KANNUR_ID = "9ee9b20a-69e3-4c57-9874-f2cf59442356";
const STAFF_KANNUR_ID = "5f9f01e5-6bab-41f3-945b-ae76acf83269";

function offsetDateIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function offsetTimestamp(days: number, hour = 11): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
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

async function main() {
  console.log("Seeding demo data for Rentbee...");

  // ------------------------------------------------------------------
  // Outlets
  // ------------------------------------------------------------------
  const [kochi, kozhikode] = await db
    .insert(outlets)
    .values([
      {
        shopId: SHOP_ID,
        name: "Kochi",
        code: "KCH",
        address: "MG Road, Ernakulam, Kochi, Kerala",
        phone: "+91 90080 11223",
        isActive: true,
      },
      {
        shopId: SHOP_ID,
        name: "Kozhikode",
        code: "KZK",
        address: "SM Street, Kozhikode, Kerala",
        phone: "+91 90080 33445",
        isActive: true,
      },
    ])
    .returning();
  console.log(`Outlets: +2 (Kochi ${kochi.id}, Kozhikode ${kozhikode.id})`);

  // ------------------------------------------------------------------
  // Staff
  // ------------------------------------------------------------------
  const passwordHash = await bcrypt.hash("Qwer@123456", 12);
  const staffRows = await db
    .insert(users)
    .values([
      {
        shopId: SHOP_ID,
        outletId: kochi.id,
        role: "manager",
        firstName: "Fathima",
        lastName: "Rasheed",
        email: "fathima.rasheed@rentbee.example",
        phone: "+91 90080 10001",
        passwordHash,
        isActive: true,
      },
      {
        shopId: SHOP_ID,
        outletId: kozhikode.id,
        role: "manager",
        firstName: "Arjun",
        lastName: "Menon",
        email: "arjun.menon@rentbee.example",
        phone: "+91 90080 10002",
        passwordHash,
        isActive: true,
      },
      {
        shopId: SHOP_ID,
        outletId: OUTLET_KANNUR_ID,
        role: "staff",
        firstName: "Sneha",
        lastName: "Pillai",
        email: "sneha.pillai@rentbee.example",
        phone: "+91 90080 10003",
        passwordHash,
        isActive: true,
      },
      {
        shopId: SHOP_ID,
        outletId: kochi.id,
        role: "staff",
        firstName: "Vishnu",
        lastName: "Nair",
        email: "vishnu.nair@rentbee.example",
        phone: "+91 90080 10004",
        passwordHash,
        isActive: true,
      },
      {
        shopId: SHOP_ID,
        outletId: kozhikode.id,
        role: "staff",
        firstName: "Anagha",
        lastName: "Krishnan",
        email: "anagha.krishnan@rentbee.example",
        phone: "+91 90080 10005",
        passwordHash,
        isActive: true,
      },
    ])
    .returning();
  const [fathima, arjun, sneha, vishnu, anagha] = staffRows;
  console.log(`Staff: +${staffRows.length}`);

  // Every staff member (not the admin — admin/super_admin don't punch a
  // clock in this app) who'll get attendance/leave/salary history.
  const payableStaff = [
    { id: MANAGER_KANNUR_ID, outletId: OUTLET_KANNUR_ID },
    { id: STAFF_KANNUR_ID, outletId: OUTLET_KANNUR_ID },
    { id: fathima.id, outletId: kochi.id },
    { id: arjun.id, outletId: kozhikode.id },
    { id: sneha.id, outletId: OUTLET_KANNUR_ID },
    { id: vishnu.id, outletId: kochi.id },
    { id: anagha.id, outletId: kozhikode.id },
  ];

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------
  const categoryRows = await db
    .insert(categories)
    .values([
      { shopId: SHOP_ID, name: "Bridal Lehenga", description: "Bridal and reception lehengas" },
      { shopId: SHOP_ID, name: "Sherwani & Groom Wear", description: "Groom sherwanis and suits" },
      { shopId: SHOP_ID, name: "Wedding Saree", description: "Silk and designer wedding sarees" },
      { shopId: SHOP_ID, name: "Kids Ethnic Wear", description: "Ethnic outfits for children" },
      { shopId: SHOP_ID, name: "Jewellery & Accessories", description: "Bridal jewellery, turbans, and accessories" },
    ])
    .returning();
  const [catLehenga, catSherwani, catSaree, catKids, catJewellery] = categoryRows;
  console.log(`Categories: +${categoryRows.length}`);

  // ------------------------------------------------------------------
  // Products + variations
  // ------------------------------------------------------------------
  type ProductPlan = {
    name: string;
    categoryId: string;
    description: string;
    variations: {
      color: string;
      size: string;
      rentPrice: number;
      securityDeposit: number;
      quantity: number;
      outletId: string;
      customerOwned?: { ownerName: string; ownerPhone: string; shareAmount: number };
    }[];
  };

  const outletCycle = [OUTLET_KANNUR_ID, kochi.id, kozhikode.id];

  const productPlans: ProductPlan[] = [
    {
      name: "Royal Maroon Lehenga",
      categoryId: catLehenga.id,
      description: "Heavy zari-work bridal lehenga with dupatta",
      variations: [
        { color: "Maroon", size: "S", rentPrice: 4200, securityDeposit: 3000, quantity: 3, outletId: outletCycle[0] },
        { color: "Maroon", size: "M", rentPrice: 4200, securityDeposit: 3000, quantity: 4, outletId: outletCycle[1] },
        { color: "Maroon", size: "L", rentPrice: 4200, securityDeposit: 3000, quantity: 3, outletId: outletCycle[2] },
      ],
    },
    {
      name: "Golden Zari Lehenga",
      categoryId: catLehenga.id,
      description: "Gold zari bridal lehenga, reception favourite",
      variations: [
        { color: "Gold", size: "M", rentPrice: 4800, securityDeposit: 3500, quantity: 2, outletId: outletCycle[0] },
        {
          color: "Gold",
          size: "L",
          rentPrice: 4800,
          securityDeposit: 3500,
          quantity: 3,
          outletId: outletCycle[1],
          customerOwned: { ownerName: "Devika Menon", ownerPhone: "+91 98450 11111", shareAmount: 2500 },
        },
      ],
    },
    {
      name: "Pastel Pink Bridal Lehenga",
      categoryId: catLehenga.id,
      description: "Pastel pink lehenga with hand embroidery",
      variations: [
        { color: "Pastel Pink", size: "S", rentPrice: 3800, securityDeposit: 2500, quantity: 4, outletId: outletCycle[2] },
        { color: "Pastel Pink", size: "M", rentPrice: 3800, securityDeposit: 2500, quantity: 5, outletId: outletCycle[0] },
        { color: "Pastel Pink", size: "L", rentPrice: 3800, securityDeposit: 2500, quantity: 3, outletId: outletCycle[1] },
      ],
    },
    {
      name: "Reception Gown",
      categoryId: catLehenga.id,
      description: "Flowing reception gown, off-shoulder",
      variations: [
        { color: "Champagne", size: "S", rentPrice: 3200, securityDeposit: 2000, quantity: 3, outletId: outletCycle[1] },
        { color: "Champagne", size: "M", rentPrice: 3200, securityDeposit: 2000, quantity: 4, outletId: outletCycle[2] },
        { color: "Wine", size: "M", rentPrice: 3400, securityDeposit: 2200, quantity: 2, outletId: outletCycle[0] },
      ],
    },
    {
      name: "Ivory Silk Sherwani",
      categoryId: catSherwani.id,
      description: "Ivory silk sherwani with brooch",
      variations: [
        { color: "Ivory", size: "38", rentPrice: 2400, securityDeposit: 1500, quantity: 4, outletId: outletCycle[0] },
        { color: "Ivory", size: "40", rentPrice: 2400, securityDeposit: 1500, quantity: 6, outletId: outletCycle[1] },
        { color: "Ivory", size: "42", rentPrice: 2400, securityDeposit: 1500, quantity: 4, outletId: outletCycle[2] },
      ],
    },
    {
      name: "Black Velvet Sherwani",
      categoryId: catSherwani.id,
      description: "Black velvet sherwani with zardozi work",
      variations: [
        { color: "Black", size: "40", rentPrice: 2600, securityDeposit: 1800, quantity: 3, outletId: outletCycle[2] },
        {
          color: "Black",
          size: "42",
          rentPrice: 2600,
          securityDeposit: 1800,
          quantity: 3,
          outletId: outletCycle[0],
          customerOwned: { ownerName: "Rajeev Kurup", ownerPhone: "+91 98450 22222", shareAmount: 1300 },
        },
      ],
    },
    {
      name: "Classic Groom Suit",
      categoryId: catSherwani.id,
      description: "Three-piece tailored groom suit",
      variations: [
        { color: "Navy", size: "40", rentPrice: 1800, securityDeposit: 1200, quantity: 5, outletId: outletCycle[1] },
        { color: "Charcoal", size: "42", rentPrice: 1800, securityDeposit: 1200, quantity: 5, outletId: outletCycle[2] },
      ],
    },
    {
      name: "Kanjivaram Silk Saree",
      categoryId: catSaree.id,
      description: "Pure Kanjivaram silk wedding saree",
      variations: [
        { color: "Red", size: "Free Size", rentPrice: 2200, securityDeposit: 2000, quantity: 3, outletId: outletCycle[0] },
        {
          color: "Green",
          size: "Free Size",
          rentPrice: 2200,
          securityDeposit: 2000,
          quantity: 2,
          outletId: outletCycle[1],
          customerOwned: { ownerName: "Lakshmi Warrier", ownerPhone: "+91 98450 33333", shareAmount: 1200 },
        },
        { color: "Blue", size: "Free Size", rentPrice: 2200, securityDeposit: 2000, quantity: 4, outletId: outletCycle[2] },
      ],
    },
    {
      name: "Banarasi Wedding Saree",
      categoryId: catSaree.id,
      description: "Handwoven Banarasi silk saree",
      variations: [
        { color: "Maroon", size: "Free Size", rentPrice: 2000, securityDeposit: 1800, quantity: 3, outletId: outletCycle[2] },
        { color: "Mustard", size: "Free Size", rentPrice: 2000, securityDeposit: 1800, quantity: 3, outletId: outletCycle[0] },
      ],
    },
    {
      name: "Designer Net Saree",
      categoryId: catSaree.id,
      description: "Sequinned net saree with designer blouse",
      variations: [
        { color: "Peacock Blue", size: "Free Size", rentPrice: 1600, securityDeposit: 1200, quantity: 4, outletId: outletCycle[1] },
        { color: "Wine", size: "Free Size", rentPrice: 1600, securityDeposit: 1200, quantity: 4, outletId: outletCycle[2] },
      ],
    },
    {
      name: "Kids Sherwani Set",
      categoryId: catKids.id,
      description: "Sherwani set for little groomsmen",
      variations: [
        { color: "Cream", size: "Age 6-8", rentPrice: 700, securityDeposit: 500, quantity: 4, outletId: outletCycle[0] },
        { color: "Cream", size: "Age 8-10", rentPrice: 750, securityDeposit: 500, quantity: 4, outletId: outletCycle[1] },
      ],
    },
    {
      name: "Kids Lehenga Choli",
      categoryId: catKids.id,
      description: "Lehenga choli set for little bridesmaids",
      variations: [
        { color: "Pink", size: "Age 6-8", rentPrice: 650, securityDeposit: 400, quantity: 5, outletId: outletCycle[2] },
        { color: "Yellow", size: "Age 8-10", rentPrice: 650, securityDeposit: 400, quantity: 5, outletId: outletCycle[0] },
      ],
    },
    {
      name: "Bridal Jewellery Set",
      categoryId: catJewellery.id,
      description: "Necklace, earrings, and maang tikka set",
      variations: [
        { color: "Gold-tone", size: "Free Size", rentPrice: 900, securityDeposit: 1500, quantity: 6, outletId: outletCycle[1] },
        { color: "Silver-tone", size: "Free Size", rentPrice: 800, securityDeposit: 1200, quantity: 5, outletId: outletCycle[2] },
      ],
    },
    {
      name: "Groom Turban & Mala Set",
      categoryId: catJewellery.id,
      description: "Safa/turban with sehra and mala",
      variations: [
        { color: "Red-Gold", size: "Free Size", rentPrice: 600, securityDeposit: 400, quantity: 6, outletId: outletCycle[0] },
        { color: "Maroon-Gold", size: "Free Size", rentPrice: 600, securityDeposit: 400, quantity: 5, outletId: outletCycle[1] },
      ],
    },
    {
      name: "Casual Party Shirt",
      categoryId: b562522eCategoryId(),
      description: "Party-wear shirt for sangeet/mehendi",
      variations: [
        { color: "White", size: "M", rentPrice: 500, securityDeposit: 300, quantity: 6, outletId: outletCycle[2] },
        { color: "Sky Blue", size: "L", rentPrice: 500, securityDeposit: 300, quantity: 6, outletId: outletCycle[0] },
      ],
    },
  ];

  // The pre-existing "shirt" category id — used only by the "Casual Party
  // Shirt" product above so it lands in the tenant's existing category
  // instead of creating a near-duplicate.
  function b562522eCategoryId(): string {
    return "b562522e-085b-411c-84b3-a89d1a7136b6";
  }

  const allVariationRows: (typeof productVariations.$inferSelect)[] = [];
  const customerOwnedVariationIds: string[] = [];

  for (const plan of productPlans) {
    const [product] = await db
      .insert(products)
      .values({
        shopId: SHOP_ID,
        categoryId: plan.categoryId,
        name: plan.name,
        description: plan.description,
        isActive: true,
      })
      .returning();

    const variationValues = plan.variations.map((v) => ({
      productId: product.id,
      outletId: v.outletId,
      color: v.color,
      size: v.size,
      rentPrice: money(v.rentPrice),
      securityDeposit: money(v.securityDeposit),
      quantity: v.quantity,
      sku: generateSku(plan.name),
      barcode: generateBarcode(),
      isAvailable: true,
      status: "available" as const,
      ownershipType: v.customerOwned ? ("customer_owned" as const) : ("shop_owned" as const),
      ownerName: v.customerOwned?.ownerName ?? null,
      ownerPhone: v.customerOwned?.ownerPhone ?? null,
      ownerShareAmount: v.customerOwned ? money(v.customerOwned.shareAmount) : "0",
    }));

    const inserted = await db.insert(productVariations).values(variationValues).returning();
    allVariationRows.push(...inserted);
    inserted.forEach((row, index) => {
      if (plan.variations[index].customerOwned) {
        customerOwnedVariationIds.push(row.id);
      }
    });
  }
  console.log(`Products: +${productPlans.length}, Variations: +${allVariationRows.length}`);

  // ------------------------------------------------------------------
  // Customers
  // ------------------------------------------------------------------
  const firstNames = [
    "Aditi", "Aparna", "Bhavya", "Chinmayi", "Deepak", "Farhan", "Gopika", "Hari",
    "Irfan", "Jyothi", "Kiran", "Lakshmi", "Manoj", "Nithya", "Om", "Priya",
    "Rahul", "Sana", "Tarun", "Uma", "Varun", "Wilson", "Yamini", "Zara",
    "Abhinav", "Bindu", "Cyril", "Divya",
  ];
  const lastNames = [
    "Nair", "Menon", "Pillai", "Iyer", "Kurup", "Warrier", "Panicker", "Namboothiri",
    "Varma", "Thomas", "George", "Jacob", "Rahman", "Basheer", "Salim", "Fernandes",
  ];

  const customerValues = firstNames.map((firstName, index) => ({
    shopId: SHOP_ID,
    firstName,
    lastName: pick(lastNames),
    phone: `+91 98470 ${(10000 + index).toString().slice(-5)}`,
    email: index % 3 === 0 ? `${firstName.toLowerCase()}.${index}@example.com` : null,
    primaryStaffId: pick(payableStaff).id,
    isActive: true,
  }));

  const customerRows = await db.insert(customers).values(customerValues).returning();
  console.log(`Customers: +${customerRows.length}`);

  // ------------------------------------------------------------------
  // Bookings + payments (+ settlements/maintenance for a subset)
  // ------------------------------------------------------------------
  const usedBookingNumbers = new Set<string>();
  function freshBookingNumber(): string {
    let candidate = generateBookingNumberCandidate();
    while (usedBookingNumbers.has(candidate)) {
      candidate = generateBookingNumberCandidate();
    }
    usedBookingNumbers.add(candidate);
    return candidate;
  }

  type BookingPlan = {
    status: "draft" | "confirmed" | "rented" | "overdue" | "returned" | "cancelled";
    fromDaysOffset: number;
    totalDays: number;
  };

  const bookingPlans: BookingPlan[] = [
    ...Array.from({ length: 5 }, (): BookingPlan => ({
      status: "draft",
      fromDaysOffset: randomInt(2, 20),
      totalDays: randomInt(1, 3),
    })),
    ...Array.from({ length: 10 }, (): BookingPlan => ({
      status: "confirmed",
      fromDaysOffset: randomInt(3, 25),
      totalDays: randomInt(1, 4),
    })),
    ...Array.from({ length: 10 }, (): BookingPlan => ({
      status: "rented",
      fromDaysOffset: randomInt(-4, -1),
      totalDays: randomInt(3, 8),
    })),
    ...Array.from({ length: 5 }, (): BookingPlan => ({
      status: "overdue",
      fromDaysOffset: randomInt(-20, -10),
      totalDays: randomInt(2, 5),
    })),
    ...Array.from({ length: 15 }, (): BookingPlan => ({
      status: "returned",
      fromDaysOffset: randomInt(-45, -6),
      totalDays: randomInt(1, 5),
    })),
    ...Array.from({ length: 5 }, (): BookingPlan => ({
      status: "cancelled",
      fromDaysOffset: randomInt(-15, 15),
      totalDays: randomInt(1, 3),
    })),
  ];

  let returnedCount = 0;
  let settlementCount = 0;
  let maintenanceCount = 0;

  for (const plan of bookingPlans) {
    const variation = pick(allVariationRows);
    const customer = pick(customerRows);
    const staffMember = pick(payableStaff);
    const fromDate = offsetDateIso(plan.fromDaysOffset);
    const toDate = offsetDateIso(plan.fromDaysOffset + plan.totalDays - 1);

    const rentAmount = variation.rentPrice;
    const grossRent = multiplyMoneyByDays(rentAmount, plan.totalDays);
    const discountAmount = "0.00";
    const totalAmount = subtractMoneyNonNegative(grossRent, discountAmount);
    const securityDeposit = variation.securityDeposit;

    const bookingId = randomUUID();
    const itemId = randomUUID();
    const bookingNumber = freshBookingNumber();

    const orderBase = {
      id: bookingId,
      bookingNumber,
      shopId: SHOP_ID,
      customerId: customer.id,
      discountAmount,
      securityDeposit,
      totalAmount,
      createdById: staffMember.id,
      handledById: staffMember.id,
      notes: null as string | null,
    };

    const itemBase = {
      id: itemId,
      bookingId,
      shopId: SHOP_ID,
      outletId: variation.outletId,
      productId: variation.productId,
      variationId: variation.id,
      fromDate,
      toDate,
      totalDays: plan.totalDays,
      rentAmount,
      grossRent,
    };

    if (plan.status === "draft") {
      await db.insert(bookings).values({
        ...orderBase,
        status: "draft",
        paymentStatus: "unpaid",
      });
      await db.insert(bookingItems).values({ ...itemBase, status: "draft" });
      continue;
    }

    if (plan.status === "cancelled") {
      const refunded = Math.random() < 0.3;
      const cancelledAt = offsetTimestamp(plan.fromDaysOffset - 1);
      const cancellationReason = pick([
        "Customer rescheduled the event",
        "Duplicate booking created by mistake",
        "Customer found a different outfit",
      ]);
      await db.insert(bookings).values({
        ...orderBase,
        status: "cancelled",
        paymentStatus: refunded ? "refunded" : "unpaid",
        cancelledAt,
        cancellationReason,
      });
      await db.insert(bookingItems).values({
        ...itemBase,
        status: "cancelled",
        cancelledAt,
        cancellationReason,
      });
      if (refunded) {
        await db.insert(payments).values([
          {
            shopId: SHOP_ID,
            outletId: variation.outletId,
            bookingId,
            amount: securityDeposit,
            paymentType: "security_deposit",
            paymentMethod: pick(["cash", "upi"] as const),
            recordedById: staffMember.id,
            createdAt: offsetTimestamp(plan.fromDaysOffset - 2),
          },
          {
            shopId: SHOP_ID,
            outletId: variation.outletId,
            bookingId,
            amount: securityDeposit,
            paymentType: "refund",
            paymentMethod: pick(["cash", "upi"] as const),
            note: "Booking cancelled — deposit refunded",
            recordedById: staffMember.id,
            createdAt: offsetTimestamp(plan.fromDaysOffset - 1),
          },
        ]);
      }
      continue;
    }

    if (plan.status === "confirmed") {
      const advance = money(Number(totalAmount) * 0.5);
      await db.insert(bookings).values({
        ...orderBase,
        status: "confirmed",
        paymentStatus: "partial",
      });
      await db.insert(bookingItems).values({ ...itemBase, status: "confirmed" });
      await db.insert(payments).values({
        shopId: SHOP_ID,
        outletId: variation.outletId,
        bookingId,
        amount: addMoney(advance, securityDeposit),
        paymentType: "advance",
        paymentMethod: pick(["cash", "upi", "card"] as const),
        recordedById: staffMember.id,
        createdAt: offsetTimestamp(plan.fromDaysOffset - 2),
      });
      continue;
    }

    if (plan.status === "rented" || plan.status === "overdue") {
      const fullyPaid = Math.random() < 0.6;
      const advance = fullyPaid ? totalAmount : money(Number(totalAmount) * 0.5);
      await db.insert(bookings).values({
        ...orderBase,
        status: "confirmed",
        paymentStatus: fullyPaid ? "paid" : "partial",
      });
      await db.insert(bookingItems).values({
        ...itemBase,
        status: plan.status,
        pickedUpAt: offsetTimestamp(plan.fromDaysOffset, 10),
        pickedUpById: staffMember.id,
      });
      await db.insert(payments).values({
        shopId: SHOP_ID,
        outletId: variation.outletId,
        bookingId,
        amount: addMoney(advance, securityDeposit),
        paymentType: "advance",
        paymentMethod: pick(["cash", "upi", "card"] as const),
        recordedById: staffMember.id,
        createdAt: offsetTimestamp(plan.fromDaysOffset - 1),
      });
      if (fullyPaid && compareGt(totalAmount, advance)) {
        await db.insert(payments).values({
          shopId: SHOP_ID,
          outletId: variation.outletId,
          bookingId,
          amount: subtractMoneyNonNegative(totalAmount, advance),
          paymentType: "balance",
          paymentMethod: pick(["cash", "upi"] as const),
          recordedById: staffMember.id,
          createdAt: offsetTimestamp(plan.fromDaysOffset, 9),
        });
      }
      continue;
    }

    // returned ---------------------------------------------------------
    returnedCount += 1;
    const hasDamage = returnedCount % 4 === 0;
    const damageCharge = hasDamage
      ? money(Math.max(1, Math.min(randomInt(2, 5) * 100, Math.floor(Number(securityDeposit) * 0.4))))
      : "0.00";
    const depositRefunded = subtractMoneyNonNegative(securityDeposit, damageCharge);
    const returnCondition = hasDamage ? "minor_damage" : "good";

    await db.insert(bookings).values({
      ...orderBase,
      status: "confirmed",
      paymentStatus: "paid",
    });
    await db.insert(bookingItems).values({
      ...itemBase,
      status: "returned",
      pickedUpAt: offsetTimestamp(plan.fromDaysOffset, 10),
      pickedUpById: staffMember.id,
      returnedAt: offsetTimestamp(plan.fromDaysOffset + plan.totalDays, 18),
      returnCondition,
      damageCharge,
      depositRefunded,
      collectedById: staffMember.id,
    });

    await db.insert(payments).values([
      {
        shopId: SHOP_ID,
        outletId: variation.outletId,
        bookingId,
        amount: addMoney(totalAmount, securityDeposit),
        paymentType: "advance",
        paymentMethod: pick(["cash", "upi", "card"] as const),
        recordedById: staffMember.id,
        createdAt: offsetTimestamp(plan.fromDaysOffset - 1),
      },
      ...(hasDamage
        ? [
            {
              shopId: SHOP_ID,
              outletId: variation.outletId,
              bookingId,
              amount: damageCharge,
              paymentType: "damage_charge" as const,
              paymentMethod: "cash" as const,
              note: "Minor stain — deducted from deposit",
              recordedById: staffMember.id,
              createdAt: offsetTimestamp(plan.fromDaysOffset + plan.totalDays, 18),
            },
          ]
        : []),
      // `payments.amount` has a `> 0` check constraint — skip the release
      // row entirely on the rare case damage ate the whole deposit rather
      // than inserting a zero-amount row.
      ...(Number(depositRefunded) > 0
        ? [
            {
              shopId: SHOP_ID,
              outletId: variation.outletId,
              bookingId,
              amount: depositRefunded,
              paymentType: "deposit_release" as const,
              paymentMethod: pick(["cash", "upi"] as const),
              recordedById: staffMember.id,
              createdAt: offsetTimestamp(plan.fromDaysOffset + plan.totalDays, 18),
            },
          ]
        : []),
    ]);

    // Maintenance for a damaged return.
    if (hasDamage && maintenanceCount < 4) {
      maintenanceCount += 1;
      const completed = maintenanceCount % 2 === 0;
      await db.insert(maintenanceTasks).values({
        shopId: SHOP_ID,
        outletId: variation.outletId,
        variationId: variation.id,
        bookingId: itemId,
        taskType: "cleaning",
        status: completed ? "completed" : "in_progress",
        notes: "Opened automatically at return — minor stain reported",
        assignedToId: staffMember.id,
        startedAt: offsetTimestamp(plan.fromDaysOffset + plan.totalDays, 19),
        completedAt: completed ? offsetTimestamp(plan.fromDaysOffset + plan.totalDays + 1, 12) : null,
        completedById: completed ? staffMember.id : null,
      });
    }

    // Settlement for a customer-owned variation's completed rental.
    if (customerOwnedVariationIds.includes(variation.id) && settlementCount < 5) {
      settlementCount += 1;
      const ownerAmount =
        compareMoney(variation.ownerShareAmount, grossRent) > 0
          ? grossRent
          : variation.ownerShareAmount;
      const shopAmount = subtractMoneyNonNegative(grossRent, ownerAmount);
      const paid = settlementCount % 2 === 0;
      await db.insert(ownerSettlements).values({
        shopId: SHOP_ID,
        outletId: variation.outletId,
        bookingId: itemId,
        variationId: variation.id,
        ownerName: variation.ownerName,
        ownerPhone: variation.ownerPhone,
        grossRentalAmount: grossRent,
        shareAmount: variation.ownerShareAmount,
        ownerAmount,
        shopAmount,
        status: paid ? "paid" : "pending",
        paidAt: paid ? offsetTimestamp(plan.fromDaysOffset + plan.totalDays + 2, 15) : null,
        paidById: paid ? MANAGER_KANNUR_ID : null,
        paymentReference: paid ? `UPI-${randomInt(100000, 999999)}` : null,
      });
    }
  }

  function compareGt(a: string, b: string): boolean {
    return Number(a) > Number(b);
  }

  console.log(
    `Bookings: +${bookingPlans.length} (returned=${returnedCount}, settlements=${settlementCount}, maintenance=${maintenanceCount})`,
  );

  // A couple of standalone maintenance tasks not tied to any booking.
  const standaloneVariations = [allVariationRows[0], allVariationRows[1]];
  await db.insert(maintenanceTasks).values([
    {
      shopId: SHOP_ID,
      outletId: standaloneVariations[0].outletId,
      variationId: standaloneVariations[0].id,
      taskType: "maintenance",
      status: "pending",
      notes: "Zipper needs replacing before next rental",
      assignedToId: MANAGER_KANNUR_ID,
    },
    {
      shopId: SHOP_ID,
      outletId: standaloneVariations[1].outletId,
      variationId: standaloneVariations[1].id,
      taskType: "cleaning",
      status: "completed",
      notes: "Routine dry cleaning after storage",
      assignedToId: STAFF_KANNUR_ID,
      startedAt: offsetTimestamp(-10, 9),
      completedAt: offsetTimestamp(-9, 16),
      completedById: STAFF_KANNUR_ID,
    },
  ]);

  // ------------------------------------------------------------------
  // Attendance (last 30 days, skipping Sundays) + leave + salary
  // ------------------------------------------------------------------
  let attendanceCount = 0;
  for (const staffMember of payableStaff) {
    for (let dayOffset = -30; dayOffset <= -1; dayOffset += 1) {
      const date = offsetTimestamp(dayOffset, 0);
      if (date.getUTCDay() === 0) continue; // Sunday off

      const roll = Math.random();
      const status = roll < 0.85 ? "present" : roll < 0.95 ? "absent" : "corrected";
      if (status === "absent") continue; // no check-in row for an absent day

      await db.insert(attendances).values({
        shopId: SHOP_ID,
        outletId: staffMember.outletId,
        staffId: staffMember.id,
        date: offsetDateIso(dayOffset),
        status,
        checkInTime: offsetTimestamp(dayOffset, 9),
        checkInLatitude: 11.8745,
        checkInLongitude: 75.3704,
        checkInDistanceMetres: randomInt(5, 120),
        checkOutTime: offsetTimestamp(dayOffset, 19),
        checkOutLatitude: 11.8745,
        checkOutLongitude: 75.3704,
        checkOutDistanceMetres: randomInt(5, 120),
      });
      attendanceCount += 1;
    }
  }
  console.log(`Attendance: +${attendanceCount}`);

  const leaveReasons = [
    "Family function",
    "Medical appointment",
    "Personal work",
    "Festival travel",
    "Not feeling well",
  ];
  let leaveCount = 0;
  for (const staffMember of payableStaff) {
    const leavesForStaff = randomInt(1, 2);
    for (let i = 0; i < leavesForStaff; i += 1) {
      const fromOffset = randomInt(-40, -3);
      const span = randomInt(0, 2);
      const decided = Math.random() < 0.8;
      const approved = decided && Math.random() < 0.75;
      await db.insert(staffLeaves).values({
        shopId: SHOP_ID,
        staffId: staffMember.id,
        fromDate: offsetDateIso(fromOffset),
        toDate: offsetDateIso(fromOffset + span),
        reason: pick(leaveReasons),
        status: decided ? (approved ? "approved" : "rejected") : "pending",
        decidedById: decided ? MANAGER_KANNUR_ID : null,
        decidedAt: decided ? offsetTimestamp(fromOffset - 1, 14) : null,
      });
      leaveCount += 1;
    }
  }
  console.log(`Leave requests: +${leaveCount}`);

  let salaryCount = 0;
  let payslipCount = 0;
  const now = new Date();
  for (const staffMember of payableStaff) {
    const baseSalary = pick([18000, 20000, 22000, 25000, 28000]);
    await db.insert(salaries).values({
      shopId: SHOP_ID,
      staffId: staffMember.id,
      amount: money(baseSalary),
      weeklyOffDay: 0,
      standardHoursPerDay: "8.00",
      effectiveDate: offsetDateIso(-90),
      note: "Standard monthly salary",
    });
    salaryCount += 1;

    // Last two full calendar months' payslips.
    for (const monthsAgo of [2, 1]) {
      const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
      const periodYear = period.getUTCFullYear();
      const periodMonth = period.getUTCMonth() + 1;
      const workingDays = 26;
      const standardHoursPerDay = "8.00";
      const presentDays = randomInt(18, 24);
      const approvedLeaveDays = randomInt(0, 2);
      const payableDays = Math.min(workingDays, presentDays + approvedLeaveDays);
      const absentDays = Math.max(0, workingDays - presentDays - approvedLeaveDays);
      const hourlyRate = money(baseSalary / (workingDays * 8));
      const basePay = money(Number(hourlyRate) * payableDays * 8);
      const netAmount = basePay;

      await db.insert(salaryPayslips).values({
        shopId: SHOP_ID,
        staffId: staffMember.id,
        // A payroll period is a date range now; a month-shaped one keeps
        // its year/month labels too.
        periodStart: `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`,
        periodEnd: new Date(Date.UTC(periodYear, periodMonth, 0))
          .toISOString()
          .slice(0, 10),
        periodYear,
        periodMonth,
        baseSalary: money(baseSalary),
        weeklyOffDay: 0,
        standardHoursPerDay,
        workingDays,
        presentDays,
        absentDays,
        approvedLeaveDays,
        hourlyRate,
        basePay,
        netAmount,
        generatedById: MANAGER_KANNUR_ID,
        generatedAt: offsetTimestamp(-monthsAgo * 30 + 3, 10),
      });
      payslipCount += 1;
    }
  }
  console.log(`Salaries: +${salaryCount}, Payslips: +${payslipCount}`);

  console.log("Done seeding Rentbee demo data.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
