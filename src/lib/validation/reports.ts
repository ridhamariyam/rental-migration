import { z } from "zod";
import { optionalUuidSchema } from "@/lib/validation/common";

/** Blank is fine (each report has its own sensible default range), a
 * non-empty value must be a real calendar date — same `.refine()` pattern
 * `optionalPhoneSchema`/`optionalMoneySchema` use, so the schema's input
 * and output types stay identical for the routes that `.parse()` this
 * directly off `URLSearchParams` (no `useForm`/`zodResolver` involved here,
 * every report filter is a plain GET query string). */
const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || z.iso.date().safeParse(value).success, {
    message: "Enter a valid date",
  });

/** Shared by every report that filters on a `fromDate`/`toDate` window
 * (daily income, most-rented, revenue-by-outlet, staff performance) —
 * each service function fills in its own default window when either side
 * is left blank, mirroring the legacy `ReportService`'s own per-report
 * defaults. */
export const reportDateRangeQuerySchema = z
  .object({
    fromDate: optionalDateSchema,
    toDate: optionalDateSchema,
    outletId: optionalUuidSchema,
  })
  .superRefine((data, ctx) => {
    if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
      ctx.addIssue({
        code: "custom",
        path: ["toDate"],
        message: "End date cannot precede the start date",
      });
    }
  });

export type ReportDateRangeQuery = z.infer<typeof reportDateRangeQuerySchema>;

export const dashboardQuerySchema = z.object({
  outletId: optionalUuidSchema,
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const monthlyIncomeQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).catch(new Date().getFullYear()),
  outletId: optionalUuidSchema,
});

export type MonthlyIncomeQuery = z.infer<typeof monthlyIncomeQuerySchema>;

export const mostRentedQuerySchema = reportDateRangeQuerySchema.and(
  z.object({
    limit: z.coerce.number().int().min(1).max(50).catch(10),
  }),
);

export type MostRentedQuery = z.infer<typeof mostRentedQuerySchema>;

/** Same shape as `mostRentedQuerySchema` — the "not rented" report is its
 * inverse (zero bookings in the window instead of the most), so it takes
 * the same date-range/outlet/limit filters. */
export const notRentedQuerySchema = mostRentedQuerySchema;

export type NotRentedQuery = MostRentedQuery;

const PENDING_LIST_KIND_VALUES = ["returns", "deposits"] as const;

/** Shared by the "currently out" lists (pending returns / deposits held) —
 * both are the same underlying "picked up, not yet returned" set of
 * bookings, just sorted/filtered slightly differently, so one paginated
 * query schema covers both (see `src/server/reports/service.ts`'s
 * `listActiveBookings`). */
export const activeBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  outletId: optionalUuidSchema,
  kind: z.enum(PENDING_LIST_KIND_VALUES).catch("returns"),
});

export type ActiveBookingsQuery = z.infer<typeof activeBookingsQuerySchema>;
