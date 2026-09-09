/**
 * Decimal-safe money arithmetic for booking pricing. Money crosses the API
 * as a string (see CLAUDE.md's `Decimal`/`Numeric(12,2)` rule) — this
 * module works entirely in integer cents (`BigInt`) so multiplying a rate
 * by a day count or summing amounts never reintroduces the binary
 * floating-point rounding a `Numeric` column exists to avoid. No new
 * dependency (e.g. decimal.js) needed: every amount here is already a
 * validated `^\d{1,10}(\.\d{1,2})?$` string (see `moneySchema`), so plain
 * string splitting is enough.
 *
 * Uses `BigInt(...)` calls rather than `100n` literal syntax — this
 * project's `tsconfig.json` targets `ES2017`, which doesn't support BigInt
 * literals, only the `BigInt()` function.
 */

const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

function toCents(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, decPart = ""] = unsigned.split(".");
  const cents = (decPart + "00").slice(0, 2);
  const amount = BigInt(intPart || "0") * HUNDRED + BigInt(cents || "0");
  return negative ? -amount : amount;
}

function fromCents(cents: bigint): string {
  const negative = cents < ZERO;
  const abs = negative ? -cents : cents;
  const intPart = abs / HUNDRED;
  const decPart = (abs % HUNDRED).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${intPart}.${decPart}`;
}

export function multiplyMoneyByDays(amount: string, days: number): string {
  return fromCents(toCents(amount) * BigInt(Math.trunc(days)));
}

/** `amount * quantity` — identical integer-cents arithmetic to
 * `multiplyMoneyByDays`, just named for booking-line quantity call sites
 * instead of day counts. */
export function multiplyMoneyByQuantity(amount: string, quantity: number): string {
  return multiplyMoneyByDays(amount, quantity);
}

/**
 * `amount / divisor`, rounded half-up to 2dp — the legacy backend's
 * `quantize(base_salary / working_days)` (Python `Decimal` with
 * `ROUND_HALF_UP`), ported to integer-cents arithmetic so it never touches
 * a binary float. Used to derive a salary's per-day rate
 * (`src/server/salary/service.ts`'s `calculateSalary`).
 */
export function divideMoneyByInteger(amount: string, divisor: number): string {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new Error("divisor must be a positive integer");
  }

  const cents = toCents(amount);
  const negative = cents < ZERO;
  const absCents = negative ? -cents : cents;
  const divisorBig = BigInt(divisor);

  // `(2x + d) / (2d)` (integer/floor division) is round-half-up for a
  // non-negative `x` — BigInt division truncates toward zero, which is
  // the same as flooring once `absCents` is guaranteed non-negative here.
  const roundedAbs = (absCents * BigInt(2) + divisorBig) / (divisorBig * BigInt(2));

  return fromCents(negative ? -roundedAbs : roundedAbs);
}

export function addMoney(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * `amount * (numerator / denominator)`, rounded half-up to 2dp — the same
 * BigInt-cents round-half-up shape as `percentageOfMoney`, generalised to
 * an arbitrary integer ratio (e.g. minutes-payable over minutes-standard)
 * instead of only a percentage. Used by salary hours/overtime pay
 * (`src/server/salary/service.ts`) so a whole period's pay is rounded once
 * at the end rather than once per day, avoiding compounding rounding
 * error.
 */
export function proRateMoney(
  amount: string,
  numerator: number,
  denominator: number,
): string {
  if (!Number.isInteger(numerator) || numerator < 0) {
    throw new Error("numerator must be a non-negative integer");
  }
  if (!Number.isInteger(denominator) || denominator <= 0) {
    throw new Error("denominator must be a positive integer");
  }

  const amountCents = toCents(amount);
  const negative = amountCents < ZERO;
  const absAmount = negative ? -amountCents : amountCents;

  const num = BigInt(numerator);
  const den = BigInt(denominator);
  const roundedAbs = (absAmount * num * BigInt(2) + den) / (den * BigInt(2));

  return fromCents(negative ? -roundedAbs : roundedAbs);
}

/**
 * `amount * (percent / 100)`, rounded half-up to 2dp — the legacy
 * backend's `percentage_of(gross, percent)` (Python `Decimal` with
 * `ROUND_HALF_UP`), ported to integer-cents/basis-point arithmetic so it
 * never touches a binary float. `percent` is a decimal string with up to
 * two places (e.g. `"60.00"`). No longer used by
 * `src/server/settlements/service.ts` (the owner's revenue share is now a
 * fixed amount, not a percentage of the gross rent) — kept as a general
 * percentage-of-money primitive for other features.
 */
export function percentageOfMoney(amount: string, percent: string): string {
  const amountCents = toCents(amount);
  // Reusing `toCents` on the percentage string turns e.g. "60.00" into the
  // integer `6000` — that is, the percentage expressed in hundredths of a
  // percent, which is exactly the scale `Numeric(5,2)` already stores it
  // at, just without the decimal point.
  const percentHundredths = toCents(percent);

  const negative = (amountCents < ZERO) !== (percentHundredths < ZERO);
  const absAmount = amountCents < ZERO ? -amountCents : amountCents;
  const absPercent =
    percentHundredths < ZERO ? -percentHundredths : percentHundredths;

  // owner_cents = amount_cents * percent_hundredths / 10000 (percent/100,
  // and percent_hundredths already carries an extra factor of 100).
  const numerator = absAmount * absPercent;
  const denominator = BigInt(10000);
  const roundedAbs = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));

  return fromCents(negative ? -roundedAbs : roundedAbs);
}

/** `a - b`, clamped so the result is never negative (matches the legacy
 * `non_negative()` helper — a discount can never make rent go below zero). */
export function subtractMoneyNonNegative(a: string, b: string): string {
  const result = toCents(a) - toCents(b);
  return fromCents(result < ZERO ? ZERO : result);
}

/** `a - b`, signed — unlike `subtractMoneyNonNegative`, this can go
 * negative (e.g. a payment ledger's "rent balance" once a customer has
 * paid more than what's payable). */
export function subtractMoney(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

/** Clamps a signed amount to zero if it's negative (the legacy
 * `non_negative()` helper, exposed standalone for values that are computed
 * as a difference elsewhere, e.g. a payment ledger's "deposit held"). */
export function nonNegativeMoney(value: string): string {
  const cents = toCents(value);
  return fromCents(cents < ZERO ? ZERO : cents);
}

/** -1 / 0 / 1, like `Array.prototype.sort`'s comparator. */
export function compareMoney(a: string, b: string): number {
  const diff = toCents(a) - toCents(b);
  return diff < ZERO ? -1 : diff > ZERO ? 1 : 0;
}

export function isNegativeMoney(value: string): boolean {
  return toCents(value) < ZERO;
}

export const ZERO_MONEY = "0.00";

/**
 * Normalises a raw aggregate value straight back from Postgres (e.g. a
 * `sql<string>\`coalesce(sum(...), 0)\`` projection, which comes back as a
 * bare numeric-as-text like `"0"` or `"1234.5"`, not the `"0.00"`-shaped
 * string every other money helper here assumes) into that same two-
 * decimal-place shape. Used by report aggregates (`src/server/reports/
 * service.ts`) — the sum itself is still done in the database, this only
 * reformats what comes back, so it never re-derives a total via JS float
 * arithmetic.
 */
export function normalizeMoneyFromSql(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return ZERO_MONEY;
  }
  return (Math.round(num * 100) / 100).toFixed(2);
}
