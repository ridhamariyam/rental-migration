import { z } from "zod";
import { optionalUuidSchema, uuidSchema } from "@/lib/validation/common";
import { positiveMoneySchema } from "@/lib/validation/payments";

export const salaryIdParamSchema = z.object({ id: uuidSchema });

const noteSchema = z
  .string()
  .trim()
  .max(500, "Note must be at most 500 characters")
  .optional();

/**
 * Salary configuration for a staff member (doc §18), mirroring the legacy
 * backend's own bounds (`working_days_per_month` between 1 and 31 — a
 * calendar month never has more than 31 days, and 0 would divide by zero
 * deriving a per-day rate).
 */
export const createSalarySchema = z.object({
  staffId: uuidSchema,
  amount: positiveMoneySchema,
  // Deliberately `z.number()`, not `z.coerce.number()` — the form field
  // is a `type="number"` input registered with `valueAsNumber: true`
  // (`add-salary-dialog.tsx`), so it's already a real `number` by the time
  // it reaches this schema. `.coerce` here would give the schema a
  // different input/output type (`unknown` vs `number`), which breaks
  // `zodResolver`'s generic when the same inferred type also drives
  // `useForm<CreateSalaryInput>`.
  workingDaysPerMonth: z
    .number("Must be a number")
    .int("Must be a whole number")
    .min(1, "Must be at least 1")
    .max(31, "Must be at most 31"),
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
