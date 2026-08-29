import { AppError } from "@/lib/errors/app-error";
import {
  addMoney,
  isNegativeMoney,
  multiplyMoneyByDays,
  subtractMoneyNonNegative,
  compareMoney,
  ZERO_MONEY,
} from "@/lib/money";
import { validateDateRange } from "@/server/bookings/availability";

/**
 * Rental pricing arithmetic, ported from the legacy backend's
 * `PricingService`. Deliberately has **no** `rentAmountOverride`/
 * `securityDepositOverride` parameters — the legacy backend accepted a
 * client-supplied `rent_amount` with no permission check at all (the bug
 * flagged in plan.md § 3.2); the fix here is structural: this function
 * only ever prices from the variation's own `rentPrice`/`securityDeposit`,
 * so there is no override to guard in the first place.
 *
 * Definitions (matching the legacy service exactly):
 * - `rentAmount`     – the per-day rate charged (`variation.rentPrice`)
 * - `grossRent`      – `rentAmount * totalDays`
 * - `discountAmount` – reduction agreed at the counter, clamped to `grossRent`
 * - `totalAmount`    – rent payable after discount, **deposit excluded**
 * - `securityDeposit`– refundable, tracked separately from revenue
 */
export type RentalQuote = {
  totalDays: number;
  rentAmount: string;
  grossRent: string;
  discountAmount: string;
  totalAmount: string;
  securityDeposit: string;
  totalReceivable: string;
};

export function quoteRental(
  variation: { rentPrice: string; securityDeposit: string },
  fromDate: string,
  toDate: string,
  discountAmount: string = ZERO_MONEY,
): RentalQuote {
  const totalDays = validateDateRange(fromDate, toDate);

  const rentAmount = variation.rentPrice;
  if (isNegativeMoney(rentAmount)) {
    throw new AppError("Rent amount cannot be negative", 400);
  }

  const grossRent = multiplyMoneyByDays(rentAmount, totalDays);

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

  const securityDeposit = variation.securityDeposit;
  if (isNegativeMoney(securityDeposit)) {
    throw new AppError("Security deposit cannot be negative", 400);
  }

  const totalAmount = subtractMoneyNonNegative(grossRent, discountAmount);

  return {
    totalDays,
    rentAmount,
    grossRent,
    discountAmount,
    totalAmount,
    securityDeposit,
    totalReceivable: addMoney(totalAmount, securityDeposit),
  };
}
