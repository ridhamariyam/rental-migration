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
 * Salary configuration for a staff member (doc §18). `weeklyOffDay` is
 * `0`–`6` (Sunday–Saturday) for the one day/week that's never a working
 * day, or `null` for no weekly off — this is what makes the working-days
 * count for a given month come out to 26 or 27 automatically instead of a
 * manually-typed static number (see `calculateSalary`).
 */
export const createSalarySchema = z.object({
  staffId: uuidSchema,
  amount: positiveMoneySchema,
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
  overtimeRatePerHour: optionalMoneySchema,
  effectiveDate: z.iso.date("Enter a valid date"),
  note: noteSchema,
});

export type CreateSalaryInput = z.infer<typeof createSalarySchema>;

/** Same shape minus `staffId` — which staff member a configuration row
 * belongs to is never reassigned after creation. */
export const updateSalarySchema = createSalarySchema.omit({ staffId: true });

export type UpdateSalaryInput = z.infer<typeof updateSalarySchema>;

export const calculateSalaryQuerySchema = z.object({
  staffId: uuidSchema,
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type CalculateSalaryQuery = z.infer<typeof calculateSalaryQuerySchema>;

export const generatePayslipSchema = z.object({
  staffId: uuidSchema,
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type GeneratePayslipInput = z.infer<typeof generatePayslipSchema>;

export const payslipListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  staffId: optionalUuidSchema.catch(undefined),
});

export type PayslipListQuery = z.infer<typeof payslipListQuerySchema>;
