import { AppError } from "@/lib/errors/app-error";
import {
  addMoney,
  isNegativeMoney,
  multiplyMoneyByQuantity,
  subtractMoneyNonNegative,
  compareMoney,
  ZERO_MONEY,
} from "@/lib/money";
import { validateDateRange } from "@/server/bookings/availability";

/**
 * Rental pricing arithmetic, ported from the legacy backend's
 * `PricingService`. Deliberately has **no** `rentAmountOverride` — the
 * legacy backend accepted a client-supplied `rent_amount` with no
 * permission check at all (the bug flagged in plan.md § 3.2); the fix here
 * is structural: rent is only ever priced from the variation's own
 * `rentPrice`, so there is no override to guard in the first place. The
 * deposit *is* overridable (`securityDepositPerUnit`) — that is a
 * refundable holding amount the counter routinely varies per customer, not
 * revenue, and every caller of this function is already behind
 * `BOOKING_CREATE`.
 *
 * Rent is a **flat price for the whole hire**, not a per-day rate: a shop
 * quotes "₹2,000 for this sherwani" and that price does not change because
 * the customer keeps it for three days instead of one. `totalDays` is
 * still computed — it drives the availability window and the receipt's
 * date range — it just never multiplies the price.
 *
 * Definitions:
 * - `rentAmount`     – the flat per-unit price for the rental (`variation.rentPrice`)
 * - `grossRent`      – `rentAmount * quantity`
 * - `discountAmount` – reduction agreed at the counter, clamped to `grossRent`
 * - `additionalCost` – one-off extra charge agreed at the counter (alteration, delivery…)
 * - `totalAmount`    – payable after discount and extras, **deposit excluded**
 * - `securityDeposit`– refundable, tracked separately from revenue, `deposit * quantity`
 */
export type RentalQuote = {
  totalDays: number;
  quantity: number;
  rentAmount: string;
  grossRent: string;
  discountAmount: string;
  additionalCost: string;
  totalAmount: string;
  securityDeposit: string;
  totalReceivable: string;
};

export function quoteRental(
  variation: { rentPrice: string; securityDeposit: string },
  fromDate: string,
  toDate: string,
  discountAmount: string = ZERO_MONEY,
  quantity: number = 1,
  options: {
    /** One-off extra charge for this line, added on top of the rent. */
    additionalCost?: string;
    /** Deposit to hold **per unit**, replacing the item's own default when
     * the counter agrees a different amount (blank/undefined keeps the
     * item's `securityDeposit`). Multiplied by `quantity` exactly like the
     * default is, so "2 of this item" holds twice the deposit either way. */
    securityDepositPerUnit?: string;
  } = {},
): RentalQuote {
  const totalDays = validateDateRange(fromDate, toDate);

  const rentAmount = variation.rentPrice;
  if (isNegativeMoney(rentAmount)) {
    throw new AppError("Rent amount cannot be negative", 400);
  }

  const grossRent = multiplyMoneyByQuantity(rentAmount, quantity);

  if (isNegativeMoney(discountAmount)) {
    throw new AppError("Discount cannot be negative", 400, [
      { field: "discountAmount", message: "Discount cannot be negative" },
    ]);
  }

  if (compareMoney(discountAmount, grossRent) > 0) {
    throw new AppError("Discount cannot exceed the rental amount", 400, [
      {
        field: "discountAmount",
        message: "Discount cannot exceed the rental amount",
      },
    ]);
  }

  const additionalCost = options.additionalCost || ZERO_MONEY;
  if (isNegativeMoney(additionalCost)) {
    throw new AppError("Additional cost cannot be negative", 400, [
      { field: "additionalCost", message: "Additional cost cannot be negative" },
    ]);
  }

  const depositPerUnit =
    options.securityDepositPerUnit || variation.securityDeposit;
  if (isNegativeMoney(depositPerUnit)) {
    throw new AppError("Security deposit cannot be negative", 400, [
      {
        field: "securityDeposit",
        message: "Security deposit cannot be negative",
      },
    ]);
  }

  const securityDeposit = multiplyMoneyByQuantity(depositPerUnit, quantity);

  const totalAmount = addMoney(
    subtractMoneyNonNegative(grossRent, discountAmount),
    additionalCost,
  );

  return {
    totalDays,
    quantity,
    rentAmount,
    grossRent,
    discountAmount,
    additionalCost,
    totalAmount,
    securityDeposit,
    totalReceivable: addMoney(totalAmount, securityDeposit),
  };
}
