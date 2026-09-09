import { z } from "zod";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-policy";

/**
 * Shared primitive schemas, composed into per-feature request schemas. Kept
 * here so length/format rules are defined exactly once (see CLAUDE.md rule
 * about validation at API boundaries applying equally here).
 */
export const emailSchema = z
  .email("Enter a valid email address")
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(255, "Email must be at most 255 characters");

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Must be at least ${PASSWORD_MIN_LENGTH} characters`,
  )
  .max(PASSWORD_MAX_LENGTH, `Must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[0-9]/, "Must contain a number");

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(100, "Must be at most 100 characters");

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .regex(/^[0-9+()\-\s]+$/, "Enter a valid phone number");

/**
 * Same format rules as `phoneSchema`, but the field itself may be left
 * blank — an empty/missing value is fine, a non-empty one still has to be
 * a real phone number. Kept as `.refine()` rather than `.optional()` +
 * `.transform()` so the schema's input and output types stay identical
 * (a `.transform()` here breaks `zodResolver`'s type inference for the
 * `useForm` generic it's paired with).
 */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) =>
      !value ||
      (value.length >= 7 &&
        value.length <= 20 &&
        /^[0-9+()\-\s]+$/.test(value)),
    { message: "Enter a valid phone number" },
  );

/**
 * Same idea as `optionalPhoneSchema`: blank is fine, a non-empty value must
 * be a real email. Used for entities (customers) where an email is useful
 * but, unlike a login-bearing account, never required.
 */
export const optionalEmailSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || z.email().safeParse(value).success, {
    message: "Enter a valid email address",
  })
  .refine((value) => !value || value.length <= 255, {
    message: "Email must be at most 255 characters",
  });

export const uuidSchema = z.uuid("Invalid identifier");

/**
 * Blank is fine, a non-empty value must be a real uuid — for an optional
 * id-shaped filter/reference field (e.g. a list query's `outletId`, a
 * "assign to" picker). A malformed (not just missing) id reaching a raw
 * `eq(column, id)` query against a `uuid` column throws a Postgres syntax
 * error the route can only surface as a generic 500; catching it here
 * instead gives a clean field error or (via `.catch(undefined)` at the
 * call site) a graceful "no filter" degrade. Same `.refine()` pattern as
 * `optionalPhoneSchema`/`optionalEmailSchema`.
 */
export const optionalUuidSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) =>
      !value ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      ),
    { message: "Invalid selection" },
  );

/** A plain `YYYY-MM-DD` calendar date string — what a native `<input
 * type="date">` produces and what a Postgres `date` column stores/returns
 * via `{ mode: "string" }`. Never a JS `Date`: that would carry an implicit
 * timezone a pickup/return date shouldn't have. */
export const dateStringSchema = z.iso.date("Enter a valid date");

/** Shared by `moneySchema`/`optionalMoneySchema` and by any refinement
 * chained after them (e.g. `positiveMoneySchema` in `validation/payments.ts`)
 * that needs to check "is this actually a valid money string" before calling
 * into `@/lib/money`'s `BigInt`-based arithmetic, which throws on anything
 * that doesn't match this shape instead of failing gracefully. */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Money, kept as a string end-to-end (see CLAUDE.md's rule that money is a
 * `Decimal`/`Numeric(12,2)` in Postgres and crosses the API as a string —
 * never a JS `number`, which would reintroduce floating-point rounding).
 * Accepts up to two decimal places and rejects negative amounts; the
 * `Numeric(12,2)` column itself is the real backstop, this just gives a
 * clean field error instead of a driver rejection.
 */
export const moneySchema = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(MONEY_PATTERN, "Enter a valid amount");

/**
 * Same amount format as `moneySchema`, but the field itself may be left
 * blank — an empty/missing value is fine, a non-empty one still has to be
 * a valid amount. **Not** the same as `moneySchema.optional()`: `.optional()`
 * only ever excuses `undefined`, so a blank text input (which submits `""`,
 * not `undefined`) still hits `moneySchema`'s own `.min(1, "Required")` and
 * shows "Required" on a field labelled "(optional)" — this is the bug that
 * pattern caused on the pickup dialog's deposit/balance fields. Built as a
 * `.refine()` (matching `optionalPhoneSchema`/`optionalEmailSchema`'s own
 * pattern), not `.optional()` + `.transform()`, so the schema's input and
 * output types stay identical for `zodResolver`.
 */
export const optionalMoneySchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) => !value || MONEY_PATTERN.test(value),
    { message: "Enter a valid amount" },
  );

/**
 * A revenue-share percentage (0–100, up to two decimal places) — kept
 * here as a shared primitive even though `variations.ts`'s ownership
 * fields now use `optionalMoneySchema` (`ownerShareAmount`) instead; no
 * current call site uses this, but it's a reasonable percentage input to
 * reach for again later.
 */
export const percentageSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .refine(
    (value) => /^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= 100,
    { message: "Enter a percentage between 0 and 100" },
  );

/**
 * Same format as `percentageSchema`, but the field may be left blank —
 * **not** the same as `percentageSchema.optional()`, for the exact reason
 * spelled out on `optionalMoneySchema`: `.optional()` only excuses
 * `undefined`, so a blank input's `""` still trips `.min(1, "Required")`.
 * On a conditionally-rendered field (the ownership share, only shown for
 * customer-owned items) that error is invisible and silently blocks submit.
 */
export const optionalPercentageSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) =>
      !value ||
      (/^\d{1,3}(\.\d{1,2})?$/.test(value) && Number(value) <= 100),
    { message: "Enter a percentage between 0 and 100" },
  );
