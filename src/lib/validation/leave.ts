import { z } from "zod";
import { optionalUuidSchema, uuidSchema } from "@/lib/validation/common";

export const leaveIdParamSchema = z.object({ id: uuidSchema });

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required")
  .max(1000, "Reason must be at most 1000 characters");

/**
 * A staff member requests their own leave by omitting `staffId` (resolved
 * to the caller in `src/server/leave/service.ts`); recording it on someone
 * else's behalf requires `LEAVE_MANAGE`.
 */
export const createLeaveSchema = z
  .object({
    staffId: optionalUuidSchema,
    fromDate: z.iso.date("Enter a valid date"),
    toDate: z.iso.date("Enter a valid date"),
    reason: reasonSchema,
  })
  .superRefine((data, ctx) => {
    if (data.toDate < data.fromDate) {
      ctx.addIssue({
        code: "custom",
        path: ["toDate"],
        message: "End date cannot precede the start date",
      });
    }
  });

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;

const LEAVE_STATUS_FILTER_VALUES = [
  "all",
  "pending",
  "approved",
  "rejected",
] as const;

export const leaveListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  status: z.enum(LEAVE_STATUS_FILTER_VALUES).catch("all"),
  staffId: optionalUuidSchema.catch(undefined),
});

export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;

/** Approve or reject a pending request — never used to reset one back to
 * `pending`, which isn't a real workflow step. */
export const decideLeaveSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export type DecideLeaveInput = z.infer<typeof decideLeaveSchema>;
