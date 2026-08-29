import { z } from "zod";
import { optionalUuidSchema } from "@/lib/validation/common";

const ACTION_FILTER_MAX_LENGTH = 100;
const ENTITY_TYPE_FILTER_MAX_LENGTH = 60;

/** Every list filter here is optional and narrowing-only — a blank value
 * simply means "don't filter on this", same `.catch(default)` discipline
 * as every other `*ListQuerySchema` in this app. */
export const auditLogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  action: z
    .string()
    .trim()
    .max(ACTION_FILTER_MAX_LENGTH)
    .optional()
    .catch(undefined),
  entityType: z
    .string()
    .trim()
    .max(ENTITY_TYPE_FILTER_MAX_LENGTH)
    .optional()
    .catch(undefined),
  userId: optionalUuidSchema.catch(undefined),
  fromDate: z.iso.date().optional().catch(undefined),
  toDate: z.iso.date().optional().catch(undefined),
});

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
