import { z } from "zod";
import {
  optionalMoneySchema,
  optionalUuidSchema,
  uuidSchema,
} from "@/lib/validation/common";
import { positiveMoneySchema } from "@/lib/validation/payments";

export const salaryIdParamSchema = z.object({ id: uuidSchema });

const noteSchema = z
  .string()
  .trim()
  .max(500, "Note must be at most 500 characters")
  .optional();

/**
 * Pay configuration for a staff member (doc §18).
 *
 * `hourlyRate` is the basis of every payslip — pay is approved hours
 * actually worked × this rate, so it is required and is never derived
 * from `amount`. `amount` is now only the monthly figure the shop quotes
 * the role at (optional, reference only): dividing it by the working
 * hours to reach an hourly rate is exactly the model this replaced.
 *
 * `weeklyOffDay` is `0`–`6` (Sunday–Saturday) for the one day a week
 * that is never a working day, or `null` for no weekly off.
 */
export const createSalarySchema = z.object({
  staffId: uuidSchema,
  hourlyRate: positiveMoneySchema,
  amount: optionalMoneySchema,
  // Deliberately `z.number()`, not `z.coerce.number()` — the form fields
  // are `type="number"` inputs registered with `valueAsNumber: true`
  // (`add-salary-dialog.tsx`), so they're already real `number`s by the
  // time they reach this schema. `.coerce` here would give the schema a
  // different input/output type (`unknown` vs `number`), which breaks
  // `zodResolver`'s generic when the same inferred type also drives
  // `useForm<CreateSalaryInput>`.
  weeklyOffDay: z
    .number("Must be a number")
    .int("Must be a whole number")
    .min(0, "Must be between 0 and 6")
    .max(6, "Must be between 0 and 6")
    .nullable(),
  standardHoursPerDay: z
    .number("Must be a number")
    .min(1, "Must be at least 1")
    .max(24, "Must be at most 24"),
  /** Extra-worktime rate: what an hour beyond `standardHoursPerDay` is
   * paid at. Left blank, extra hours are recorded but not paid. */
  overtimeRatePerHour: optionalMoneySchema,
  effectiveDate: z.iso.date("Enter a valid date"),
  note: noteSchema,
});

export type CreateSalaryInput = z.infer<typeof createSalarySchema>;

/** Same shape minus `staffId` — which staff member a configuration row
 * belongs to is never reassigned after creation. */
export const updateSalarySchema = createSalarySchema.omit({ staffId: true });

export type UpdateSalaryInput = z.infer<typeof updateSalarySchema>;

/**
 * A payroll period, given either way: an explicit `fromDate`/`toDate`, or
 * a `year`/`month` pair that stands for that whole calendar month. Payroll
 * used to be month-only; a shop running a fortnight or a custom stretch of
 * days needs the dates, and a month is just the common case of one.
 */
const payrollPeriodSchema = z
  .object({
    staffId: uuidSchema,
    fromDate: z.iso.date("Enter a valid start date").optional(),
    toDate: z.iso.date("Enter a valid end date").optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  })
  .superRefine((data, ctx) => {
    const hasRange = Boolean(data.fromDate && data.toDate);
    const hasMonth = Boolean(data.year && data.month);

    if (!hasRange && !hasMonth) {
      ctx.addIssue({
        code: "custom",
        path: ["fromDate"],
        message: "Choose a period — either a month or a start and end date",
      });
      return;
    }

    if (hasRange && data.toDate! < data.fromDate!) {
      ctx.addIssue({
        code: "custom",
        path: ["toDate"],
        message: "The end date cannot be before the start date",
      });
    }
  });

export const calculateSalaryQuerySchema = payrollPeriodSchema;
export type CalculateSalaryQuery = z.infer<typeof calculateSalaryQuerySchema>;

export const generatePayslipSchema = payrollPeriodSchema;
export type GeneratePayslipInput = z.infer<typeof generatePayslipSchema>;

export const payslipListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  staffId: optionalUuidSchema.catch(undefined),
});

export type PayslipListQuery = z.infer<typeof payslipListQuerySchema>;

/**
 * Turns either shape of `payrollPeriodSchema` into the range the services
 * work in. Kept next to the schema so route handlers never re-derive a
 * month's bounds themselves.
 */
export function resolvePayrollRange(input: {
  fromDate?: string;
  toDate?: string;
  year?: number;
  month?: number;
}): { fromDate: string; toDate: string } {
  if (input.fromDate && input.toDate) {
    return { fromDate: input.fromDate, toDate: input.toDate };
  }

  const year = input.year!;
  const month = input.month!;
  const pad = (value: number) => String(value).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    fromDate: `${year}-${pad(month)}-01`,
    toDate: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}
