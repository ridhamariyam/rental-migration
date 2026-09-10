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
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { markOverdueItems } from "@/server/bookings/overdue";
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
import { formatDate, formatMoney, parseDateString, toDateString } from "@/lib/format";
import { addMoney, subtractMoneyNonNegative, ZERO_MONEY } from "@/lib/money";
import {
  DEFAULT_ENABLED_NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_SCOPE,
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

export type NotificationRuleView = Omit<NotificationRule, "event"> & {
  event: NotificationEvent;
  templateName: string | null;
  templateLanguage: string | null;
  integratedNumber: string | null;
};

export type NotificationLogView = Omit<NotificationLog, "event"> & {
  event: NotificationEvent;
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
    // The select above is only an optimisation, never a guarantee: two
    // requests for a shop with no rules yet (the first two bookings after
    // signup, or any two concurrent ones) both read an empty set and both
    // insert, colliding on `uq_notification_rules_shop_event` and failing
    // whichever transaction they were seeding. Let the unique index be the
    // arbiter instead of the read.
    await database.insert(notificationRules).values(rows).onConflictDoNothing({
      target: [notificationRules.shopId, notificationRules.event],
    });
  }
}

export async function listNotificationRules(
  shopId: string,
): Promise<NotificationRuleView[]> {
  await ensureDefaultNotificationRules(shopId);

  const rows = await db
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
    // Excludes any pre-2026-09 rows for the now-retired events (see
    // `NOTIFICATION_EVENTS`'s doc comment) — the console should only ever
    // show the 10 events that actually have a template/queue path today.
    .where(
      and(
        eq(notificationRules.shopId, shopId),
        inArray(notificationRules.event, NOTIFICATION_EVENTS),
      ),
    )
    .orderBy(notificationRules.event);

  return rows.map((row) => ({ ...row, event: row.event as NotificationEvent }));
}

export async function updateNotificationRules(
  shopId: string,
  rules: RuleInput[],
): Promise<NotificationRuleView[]> {
  await ensureDefaultNotificationRules(shopId);

  await db.transaction(async (tx) => {
    for (const rule of rules) {
      // The whole array is saved in one PUT (every event's rule, not just
      // the one the operator is currently editing) — an operator setting
      // up templates one event at a time would otherwise never be able to
      // save at all, since every *other*, not-yet-configured event is
      // enabled by default. Silently drop back to disabled instead of
      // rejecting the whole batch; only a rule this call actually leaves
      // enabled has to be fully configured.
      let isEnabled = rule.isEnabled;
      if (isEnabled && (!rule.whatsappNumberId || !rule.templateId)) {
        isEnabled = false;
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
        if (isEnabled && template.status.toLowerCase() !== "approved") {
          isEnabled = false;
        }
      }

      await tx
        .update(notificationRules)
        .set({
          isEnabled,
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
  const conditions = [
    eq(notificationLogs.shopId, shopId),
    // Same reasoning as `listNotificationRules` — a pre-2026-09 log for a
    // now-retired event should never resurface in the console.
    inArray(notificationLogs.event, NOTIFICATION_EVENTS),
  ];
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
        bookingItemId: notificationLogs.bookingItemId,
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
      event: row.event as NotificationEvent,
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

function formatItemLabel(
  productName: string,
  size: string | null,
  color: string | null,
): string {
  const attrs = [size, color].filter((value): value is string => Boolean(value?.trim()));
  return attrs.length > 0 ? `${productName} (${attrs.join(", ")})` : productName;
}

type NotificationTarget = {
  shopId: string;
  recipientPhone: string;
  recipientName: string;
  values: Record<string, string>;
};

type ResolvedRuleTarget = {
  rule: NotificationRule;
  number: WhatsappNumber;
  template: WhatsappTemplate;
};

/** Looks up the enabled rule + connected number + approved template for
 * one shop/event, or `null` if any leg isn't ready to send — the one
 * check every queue function needs before it can build a message. */
async function resolveRuleTarget(
  database: DbOrTx,
  shopId: string,
  event: NotificationEvent,
): Promise<ResolvedRuleTarget | null> {
  const [rule] = await database
    .select()
    .from(notificationRules)
    .where(and(eq(notificationRules.shopId, shopId), eq(notificationRules.event, event)))
    .limit(1);
  if (!rule?.isEnabled || !rule.templateId || !rule.whatsappNumberId) return null;

  const [number] = await database
    .select()
    .from(whatsappNumbers)
    .where(and(eq(whatsappNumbers.id, rule.whatsappNumberId), eq(whatsappNumbers.shopId, shopId)))
    .limit(1);
  const [template] = await database
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.id, rule.templateId), eq(whatsappTemplates.shopId, shopId)))
    .limit(1);
  if (!number || !template || template.status.toLowerCase() !== "approved") return null;

  return { rule, number, template };
}

/** Inserts one queued row — the one write path every queue function ends
 * at, so crqid/component-building/log shape never drifts between them. */
async function insertNotificationLog(
  database: DbOrTx,
  target: ResolvedRuleTarget,
  params: {
    shopId: string;
    bookingId: string;
    bookingItemId: string | null;
    event: NotificationEvent;
    recipientPhone: string;
    recipientName: string;
    values: Record<string, string>;
    scheduledFor: Date | null;
  },
): Promise<NotificationLog> {
  const { rule, number, template } = target;
  const components = buildTemplateComponents(rule.variableMapping, params.values);
  const logId = randomUUID();

  const [log] = await database
    .insert(notificationLogs)
    .values({
      id: logId,
      shopId: params.shopId,
      bookingId: params.bookingId,
      bookingItemId: params.bookingItemId,
      recipientPhone: params.recipientPhone,
      recipientName: params.recipientName,
      event: params.event,
      whatsappNumberId: number.id,
      templateId: template.id,
      integratedNumber: number.integratedNumber,
      templateName: template.name,
      templateNamespace: template.namespace,
      templateLanguage: template.language,
      components,
      payload: { context: params.values },
      status: "queued",
      scheduledFor: params.scheduledFor,
      crqid: logId.replace(/-/g, "").slice(0, 52),
    })
    .returning();

  return log;
}

/**
 * Booking-scoped context (whole-order totals, no specific item) for
 * `booking_confirmed`/`payment_received`/`feedback_request` — the events
 * that fire once per order no matter how many items it has.
 */
async function buildOrderContext(
  database: DbOrTx,
  bookingId: string,
  extra: Record<string, string> = {},
): Promise<NotificationTarget> {
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

  const [firstItem] = await database
    .select({ outletName: outlets.name })
    .from(bookingItems)
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
      booking_date: formatDate(row.booking.createdAt),
      rental_amount: formatMoney(row.booking.totalAmount),
      advance_paid: formatMoney(summary.rentCollected),
      balance_amount: formatMoney(
        subtractMoneyNonNegative(row.booking.totalAmount, summary.rentCollected),
      ),
      outstanding: formatMoney(summary.outstanding),
      shop_name: row.shopName,
      receipt_url: `${appUrl}/dashboard/bookings/${row.booking.id}/receipt`,
      outlet_name: firstItem?.outletName ?? row.shopName,
      ...extra,
    },
  };
}

/**
 * Item-scoped context — one specific `booking_items` row's own product/
 * size/color/dates, for events that fire once per item:
 * `pickup_reminder`/`pickup_confirmed`/`return_reminder`/
 * `overdue_reminder`/`booking_returned`.
 */
async function buildItemContext(
  database: DbOrTx,
  bookingId: string,
  itemId: string,
  extra: Record<string, string> = {},
): Promise<NotificationTarget> {
  const [row] = await database
    .select({
      booking: bookings,
      shopName: shops.name,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      outletName: outlets.name,
      productName: products.name,
      size: productVariations.size,
      color: productVariations.color,
      fromDate: bookingItems.fromDate,
      toDate: bookingItems.toDate,
      damageCharge: bookingItems.damageCharge,
      depositRefunded: bookingItems.depositRefunded,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookingItems.bookingId, bookings.id))
    .innerJoin(shops, eq(bookings.shopId, shops.id))
    .innerJoin(customers, eq(bookings.customerId, customers.id))
    .innerJoin(products, eq(bookingItems.productId, products.id))
    .innerJoin(productVariations, eq(bookingItems.variationId, productVariations.id))
    .leftJoin(outlets, eq(bookingItems.outletId, outlets.id))
    .where(and(eq(bookingItems.id, itemId), eq(bookingItems.bookingId, bookingId)))
    .limit(1);

  if (!row) throw AppError.notFound("Booking item not found");

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
      booking_date: formatDate(row.booking.createdAt),
      item: formatItemLabel(row.productName, row.size, row.color),
      pickup_date: formatDate(row.fromDate),
      return_date: formatDate(row.toDate),
      damage_charge: formatMoney(row.damageCharge),
      deposit_refunded: formatMoney(row.depositRefunded),
      shop_name: row.shopName,
      outlet_name: row.outletName ?? row.shopName,
      ...extra,
    },
  };
}

/**
 * Queues one event for a booking. Booking-scoped events (see
 * `NOTIFICATION_EVENT_SCOPE`) dedupe on `bookingId + event`; item-scoped
 * events dedupe on `bookingId + event + itemId` so a multi-item order gets
 * its own reminder/confirmation per item instead of only ever sending for
 * whichever item happened to queue first. `allowRepeat: true` skips the
 * dedupe check entirely and always inserts a fresh row — for events that
 * can legitimately fire more than once for the same booking/item
 * (`payment_received`, one per payment; `overdue_reminder`, handled by its
 * own `queueOverdueReminders` scan instead of this function).
 */
export async function queueBookingNotification(
  database: DbOrTx,
  booking: Pick<Booking, "id" | "shopId">,
  event: NotificationEvent,
  options: {
    scheduledFor?: Date | null;
    extraContext?: Record<string, string>;
    itemId?: string;
    allowRepeat?: boolean;
  } = {},
): Promise<NotificationLog | null> {
  await ensureDefaultNotificationRules(booking.shopId, database);

  const target = await resolveRuleTarget(database, booking.shopId, event);
  if (!target) return null;

  const scope = NOTIFICATION_EVENT_SCOPE[event];
  if (scope === "item" && !options.itemId) {
    throw new AppError(`"${event}" requires an itemId (item-scoped event)`, 500);
  }
  // Booking-scoped events never key on an item, even if a caller passed
  // one by mistake — keeps dedupe/log shape consistent with the event's
  // declared scope.
  const itemId = scope === "item" ? (options.itemId as string) : null;

  if (!options.allowRepeat) {
    const [existing] = await database
      .select()
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.shopId, booking.shopId),
          eq(notificationLogs.bookingId, booking.id),
          eq(notificationLogs.event, event),
          itemId ? eq(notificationLogs.bookingItemId, itemId) : isNull(notificationLogs.bookingItemId),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }

  const context =
    scope === "item"
      ? await buildItemContext(database, booking.id, itemId as string, options.extraContext)
      : await buildOrderContext(database, booking.id, options.extraContext);

  const scheduledFor = offsetDate(options.scheduledFor, target.rule.scheduleOffsetMinutes);

  return insertNotificationLog(database, target, {
    shopId: booking.shopId,
    bookingId: booking.id,
    bookingItemId: itemId,
    event,
    recipientPhone: context.recipientPhone,
    recipientName: context.recipientName,
    values: context.values,
    scheduledFor,
  });
}

/**
 * Schedules one item's own pickup/return reminders (1 day before each
 * date) — called once per item created, in
 * `src/server/bookings/service.ts`. `booking_confirmed` is queued
 * separately, once per order, by the caller.
 */
export async function queueBookingLifecycleNotifications(
  database: DbOrTx,
  booking: Pick<Booking, "id" | "shopId">,
  item: Pick<BookingItem, "id" | "fromDate" | "toDate">,
): Promise<void> {
  await queueBookingNotification(database, booking, "pickup_reminder", {
    itemId: item.id,
    scheduledFor: addDays(atLocalHour(item.fromDate), -1),
  });
  await queueBookingNotification(database, booking, "return_reminder", {
    itemId: item.id,
    scheduledFor: addDays(atLocalHour(item.toDate), -1),
  });
}

type OwnerNotificationEvent = "owner_item_booked" | "owner_item_cancelled";

/**
 * Builds the notification context for a customer-owned item's *owner*
 * (`product_variations.ownershipType === "customer_owned"`) — a different
 * recipient from `buildItemContext`'s renting customer. Returns `null` for
 * a shop-owned item or an owner with no phone on file, so callers can
 * silently skip queueing rather than special-casing every call site.
 */
async function buildOwnerItemContext(
  database: DbOrTx,
  bookingId: string,
  itemId: string,
): Promise<NotificationTarget | null> {
  const [row] = await database
    .select({
      booking: bookings,
      shopName: shops.name,
      outletName: outlets.name,
      fromDate: bookingItems.fromDate,
      toDate: bookingItems.toDate,
      productName: products.name,
      size: productVariations.size,
      color: productVariations.color,
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
      booking_date: formatDate(row.booking.createdAt),
      item: formatItemLabel(row.productName, row.size, row.color),
      pickup_date: formatDate(row.fromDate),
      return_date: formatDate(row.toDate),
      shop_name: row.shopName,
      outlet_name: row.outletName ?? row.shopName,
    },
  };
}

/**
 * Owner-side counterpart to `queueBookingNotification` — same rule/
 * template mechanics, but the recipient is one specific item's owner (via
 * `buildOwnerItemContext`), and dedup always keys on that item (owner
 * events are inherently item-scoped), so a second customer-owned item
 * added to the same order gets its own separate owner notification.
 * No-ops for a shop-owned item or an owner with no phone on file.
 */
export async function queueOwnerBookingNotification(
  database: DbOrTx,
  booking: Pick<Booking, "id" | "shopId">,
  itemId: string,
  event: OwnerNotificationEvent,
): Promise<NotificationLog | null> {
  await ensureDefaultNotificationRules(booking.shopId, database);

  const target = await resolveRuleTarget(database, booking.shopId, event);
  if (!target) return null;

  const context = await buildOwnerItemContext(database, booking.id, itemId);
  if (!context) return null;

  const [existing] = await database
    .select()
    .from(notificationLogs)
    .where(
      and(
        eq(notificationLogs.shopId, booking.shopId),
        eq(notificationLogs.bookingId, booking.id),
        eq(notificationLogs.event, event),
        eq(notificationLogs.bookingItemId, itemId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  return insertNotificationLog(database, target, {
    shopId: booking.shopId,
    bookingId: booking.id,
    bookingItemId: itemId,
    event,
    recipientPhone: context.recipientPhone,
    recipientName: context.recipientName,
    values: context.values,
    scheduledFor: offsetDate(null, target.rule.scheduleOffsetMinutes),
  });
}

const OVERDUE_REMINDER_MIN_HOURS_BETWEEN = 24;

/**
 * Cron-driven scan for `overdue_reminder` — unlike every other event,
 * this one can't be pre-scheduled at booking-creation time (whether an
 * item is actually overdue depends on whether it was returned in time,
 * which isn't known yet). Called from `dispatchDueNotifications` on every
 * tick: finds every not-yet-returned item whose `toDate` has passed, and
 * (re-)queues an immediate reminder for it, capped at the rule's
 * `repeatLimit` and spaced at least `OVERDUE_REMINDER_MIN_HOURS_BETWEEN`
 * apart, so a shop's cron cadence (e.g. every 30s) doesn't spam the same
 * overdue item every tick.
 */
export async function queueOverdueReminders(now = new Date()): Promise<number> {
  const overdueItems = await db
    .select({
      itemId: bookingItems.id,
      bookingId: bookingItems.bookingId,
      shopId: bookingItems.shopId,
    })
    .from(bookingItems)
    .where(
      and(
        inArray(bookingItems.status, [
          "pickup_pending",
          "rented",
          "return_pending",
          "overdue",
        ]),
        lt(bookingItems.toDate, toDateString(now)),
      ),
    );

  if (overdueItems.length === 0) return 0;

  // Batched rather than three queries per item per tick. The old shape ran
  // a rule lookup, a prior-log lookup and a context build for every
  // overdue item on every tick across every tenant — thousands of queries
  // a minute at a 30s cadence, growing with each tenant added (RQ-16).

  // 1. One rule lookup per *shop*, not per item.
  const shopIds = [...new Set(overdueItems.map((item) => item.shopId))];
  const targets = new Map<string, ResolvedRuleTarget | null>();
  for (const shopId of shopIds) {
    targets.set(shopId, await resolveRuleTarget(db, shopId, "overdue_reminder"));
  }

  const candidates = overdueItems.filter((item) => targets.get(item.shopId));
  if (candidates.length === 0) return 0;

  // 2. One prior-log query for every candidate, aggregated in the
  //    database, instead of fetching each item's whole log history.
  const priorStats = await db
    .select({
      bookingItemId: notificationLogs.bookingItemId,
      sent: sql<number>`count(*)::int`,
      lastAt: sql<Date | null>`max(${notificationLogs.createdAt})`,
    })
    .from(notificationLogs)
    .where(
      and(
        inArray(
          notificationLogs.bookingItemId,
          candidates.map((item) => item.itemId),
        ),
        eq(notificationLogs.event, "overdue_reminder"),
      ),
    )
    .groupBy(notificationLogs.bookingItemId);

  const statsByItem = new Map(
    priorStats.map((row) => [row.bookingItemId as string, row]),
  );

  let queued = 0;
  for (const item of candidates) {
    const target = targets.get(item.shopId);
    if (!target) continue;

    const stats = statsByItem.get(item.itemId);
    const alreadySent = stats?.sent ?? 0;
    if (alreadySent >= target.rule.repeatLimit) continue;

    const lastSentHoursAgo = stats?.lastAt
      ? (now.getTime() - new Date(stats.lastAt).getTime()) / (1000 * 60 * 60)
      : Infinity;
    if (lastSentHoursAgo < OVERDUE_REMINDER_MIN_HOURS_BETWEEN) continue;

    // 3. Only build the (expensive, multi-join) context for items that
    //    have actually earned another reminder.
    const context = await buildItemContext(db, item.bookingId, item.itemId);
    await insertNotificationLog(db, target, {
      shopId: item.shopId,
      bookingId: item.bookingId,
      bookingItemId: item.itemId,
      event: "overdue_reminder",
      recipientPhone: context.recipientPhone,
      recipientName: context.recipientName,
      values: context.values,
      scheduledFor: null,
    });
    queued += 1;
  }

  return queued;
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

/**
 * The scheduled tick. Does three things, in order:
 *
 *  1. promotes items past their return date to `overdue` (RQ-10) — the
 *     status used to never move even while reminders went out,
 *  2. queues `overdue_reminder` for them; this is the only event that
 *     isn't pre-scheduled at booking/pickup/return time (see
 *     `queueOverdueReminders`), so it is rediscovered every tick,
 *  3. claims and sends whatever is due.
 *
 * Marking runs first so the reminder scan and every report agree about
 * which items are late within the same tick.
 */
export async function dispatchDueNotifications(now = new Date()): Promise<number> {
  await markOverdueItems(now);
  await queueOverdueReminders(now);
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
