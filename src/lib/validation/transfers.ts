import { z } from "zod";

export const TRANSFER_STATUS_FILTER_VALUES = [
  "all",
  "in_transit",
  "received",
  "cancelled",
] as const;

export const transferListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  status: z.enum(TRANSFER_STATUS_FILTER_VALUES).catch("all"),
  /** `mine` = waiting for the signed-in user to receive. */
  view: z.enum(["all", "mine"]).catch("all"),
});

export type TransferListQuery = z.infer<typeof transferListQuerySchema>;

export const createTransferSchema = z.object({
  variationId: z.uuid("Pick the item to transfer"),
  toOutletId: z.uuid("Pick the outlet it's going to"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Transfer at least one unit"),
  assignedToId: z.uuid("Pick who will receive it"),
  notes: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
