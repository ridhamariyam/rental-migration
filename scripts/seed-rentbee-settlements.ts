/**
 * Small follow-up to `seed-rentbee-demo.ts`: that run's random booking
 * assignment only ever happened to land on a customer-owned variation
 * once, so the Revenue Share page had just one settlement. This adds a
 * handful of *returned* bookings specifically against the 3 customer-
 * owned variations already seeded, so Revenue Share has a proper mix of
 * pending/paid settlements to show.
 *
 * Usage: pnpm exec tsx scripts/seed-rentbee-settlements.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import {
  bookings,
  customers,
  ownerSettlements,
  payments,
  productVariations,
} from "../src/lib/db/schema";
import { generateBookingNumberCandidate } from "../src/lib/booking-number";
import { addMoney, multiplyMoneyByDays, percentageOfMoney, subtractMoneyNonNegative } from "../src/lib/money";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set — check .env.local");

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const SHOP_ID = "c5a33db7-0edd-470d-aedd-26dfcca3db82";
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

async function main() {
  const customerOwned = await db
    .select()
    .from(productVariations)
    .where(eq(productVariations.ownershipType, "customer_owned"));

  const relevant = customerOwned.filter((v) =>
    ["4ee7d4b7-f94b-4b96-b4bd-b7deacd70302", "4fb1448f-afcf-44a9-804b-f870afe7f830", "019b1a4e-9bd9-4370-87d0-9b07b44d9471"].includes(
      v.productId,
    ),
  );

  const someCustomers = await db.select().from(customers).where(eq(customers.shopId, SHOP_ID)).limit(10);

  const usedBookingNumbers = new Set<string>();
  function freshBookingNumber(): string {
    let candidate = generateBookingNumberCandidate();
    while (usedBookingNumbers.has(candidate)) candidate = generateBookingNumberCandidate();
    usedBookingNumbers.add(candidate);
    return candidate;
  }

  let created = 0;
  for (let i = 0; i < 6; i += 1) {
    const variation = relevant[i % relevant.length];
    const customer = pick(someCustomers);
    const totalDays = randomInt(1, 4);
    const fromOffset = randomInt(-40, -6);
    const fromDate = offsetDateIso(fromOffset);
    const toDate = offsetDateIso(fromOffset + totalDays - 1);

    const rentAmount = variation.rentPrice;
    const grossRent = multiplyMoneyByDays(rentAmount, totalDays);
    const totalAmount = grossRent;
    const securityDeposit = variation.securityDeposit;

    const bookingId = randomUUID();
    const bookingNumber = freshBookingNumber();

    await db.insert(bookings).values({
      id: bookingId,
      bookingNumber,
      bookingGroupId: randomUUID(),
      shopId: SHOP_ID,
      outletId: variation.outletId,
      customerId: customer.id,
      productId: variation.productId,
      variationId: variation.id,
      fromDate,
      toDate,
      totalDays,
      rentAmount,
      grossRent,
      discountAmount: "0.00",
      securityDeposit,
      totalAmount,
      status: "returned",
      paymentStatus: "paid",
      pickedUpAt: offsetTimestamp(fromOffset, 10),
      pickedUpById: STAFF_KANNUR_ID,
      returnedAt: offsetTimestamp(fromOffset + totalDays, 18),
      returnCondition: "good",
      damageCharge: "0.00",
      depositRefunded: securityDeposit,
      collectedById: STAFF_KANNUR_ID,
      createdById: STAFF_KANNUR_ID,
      handledById: STAFF_KANNUR_ID,
    });

    await db.insert(payments).values([
      {
        shopId: SHOP_ID,
        outletId: variation.outletId,
        bookingId,
        amount: addMoney(totalAmount, securityDeposit),
        paymentType: "advance",
        paymentMethod: "upi",
        recordedById: STAFF_KANNUR_ID,
        createdAt: offsetTimestamp(fromOffset - 1),
      },
      {
        shopId: SHOP_ID,
        outletId: variation.outletId,
        bookingId,
        amount: securityDeposit,
        paymentType: "deposit_release",
        paymentMethod: "cash",
        recordedById: STAFF_KANNUR_ID,
        createdAt: offsetTimestamp(fromOffset + totalDays, 18),
      },
    ]);

    const ownerAmount = percentageOfMoney(grossRent, variation.ownerSharePercentage);
    const shopAmount = subtractMoneyNonNegative(grossRent, ownerAmount);
    const paid = i % 2 === 0;

    await db.insert(ownerSettlements).values({
      shopId: SHOP_ID,
      outletId: variation.outletId,
      bookingId,
      variationId: variation.id,
      ownerName: variation.ownerName,
      ownerPhone: variation.ownerPhone,
      grossRentalAmount: grossRent,
      sharePercentage: variation.ownerSharePercentage,
      ownerAmount,
      shopAmount,
      status: paid ? "paid" : "pending",
      paidAt: paid ? offsetTimestamp(fromOffset + totalDays + 2, 15) : null,
      paidById: paid ? MANAGER_KANNUR_ID : null,
      paymentReference: paid ? `UPI-${randomInt(100000, 999999)}` : null,
    });

    created += 1;
  }

  console.log(`Settlements: +${created}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
