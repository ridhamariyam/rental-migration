import { z } from "zod";
import { optionalUuidSchema, uuidSchema } from "@/lib/validation/common";

export const maintenanceTaskIdParamSchema = z.object({ id: uuidSchema });

const MAINTENANCE_STATUS_FILTER_VALUES = [
  "all",
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

const MAINTENANCE_TYPE_FILTER_VALUES = [
  "all",
  "cleaning",
  "maintenance",
] as const;

/**
 * Same `.catch(default)` discipline as every other `*ListQuerySchema` in
 * this app (see the repo notes' "List query schema convention") — a
 * malformed value from a stale bookmark degrades to the default instead of
 * throwing/422-ing.
 */
export const maintenanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(100, "Search is too long")
    .optional()
    .catch(undefined),
  status: z.enum(MAINTENANCE_STATUS_FILTER_VALUES).catch("all"),
  taskType: z.enum(MAINTENANCE_TYPE_FILTER_VALUES).catch("all"),
  // A malformed value here degrades to "no outlet filter" rather than
  // 500ing the list page — same `.catch()` discipline as `page`/`pageSize`.
  outletId: optionalUuidSchema.catch(undefined),
});

export type MaintenanceListQuery = z.infer<typeof maintenanceListQuerySchema>;

const notesSchema = z
  .string()
  .trim()
  .max(1000, "Notes must be at most 1000 characters")
  .optional();

/**
 * Manual "log a task" creation — for damage/wear found outside a return
 * (e.g. a routine shelf check), not the automatic pair `returnBooking()`
 * opens. `variationId` is required; `barcode` lets the counter scan
 * instead of searching, mirroring the booking/pickup pickers.
 */
export const createMaintenanceTaskSchema = z
  .object({
    variationId: optionalUuidSchema,
    barcode: z.string().trim().max(50).optional(),
    taskType: z.enum(["cleaning", "maintenance"]),
    notes: notesSchema,
  })
  .superRefine((data, ctx) => {
    if (!data.variationId && !data.barcode) {
      ctx.addIssue({
        code: "custom",
        path: ["barcode"],
        message: "Scan a barcode or choose an item",
      });
    }
  });

export type CreateMaintenanceTaskInput = z.infer<
  typeof createMaintenanceTaskSchema
>;

export const startMaintenanceTaskSchema = z.object({
  assignedToId: optionalUuidSchema,
});

export type StartMaintenanceTaskInput = z.infer<
  typeof startMaintenanceTaskSchema
>;

export const completeMaintenanceTaskSchema = z.object({
  notes: notesSchema,
});

export type CompleteMaintenanceTaskInput = z.infer<
  typeof completeMaintenanceTaskSchema
>;

export const cancelMaintenanceTaskSchema = z.object({
  notes: notesSchema,
});

export type CancelMaintenanceTaskInput = z.infer<
  typeof cancelMaintenanceTaskSchema
>;
