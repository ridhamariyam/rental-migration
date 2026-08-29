import { z } from "zod";
import {
  nameSchema,
  optionalEmailSchema,
  phoneSchema,
  uuidSchema,
} from "@/lib/validation/common";

export const customerIdParamSchema = z.object({ id: uuidSchema });

const CUSTOMER_STATUS_VALUES = ["all", "active", "archived"] as const;

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z
    .string()
    .trim()
    .max(100, "Search is too long")
    .optional()
    .catch(undefined),
  status: z.enum(CUSTOMER_STATUS_VALUES).catch("all"),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

const preferredSizeSchema = z
  .string()
  .trim()
  .max(50, "Must be at most 50 characters")
  .optional();

const notesSchema = z
  .string()
  .trim()
  .max(2000, "Must be at most 2000 characters")
  .optional();

export const customerFormSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema,
  email: optionalEmailSchema,
  preferredSize: preferredSizeSchema,
  notes: notesSchema,
});

export type CustomerFormInput = z.infer<typeof customerFormSchema>;

export const customerStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;
