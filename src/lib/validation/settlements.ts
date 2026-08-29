import { z } from "zod";
import { optionalUuidSchema } from "@/lib/validation/common";

export const settlementIdParamSchema = z.object({ id: z.uuid("Invalid identifier") });

const SETTLEMENT_STATUS_FILTER_VALUES = [
  "all",
  "pending",
  "paid",
  "cancelled",
] as const;

/** Same `.catch(default)` discipline as every other `*ListQuerySchema` in
 * this app — a malformed value from a stale bookmark degrades to the
 * default instead of throwing/422-ing. */
export const settlementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  status: z.enum(SETTLEMENT_STATUS_FILTER_VALUES).catch("all"),
  outletId: optionalUuidSchema.catch(undefined),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .catch(undefined),
});

export type SettlementListQuery = z.infer<typeof settlementListQuerySchema>;

/** Marks a pending settlement as paid out to the owner — a reference
 * number/note are both optional (not every payout method has one, e.g.
 * handing over cash), mirroring the legacy `SettlementPayout` schema. */
export const markSettlementPaidSchema = z.object({
  paymentReference: z
    .string()
    .trim()
    .max(100, "Must be at most 100 characters")
    .optional(),
  note: z
    .string()
    .trim()
    .max(500, "Must be at most 500 characters")
    .optional(),
});

export type MarkSettlementPaidInput = z.infer<typeof markSettlementPaidSchema>;
