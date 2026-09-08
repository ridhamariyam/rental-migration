import "server-only";

import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  bookingItems,
  bookings,
  customers,
  notificationLogs,
  notificationRules,
  outlets,
  payments,
  productVariations,
  products,
  shops,
  whatsappNumbers,
  whatsappTemplates,
  type Booking,
  type BookingItem,
  type NotificationLog,
  type NotificationRule,
  type WhatsappNumber,
  type WhatsappTemplate,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors/app-error";
import { formatDate, formatMoney, parseDateString } from "@/lib/format";
import { addMoney, ZERO_MONEY } from "@/lib/money";
import {
  DEFAULT_ENABLED_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENTS,
  buildTemplateComponents,
  normalizeWhatsAppPhone,
  type NotificationEvent,
} from "@/lib/notifications";
import type {
  NotificationListQuery,
  updateNotificationRulesSchema,
} from "@/lib/validation/notifications";
import { computePaymentSummary } from "@/server/payments/service";
import { Msg91Client } from "@/server/notifications/msg91";

const MAX_ATTEMPTS = 5;
const DEFAULT_REMINDER_HOUR = 10;

type NotificationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | NotificationTx;
type RuleInput = (typeof updateNotificationRulesSchema._output)["rules"][number];

export type NotificationRuleView = NotificationRule & {
  templateName: string | null;
  templateLanguage: string | null;
  integratedNumber: string | null;
};

export type NotificationLogView = NotificationLog & {
  customerName: string | null;
  bookingNumber: string | null;
};

export type NotificationListResult = {
  items: NotificationLogView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type NotificationDashboard = {
  stats: Record<"queued" | "sent" | "failed", number>;
  numbers: WhatsappNumber[];
  templates: WhatsappTemplate[];
  rules: NotificationRuleView[];
  logs: NotificationListResult;
};

function atLocalHour(dateString: string, hour = DEFAULT_REMINDER_HOUR): Date {
  const date = parseDateString(dateString);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function offsetDate(base: Date | null | undefined, minutes: number): Date | null {
  if (!base && minutes === 0) return null;
  const start = base ? new Date(base) : new Date();
  start.setMinutes(start.getMinutes() + minutes);
  return start;
}

async function getDefaultNumber(shopId: string, database: DbOrTx = db) {
  const [number] = await database
    .select()
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.shopId, shopId), eq(whatsappNumbers.isDefault, true)))
    .limit(1);

  return number ?? null;
}

export async function ensureDefaultNotificationRules(
  shopId: string,
  database: DbOrTx = db,
): Promise<void> {
  const existing = await database
    .select({ event: notificationRules.event })
    .from(notificationRules)
    .where(eq(notificationRules.shopId, shopId));
  const existingEvents = new Set(existing.map((row) => row.event));

  const rows = NOTIFICATION_EVENTS.filter((event) => !existingEvents.has(event)).map(
    (event) => ({
      shopId,
      event,
      isEnabled: DEFAULT_ENABLED_NOTIFICATION_EVENTS.has(event),
      scheduleOffsetMinutes: 0,
      repeatLimit: event === "overdue_reminder" ? 3 : 0,
      variableMapping: {},
    }),
  );

  if (rows.length > 0) {
    await database.insert(notificationRules).values(rows);
  }
}

export async function listNotificationRules(
  shopId: string,
): Promise<NotificationRuleView[]> {
  await ensureDefaultNotificationRules(shopId);

  return db
    .select({
      id: notificationRules.id,
      shopId: notificationRules.shopId,
      event: notificationRules.event,
      whatsappNumberId: notificationRules.whatsappNumberId,
      templateId: notificationRules.templateId,
      isEnabled: notificationRules.isEnabled,
      scheduleOffsetMinutes: notificationRules.scheduleOffsetMinutes,
      variableMapping: notificationRules.variableMapping,
      repeatLimit: notificationRules.repeatLimit,
      createdAt: notificationRules.createdAt,
      updatedAt: notificationRules.updatedAt,
      templateName: whatsappTemplates.name,
      templateLanguage: whatsappTemplates.language,
      integratedNumber: whatsappNumbers.integratedNumber,
    })
    .from(notificationRules)
    .leftJoin(whatsappTemplates, eq(notificationRules.templateId, whatsappTemplates.id))
    .leftJoin(whatsappNumbers, eq(notificationRules.whatsappNumberId, whatsappNumbers.id))
    .where(eq(notificationRules.shopId, shopId))
    .orderBy(notificationRules.event);
}

export async function updateNotificationRules(
  shopId: string,
  rules: RuleInput[],
): Promise<NotificationRuleView[]> {
  await ensureDefaultNotificationRules(shopId);

  await db.transaction(async (tx) => {
    for (const rule of rules) {
      if (rule.isEnabled && (!rule.whatsappNumberId || !rule.templateId)) {
        throw new AppError("Choose a WhatsApp number and template before enabling a rule", 400);
      }

      if (rule.whatsappNumberId) {
        const [number] = await tx
          .select({ id: whatsappNumbers.id })
          .from(whatsappNumbers)
          .where(
            and(
              eq(whatsappNumbers.id, rule.whatsappNumberId),
              eq(whatsappNumbers.shopId, shopId),
            ),
          )
          .limit(1);
        if (!number) throw AppError.notFound("WhatsApp number not found");
      }

      if (rule.templateId) {
        const [template] = await tx
          .select({ id: whatsappTemplates.id, status: whatsappTemplates.status })
          .from(whatsappTemplates)
          .where(
            and(
              eq(whatsappTemplates.id, rule.templateId),
              eq(whatsappTemplates.shopId, shopId),
            ),
          )
          .limit(1);
        if (!template) throw AppError.notFound("Template not found");
        if (rule.isEnabled && template.status.toLowerCase() !== "approved") {
          throw new AppError("Only approved WhatsApp templates can be enabled", 400);
        }
      }

      await tx
        .update(notificationRules)
        .set({
          isEnabled: rule.isEnabled,
          whatsappNumberId: rule.whatsappNumberId ?? null,
          templateId: rule.templateId ?? null,
          scheduleOffsetMinutes: rule.scheduleOffsetMinutes,
          variableMapping: rule.variableMapping,
          repeatLimit: rule.repeatLimit,
          updatedAt: new Date(),
        })
        .where(and(eq(notificationRules.shopId, shopId), eq(notificationRules.event, rule.event)));
    }
  });

  return listNotificationRules(shopId);
}

export async function listWhatsappNumbers(shopId: string): Promise<WhatsappNumber[]> {
  return db
    .select()
    .from(whatsappNumbers)
    .where(eq(whatsappNumbers.shopId, shopId))
    .orderBy(desc(whatsappNumbers.isDefault), desc(whatsappNumbers.updatedAt));
}

export async function syncWhatsappNumbers(
  shopId: string,
  integratedNumber?: string,
): Promise<WhatsappNumber[]> {
  const now = new Date();
  const client = new Msg91Client();
  const fetched = await client.fetchNumbers();
  const target = integratedNumber
    ? normalizeWhatsAppPhone(integratedNumber, env.WHATSAPP_DEFAULT_COUNTRY_CODE)
    : null;
  const numbers = target
    ? fetched.filter((number) => normalizeWhatsAppPhone(number.integratedNumber, env.WHATSAPP_DEFAULT_COUNTRY_CODE) === target)
    : fetched;

  if (target && numbers.length === 0) {
    numbers.push({
      integratedNumber: target,
      displayName: null,
      wabaId: null,
      metaBusinessId: null,
      status: "not_returned_by_msg91",
      raw: {},
    });
  }

  await db.transaction(async (tx) => {
    const existingDefault = await getDefaultNumber(shopId, tx);
    for (const number of numbers) {
      const normalized = normalizeWhatsAppPhone(
        number.integratedNumber,
        env.WHATSAPP_DEFAULT_COUNTRY_CODE,
      );
      const [existing] = await tx
        .select({ id: whatsappNumbers.id, isDefault: whatsappNumbers.isDefault })
        .from(whatsappNumbers)
        .where(
          and(
            eq(whatsappNumbers.shopId, shopId),
            eq(whatsappNumbers.integratedNumber, normalized),
          ),
        )
        .limit(1);

      const values = {
        shopId,
        integratedNumber: normalized,
        displayName: number.displayName,
        wabaId: number.wabaId,
        metaBusinessId: number.metaBusinessId,
        status: number.status,
        rawPayload: number.raw,
        isDefault: existing?.isDefault ?? !existingDefault,
        lastSyncedAt: now,
        updatedAt: now,
      };

      if (existing) {
        await tx.update(whatsappNumbers).set(values).where(eq(whatsappNumbers.id, existing.id));
      } else {
        await tx.insert(whatsappNumbers).values(values);
      }
    }
  });

  return listWhatsappNumbers(shopId);
}

export async function setDefaultWhatsappNumber(
  shopId: string,
  id: string,
): Promise<WhatsappNumber> {
  const [number] = await db
    .select()
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.id, id), eq(whatsappNumbers.shopId, shopId)))
    .limit(1);
  if (!number) throw AppError.notFound("WhatsApp number not found");

  await db.transaction(async (tx) => {
    await tx
      .update(whatsappNumbers)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(whatsappNumbers.shopId, shopId));
    await tx
      .update(whatsappNumbers)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(whatsappNumbers.id, id));
  });

  return { ...number, isDefault: true };
}

export async function listWhatsappTemplates(shopId: string): Promise<WhatsappTemplate[]> {
  return db
    .select()
    .from(whatsappTemplates)
    .where(eq(whatsappTemplates.shopId, shopId))
    .orderBy(whatsappTemplates.name, whatsappTemplates.language);
}

export async function syncWhatsappTemplates(
  shopId: string,
  whatsappNumberId?: string,
): Promise<WhatsappTemplate[]> {
  const number = whatsappNumberId
    ? (
        await db
          .select()
          .from(whatsappNumbers)
          .where(and(eq(whatsappNumbers.id, whatsappNumberId), eq(whatsappNumbers.shopId, shopId)))
          .limit(1)
      )[0]
    : await getDefaultNumber(shopId);

  if (!number) {
    throw new AppError("Connect a WhatsApp number before syncing templates", 400);
  }

  const now = new Date();
  const client = new Msg91Client();
  const templates = await client.fetchTemplates(number.integratedNumber);

  await db.transaction(async (tx) => {
    for (const template of templates) {
      const [existing] = await tx
        .select({ id: whatsappTemplates.id })
        .from(whatsappTemplates)
        .where(
          and(
            eq(whatsappTemplates.shopId, shopId),
            eq(whatsappTemplates.integratedNumber, number.integratedNumber),
            eq(whatsappTemplates.name, template.name),
            eq(whatsappTemplates.language, template.language),
          ),
        )
        .limit(1);

      const values = {
        shopId,
        whatsappNumberId: number.id,
        integratedNumber: number.integratedNumber,
        name: template.name,
        namespace: template.namespace,
        language: template.language,
        category: template.category,
        status: template.status,
        body: template.body,
        components: template.components,
        variableSlots: template.variableSlots,
        rawPayload: template.raw,
        lastSyncedAt: now,
        updatedAt: now,
      };

      if (existing) {
        await tx.update(whatsappTemplates).set(values).where(eq(whatsappTemplates.id, existing.id));
      } else {
        await tx.insert(whatsappTemplates).values(values);
      }
    }
  });

  return listWhatsappTemplates(shopId);
}

export async function listNotificationLogs(
  shopId: string,
  query: NotificationListQuery,
): Promise<NotificationListResult> {
  const conditions = [eq(notificationLogs.shopId, shopId)];
  if (query.status !== "all") conditions.push(eq(notificationLogs.status, query.status));
  if (query.event !== "all") conditions.push(eq(notificationLogs.event, query.event));
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(
      or(
        ilike(notificationLogs.recipientName, pattern),
        ilike(notificationLogs.recipientPhone, pattern),
        ilike(notificationLogs.templateName, pattern),
        ilike(bookings.bookingNumber, pattern),
      )!,
    );
  }

  const where = and(...conditions);
  const [totalRow, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(notificationLogs)
      .leftJoin(bookings, eq(notificationLogs.bookingId, bookings.id))
      .where(where),
    db
      .select({
        id: notificationLogs.id,
        shopId: notificationLogs.shopId,
        bookingId: notificationLogs.bookingId,
        recipientPhone: notificationLogs.recipientPhone,
        recipientName: notificationLogs.recipientName,
        event: notificationLogs.event,
        whatsappNumberId: notificationLogs.whatsappNumberId,
        templateId: notificationLogs.templateId,
        integratedNumber: notificationLogs.integratedNumber,
        templateName: notificationLogs.templateName,
        templateNamespace: notificationLogs.templateNamespace,
        templateLanguage: notificationLogs.templateLanguage,
        components: notificationLogs.components,
        payload: notificationLogs.payload,
        status: notificationLogs.status,
        scheduledFor: notificationLogs.scheduledFor,
        sentAt: notificationLogs.sentAt,
        deliveredAt: notificationLogs.deliveredAt,
        readAt: notificationLogs.readAt,
        attempts: notificationLogs.attempts,
        lastError: notificationLogs.lastError,
        providerMessageId: notificationLogs.providerMessageId,
        providerRequestId: notificationLogs.providerRequestId,
        crqid: notificationLogs.crqid,
        createdAt: notificationLogs.createdAt,
        updatedAt: notificationLogs.updatedAt,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        bookingNumber: bookings.bookingNumber,
      })
      .from(notificationLogs)
      .leftJoin(bookings, eq(notificationLogs.bookingId, bookings.id))
      .leftJoin(customers, eq(bookings.customerId, customers.id))
      .where(where)
      .orderBy(desc(notificationLogs.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      customerName: row.customerFirstName
        ? `${row.customerFirstName} ${row.customerLastName}`
        : row.recipientName,
    })),
    total: totalRow[0]?.value ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil((totalRow[0]?.value ?? 0) / query.pageSize)),
  };
}

export async function getNotificationDashboard(
  shopId: string,
  query: NotificationListQuery,
): Promise<NotificationDashboard> {
  await ensureDefaultNotificationRules(shopId);
  const [queued, sent, failed, numbers, templates, rules, logs] = await Promise.all([
    db
      .select({ value: count() })
      .from(notificationLogs)
      .where(and(eq(notificationLogs.shopId, shopId), eq(notificationLogs.status, "queued"))),
    db
      .select({ value: count() })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.shopId, shopId),
          inArray(notificationLogs.status, ["sent", "delivered", "read"]),
        ),
      ),
    db
      .select({ value: count() })
      .from(notificationLogs)
      .where(and(eq(notificationLogs.shopId, shopId), eq(notificationLogs.status, "failed"))),
    listWhatsappNumbers(shopId),
    listWhatsappTemplates(shopId),
    listNotificationRules(shopId),
    listNotificationLogs(shopId, query),
  ]);

  return {
    stats: {
      queued: queued[0]?.value ?? 0,
      sent: sent[0]?.value ?? 0,
      failed: failed[0]?.value ?? 0,
    },
    numbers,
    templates,
    rules,
    logs,
  };
}

async function buildBookingContext(
  database: DbOrTx,
  bookingId: string,
  extra: Record<string, string> = {},
): Promise<{
  shopId: string;
  recipientPhone: string;
  recipientName: string;
  values: Record<string, string>;
}> {
  const [row] = await database
    .select({
      booking: bookings,
      shopName: shops.name,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(shops, eq(bookings.shopId, shops.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) throw AppError.notFound("Booking not found");

  // The order's earliest item stands in for "the item" in message
  // variables (product_name/dates) — a multi-item order only gets one
  // set of these, a known simplification (see the doc comment on
  // `queueBookingLifecycleNotifications`).
  const [item] = await database
    .select({
      productName: products.name,
      outletName: outlets.name,
      fromDate: bookingItems.fromDate,
      toDate: bookingItems.toDate,
      damageCharge: bookingItems.damageCharge,
      depositRefunded: bookingItems.depositRefunded,
    })
    .from(bookingItems)
    .innerJoin(products, eq(bookingItems.productId, products.id))
    .leftJoin(outlets, eq(bookingItems.outletId, outlets.id))
    .where(eq(bookingItems.bookingId, bookingId))
    .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id))
    .limit(1);

  const damageRows = await database
    .select({ damageCharge: bookingItems.damageCharge })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId));
  const totalDamageCharge = damageRows.reduce(
    (sum, r) => addMoney(sum, r.damageCharge),
    ZERO_MONEY,
  );

  const paymentRows = await database
    .select()
    .from(payments)
    .where(eq(payments.bookingId, bookingId));
  const summary = computePaymentSummary(row.booking, totalDamageCharge, paymentRows);
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const recipientName = `${row.customerFirstName} ${row.customerLastName}`;

  return {
    shopId: row.booking.shopId,
    recipientPhone: normalizeWhatsAppPhone(
      row.customerPhone,
      env.WHATSAPP_DEFAULT_COUNTRY_CODE,
    ),
    recipientName,
    values: {
      customer_name: recipientName,
      booking_number: row.booking.bookingNumber,
      product_name: item?.productName ?? "",
      from_date: item ? formatDate(item.fromDate) : "",
      to_date: item ? formatDate(item.toDate) : "",
      outstanding: formatMoney(summary.outstanding),
      shop_name: row.shopName,
      receipt_url: `${appUrl}/dashboard/bookings/${row.booking.id}/receipt`,
      damage_charge: formatMoney(totalDamageCharge),
      deposit_refunded: formatMoney(item?.depositRefunded ?? ZERO_MONEY),
      outlet_name: item?.outletName ?? row.shopName,
      ...extra,
    },
  };
}

export async function queueBookingNotification(
  database: DbOrTx,
  booking: Pick<Booking, "id" | "shopId">,
  event: NotificationEvent,
  options: {
    scheduledFor?: Date | null;
    extraContext?: Record<string, string>;
  } = {},
): Promise<NotificationLog | null> {
  await ensureDefaultNotificationRules(booking.shopId, database);

  const [rule] = await database
    .select()
    .from(notificationRules)
    .where(and(eq(notificationRules.shopId, booking.shopId), eq(notificationRules.event, event)))
    .limit(1);

  if (!rule?.isEnabled || !rule.templateId || !rule.whatsappNumberId) return null;

  const [number] = await database
    .select()
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.id, rule.whatsappNumberId), eq(whatsappNumbers.shopId, booking.shopId)))
    .limit(1);
  const [template] = await database
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.id, rule.templateId), eq(whatsappTemplates.shopId, booking.shopId)))
    .limit(1);

  if (!number || !template || template.status.toLowerCase() !== "approved") return null;

  const [existing] = await database
    .select()
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.shopId, booking.shopId),
        eq(notificationLogs.bookingId, booking.id),
        eq(notificationLogs.event, event),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const context = await buildBookingContext(database, booking.id, options.extraContext);
  const components = buildTemplateComponents(rule.variableMapping, context.values);
  const logId = randomUUID();
  const scheduledFor = offsetDate(options.scheduledFor, rule.scheduleOffsetMinutes);

  const [log] = await database
    .insert(notificationLogs)
    .values({
      id: logId,
      shopId: booking.shopId,
      bookingId: booking.id,
      recipientPhone: context.recipientPhone,
      recipientName: context.recipientName,
      event,
      whatsappNumberId: number.id,
      templateId: template.id,
      integratedNumber: number.integratedNumber,
      templateName: template.name,
      templateNamespace: template.namespace,
      templateLanguage: template.language,
      components,
      payload: { context: context.values },
      status: "queued",
      scheduledFor,
      crqid: logId.replace(/-/g, "").slice(0, 52),
    })
    .returning();

  return log;
}

/**
 * Schedules the lifecycle reminders for one order, based on one item's own
 * pickup/return dates — called once per item created (in
 * `src/server/bookings/service.ts`), but every event dedupes per *order*
 * (not per item, see `notification_logs.bookingId`'s doc comment), so only
 * the first item processed actually gets its dates used. A multi-item
 * order whose items have different dates only gets reminders for that
 * first item — a known simplification, not a full per-item scheduler.
 */
export async function queueBookingLifecycleNotifications(
  database: DbOrTx,
  booking: Pick<Booking, "id" | "shopId">,
  item: Pick<BookingItem, "fromDate" | "toDate">,
): Promise<void> {
  await queueBookingNotification(database, booking, "booking_created");
  await queueBookingNotification(database, booking, "pickup_reminder", {
    scheduledFor: addDays(atLocalHour(item.fromDate), -1),
  });
  await queueBookingNotification(database, booking, "pickup_today", {
    scheduledFor: atLocalHour(item.fromDate),
  });
  await queueBookingNotification(database, booking, "return_reminder", {
    scheduledFor: addDays(atLocalHour(item.toDate), -1),
  });
  await queueBookingNotification(database, booking, "return_due_today", {
    scheduledFor: atLocalHour(item.toDate),
  });
}

type OwnerNotificationEvent = "owner_item_booked" | "owner_item_cancelled";

/**
 * Builds the notification context for a customer-owned item's *owner*
 * (`product_variations.ownershipType === "customer_owned"`) — a different
 * recipient from `buildBookingContext`'s renting customer. Returns `null`
 * for a shop-owned item or an owner with no phone on file, so callers can
 * silently skip queueing rather than special-casing every call site.
 * Scoped to one specific item (ownership is a per-variation concern) —
 * dedup is still per-order+event, so a second customer-owned item added to
 * the same order won't get its own separate owner notification.
 */
async function buildOwnerBookingContext(
  database: DbOrTx,
  bookingId: string,
  itemId: string,
): Promise<{
  shopId: string;
  recipientPhone: string;
  recipientName: string;
  values: Record<string, string>;
} | null> {
  const [row] = await database
    .select({
      booking: bookings,
      shopName: shops.name,
      outletName: outlets.name,
      fromDate: bookingItems.fromDate,
      toDate: bookingItems.toDate,
      productName: products.name,
      ownershipType: productVariations.ownershipType,
      ownerName: productVariations.ownerName,
      ownerPhone: productVariations.ownerPhone,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .innerJoin(shops, eq(bookings.shopId, shops.id))
    .innerJoin(products, eq(bookingItems.productId, products.id))
    .innerJoin(
      productVariations,
      eq(bookingItems.variationId, productVariations.id),
    )
    .leftJoin(outlets, eq(bookingItems.outletId, outlets.id))
    .where(and(eq(bookingItems.id, itemId), eq(bookingItems.bookingId, bookingId)))
    .limit(1);

  if (!row) throw AppError.notFound("Booking item not found");
  if (row.ownershipType !== "customer_owned" || !row.ownerPhone) return null;

  const recipientName = row.ownerName || "Owner";

  return {
    shopId: row.booking.shopId,
    recipientPhone: normalizeWhatsAppPhone(
      row.ownerPhone,
      env.WHATSAPP_DEFAULT_COUNTRY_CODE,
    ),
    recipientName,
    values: {
      owner_name: recipientName,
      booking_number: row.booking.bookingNumber,
      product_name: row.productName,
      from_date: formatDate(row.fromDate),
      to_date: formatDate(row.toDate),
      shop_name: row.shopName,
      outlet_name: row.outletName ?? row.shopName,
    },
  };
}

/**
 * Owner-side counterpart to `queueBookingNotification` — same rule/
 * template/dedupe mechanics, but the recipient is one specific item's
 * owner (via `buildOwnerBookingContext`), not the renting customer.
 * No-ops for a shop-owned item or an owner with no phone on file.
 */
export async function queueOwnerBookingNotification(
  database: DbOrTx,
  booking: Pick<Booking, "id" | "shopId">,
  itemId: string,
  event: OwnerNotificationEvent,
): Promise<NotificationLog | null> {
  await ensureDefaultNotificationRules(booking.shopId, database);

  const [rule] = await database
    .select()
    .from(notificationRules)
    .where(and(eq(notificationRules.shopId, booking.shopId), eq(notificationRules.event, event)))
    .limit(1);

  if (!rule?.isEnabled || !rule.templateId || !rule.whatsappNumberId) return null;

  const context = await buildOwnerBookingContext(database, booking.id, itemId);
  if (!context) return null;

  const [number] = await database
    .select()
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.id, rule.whatsappNumberId), eq(whatsappNumbers.shopId, booking.shopId)))
    .limit(1);
  const [template] = await database
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.id, rule.templateId), eq(whatsappTemplates.shopId, booking.shopId)))
    .limit(1);

  if (!number || !template || template.status.toLowerCase() !== "approved") return null;

  const [existing] = await database
    .select()
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.shopId, booking.shopId),
        eq(notificationLogs.bookingId, booking.id),
        eq(notificationLogs.event, event),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const components = buildTemplateComponents(rule.variableMapping, context.values);
  const logId = randomUUID();

  const [log] = await database
    .insert(notificationLogs)
    .values({
      id: logId,
      shopId: booking.shopId,
      bookingId: booking.id,
      recipientPhone: context.recipientPhone,
      recipientName: context.recipientName,
      event,
      whatsappNumberId: number.id,
      templateId: template.id,
      integratedNumber: number.integratedNumber,
      templateName: template.name,
      templateNamespace: template.namespace,
      templateLanguage: template.language,
      components,
      payload: { context: context.values },
      status: "queued",
      scheduledFor: offsetDate(null, rule.scheduleOffsetMinutes),
      crqid: logId.replace(/-/g, "").slice(0, 52),
    })
    .returning();

  return log;
}

export async function retryNotification(
  shopId: string,
  id: string,
): Promise<NotificationLog> {
  const [log] = await db
    .update(notificationLogs)
    .set({ status: "queued", attempts: 0, lastError: null, updatedAt: new Date() })
    .where(and(eq(notificationLogs.id, id), eq(notificationLogs.shopId, shopId)))
    .returning();

  if (!log) throw AppError.notFound("Notification not found");
  return log;
}

/**
 * Moves up to `limit` due rows from `queued` to `sending` and returns them.
 * The claim is a single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP
 * LOCKED)` rather than a select followed by an update because there are now
 * two dispatchers in play — the cron and the post-commit `after()` nudge —
 * and a read-then-write gap between them would let both claim the same row
 * and send the customer the same WhatsApp message twice.
 */
async function claimDueNotifications(
  now: Date,
  bookingId: string | null,
  limit: number,
): Promise<NotificationLog[]> {
  const due = db
    .select({ id: notificationLogs.id })
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.status, "queued"),
        lte(notificationLogs.attempts, MAX_ATTEMPTS - 1),
        or(isNull(notificationLogs.scheduledFor), lte(notificationLogs.scheduledFor, now)),
        ...(bookingId ? [eq(notificationLogs.bookingId, bookingId)] : []),
      ),
    )
    .orderBy(notificationLogs.createdAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  return db
    .update(notificationLogs)
    .set({
      status: "sending",
      attempts: sql`${notificationLogs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(inArray(notificationLogs.id, due))
    .returning();
}

async function sendClaimedNotifications(claimed: NotificationLog[]): Promise<number> {
  const client = new Msg91Client();

  for (const log of claimed) {
    try {
      const result = await client.sendTemplate({
        integratedNumber: log.integratedNumber,
        to: log.recipientPhone,
        templateName: log.templateName,
        templateNamespace: log.templateNamespace,
        language: log.templateLanguage,
        components: log.components,
        crqid: log.crqid,
      });

      await db
        .update(notificationLogs)
        .set({
          status: "sent",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          providerRequestId: result.providerRequestId,
          payload: { ...log.payload, provider: result.raw },
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(notificationLogs.id, log.id));
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "MSG91 send failed";
      console.error(`[notifications] ${log.event} ${log.id} failed: ${lastError}`);

      await db
        .update(notificationLogs)
        .set({
          status: "failed",
          lastError,
          updatedAt: new Date(),
        })
        .where(eq(notificationLogs.id, log.id));
    }
  }

  return claimed.length;
}

export async function dispatchDueNotifications(now = new Date()): Promise<number> {
  return sendClaimedNotifications(await claimDueNotifications(now, null, 50));
}

/**
 * Sends one booking's already-queued messages immediately instead of
 * waiting for the next cron tick. Must only be called *after* the
 * transaction that queued them has committed — see `dispatchAfterResponse`.
 * Future-dated reminders are left untouched by the `scheduledFor` filter,
 * so this only ever sends the event that just happened.
 */
export async function dispatchNotificationsForBooking(
  bookingId: string,
): Promise<number> {
  return sendClaimedNotifications(
    await claimDueNotifications(new Date(), bookingId, 10),
  );
}

export async function applyMsg91Webhook(payload: Record<string, unknown>): Promise<void> {
  const crqid = String(payload.CRQID ?? payload.crqid ?? "").trim();
  const providerMessageId = String(payload.message_uuid ?? payload.message_id ?? "").trim();
  const providerRequestId = String(payload.request_id ?? payload.campaign_request_id ?? "").trim();
  const status = String(payload.status ?? "").toLowerCase();

  const nextStatus =
    status.includes("read")
      ? "read"
      : status.includes("deliver")
        ? "delivered"
        : status.includes("fail")
          ? "failed"
          : status.includes("sent") || status.includes("submitted")
            ? "sent"
            : null;

  if (!nextStatus) return;

  const where = crqid
    ? eq(notificationLogs.crqid, crqid)
    : providerMessageId
      ? eq(notificationLogs.providerMessageId, providerMessageId)
      : providerRequestId
        ? eq(notificationLogs.providerRequestId, providerRequestId)
        : null;
  if (!where) return;

  await db
    .update(notificationLogs)
    .set({
      status: nextStatus,
      deliveredAt: nextStatus === "delivered" ? new Date() : undefined,
      readAt: nextStatus === "read" ? new Date() : undefined,
      lastError: nextStatus === "failed" ? JSON.stringify(payload).slice(0, 1000) : null,
      payload,
      updatedAt: new Date(),
    })
    .where(where);
}
