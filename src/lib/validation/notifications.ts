import { z } from "zod";
import { NOTIFICATION_EVENTS } from "@/lib/notifications";
import { uuidSchema } from "@/lib/validation/common";

export const notificationStatusFilterValues = [
  "all",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "cancelled",
] as const;

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(notificationStatusFilterValues).catch("all"),
  event: z.enum(["all", ...NOTIFICATION_EVENTS]).catch("all"),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const syncWhatsappNumbersSchema = z.object({
  integratedNumber: z.string().trim().min(10).max(30).optional(),
});

export const defaultWhatsappNumberSchema = z.object({ id: uuidSchema });

export const syncWhatsappTemplatesSchema = z.object({
  whatsappNumberId: uuidSchema.optional(),
});

const variableMappingSchema = z.record(
  z.string().trim().min(1).max(40),
  z.string().trim().min(1).max(80),
);

export const notificationRuleInputSchema = z.object({
  event: z.enum(NOTIFICATION_EVENTS),
  isEnabled: z.boolean(),
  whatsappNumberId: uuidSchema.nullable().optional(),
  templateId: uuidSchema.nullable().optional(),
  scheduleOffsetMinutes: z.coerce.number().int().min(-10080).max(10080),
  variableMapping: variableMappingSchema,
  repeatLimit: z.coerce.number().int().min(0).max(30).default(0),
});

export const updateNotificationRulesSchema = z.object({
  rules: z.array(notificationRuleInputSchema),
});

export const retryNotificationParamSchema = z.object({ id: uuidSchema });
