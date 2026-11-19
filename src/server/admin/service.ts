import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  sql,
  sum,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditLogs,
  bookings,
  customers,
  outlets,
  products,
  shops,
  subscriptionPayments,
  users,
} from "@/lib/db/schema";
import { destroyAllSessionsForUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/auth/temporary-password";
import { AppError } from "@/lib/errors/app-error";
import { PLATFORM_ONLY_ACTIONS } from "@/lib/audit-actions";
import {
  addMonths,
  PLANS,
  SUBSCRIPTION_GRACE_DAYS,
  SUBSCRIPTION_REMINDER_DAYS,
  subscriptionState,
  toPaise,
  type SubscriptionState,
} from "@/lib/plans";
import { tenantIdParamSchema } from "@/lib/validation/tenants";
import type {
  RecordOfflinePaymentInput,
  ResolvePaymentInput,
} from "@/lib/validation/admin-billing";
import { AuditAction, recordAudit } from "@/server/audit/service";
import { getPlans } from "@/server/billing/plans";

/**
 * Super admin (platform owner) reads and writes that span tenants: the
 * overview dashboard, subscription dues, the per-tenant detail page, and
 * the manual billing actions (offline payment, resolving a flagged
 * payment, resetting an owner's password). Tenant-side code never imports
 * this module — every caller is behind `requireSuperAdmin()`.
 */

const DAY_MS = 86_400_000;

function parseTenantId(id: string): string {
  const parsed = tenantIdParamSchema.safeParse(id);
  if (!parsed.success) throw AppError.notFound("Tenant not found");
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type MonthlyRevenuePoint = {
  /** `YYYY-MM` */
  month: string;
  revenuePaise: number;
  payments: number;
  signups: number;
};

export type PlatformOverview = {
  tenants: {
    total: number;
    active: number;
    blocked: number;
    newThisMonth: number;
  };
  subscriptions: Record<SubscriptionState, number>;
  usage: {
    bookings: number;
    bookingsLast30Days: number;
    products: number;
    customers: number;
    staff: number;
    outlets: number;
  };
  /** Revenue a month from now if every current subscription renews on its
   * standard plan: yearly ÷ 12 + monthly. Custom deals are excluded — their
   * price isn't stored. */
  recurringPaisePerMonth: number;
  monthly: MonthlyRevenuePoint[];
};

/** The last `months` calendar months (oldest first), as `YYYY-MM` keys. */
function lastMonthKeys(months: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const paidInWindow = and(
    eq(subscriptionPayments.status, "paid"),
    gte(subscriptionPayments.paidAt, windowStart),
  );
  const monthExpr = sql<string>`to_char(${subscriptionPayments.paidAt}, 'YYYY-MM')`;

  const [
    [tenantTotal],
    [tenantActive],
    [tenantNew],
    subscriptionRows,
    [bookingTotal],
    [bookingRecent],
    [productTotal],
    [customerTotal],
    [staffTotal],
    [outletTotal],
    revenueRows,
    plans,
  ] = await Promise.all([
    db.select({ value: count() }).from(shops),
    db.select({ value: count() }).from(shops).where(eq(shops.isActive, true)),
    db.select({ value: count() }).from(shops).where(gte(shops.createdAt, monthStart)),
    db
      .select({ plan: shops.plan, endsAt: shops.subscriptionEndsAt })
      .from(shops)
      .where(eq(shops.isDemo, false)),
    db.select({ value: count() }).from(bookings),
    db.select({ value: count() }).from(bookings).where(gte(bookings.createdAt, thirtyDaysAgo)),
    db.select({ value: count() }).from(products),
    db.select({ value: count() }).from(customers),
    db
      .select({ value: count() })
      .from(users)
      .where(and(isNotNull(users.shopId), inArray(users.role, ["admin", "manager", "staff"]))),
    db.select({ value: count() }).from(outlets),
    db
      .select({
        month: monthExpr,
        revenue: sum(subscriptionPayments.amountPaise),
        payments: count(),
        signups: sql<number>`count(*) filter (where ${subscriptionPayments.purpose} = 'signup')`,
      })
      .from(subscriptionPayments)
      .where(paidInWindow)
      .groupBy(monthExpr),
    getPlans(),
  ]);

  const subscriptions: Record<SubscriptionState, number> = {
    none: 0,
    active: 0,
    expiring: 0,
    grace: 0,
    locked: 0,
  };
  let recurringPaisePerMonth = 0;
  for (const row of subscriptionRows) {
    const state = subscriptionState(row.endsAt, now);
    subscriptions[state] += 1;
    if (state === "active" || state === "expiring") {
      if (row.plan === "yearly") recurringPaisePerMonth += toPaise(plans.yearly.price) / 12;
      if (row.plan === "monthly") recurringPaisePerMonth += toPaise(plans.monthly.price);
    }
  }

  const byMonth = new Map(revenueRows.map((r) => [r.month, r]));
  const monthly = lastMonthKeys(12, now).map((month) => {
    const row = byMonth.get(month);
    return {
      month,
      revenuePaise: Number(row?.revenue ?? 0),
      payments: Number(row?.payments ?? 0),
      signups: Number(row?.signups ?? 0),
    };
  });

  const total = tenantTotal?.value ?? 0;
  const active = tenantActive?.value ?? 0;

  return {
    tenants: {
      total,
      active,
      blocked: total - active,
      newThisMonth: tenantNew?.value ?? 0,
    },
    subscriptions,
    usage: {
      bookings: bookingTotal?.value ?? 0,
      bookingsLast30Days: bookingRecent?.value ?? 0,
      products: productTotal?.value ?? 0,
      customers: customerTotal?.value ?? 0,
      staff: staffTotal?.value ?? 0,
      outlets: outletTotal?.value ?? 0,
    },
    recurringPaisePerMonth: Math.round(recurringPaisePerMonth),
    monthly,
  };
}

export type RecentTenant = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  plan: "yearly" | "monthly" | "custom" | null;
  subscriptionEndsAt: Date | null;
  createdAt: Date;
};

export async function listRecentTenants(limit = 5): Promise<RecentTenant[]> {
  return db
    .select({
      id: shops.id,
      name: shops.name,
      email: shops.email,
      isActive: shops.isActive,
      plan: shops.plan,
      subscriptionEndsAt: shops.subscriptionEndsAt,
      createdAt: shops.createdAt,
    })
    .from(shops)
    .orderBy(desc(shops.createdAt))
    .limit(limit);
}

export type PlatformActivityItem = {
  id: string;
  action: string;
  summary: string | null;
  shopId: string | null;
  shopName: string | null;
  createdAt: Date;
};

/** Platform-level audit rows (tenant created/blocked, subscription and
 * billing changes) — the super admin's own activity feed. */
export async function listPlatformActivity(options: {
  limit?: number;
  shopId?: string;
} = {}): Promise<PlatformActivityItem[]> {
  const actions = [...PLATFORM_ONLY_ACTIONS];
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      summary: auditLogs.summary,
      shopId: auditLogs.shopId,
      shopName: shops.name,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(shops, eq(auditLogs.shopId, shops.id))
    .where(
      and(
        inArray(auditLogs.action, actions),
        options.shopId ? eq(auditLogs.shopId, options.shopId) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.limit ?? 10);
}

// ---------------------------------------------------------------------------
// Dues
// ---------------------------------------------------------------------------

export const DUE_FILTERS = ["due", "expiring", "grace", "locked", "none"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export type DueItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  plan: "yearly" | "monthly" | "custom" | null;
  subscriptionEndsAt: Date | null;
  state: SubscriptionState;
  /** Positive = days left; negative = days overdue. Null without an end date. */
  daysLeft: number | null;
  /** The renewal price for a standard plan, in paise; null for custom/none. */
  renewalPaise: number | null;
  ownerName: string | null;
  ownerPhone: string | null;
  lastPaidAt: Date | null;
};

/**
 * Tenants whose subscription needs attention, soonest first. "due" is
 * everything the platform owner should chase: expiring within the
 * reminder window, in the grace period, or locked.
 */
export async function listDues(filter: DueFilter): Promise<DueItem[]> {
  const now = new Date();
  const reminderEdge = new Date(now.getTime() + SUBSCRIPTION_REMINDER_DAYS * DAY_MS);
  const graceEdge = new Date(now.getTime() - SUBSCRIPTION_GRACE_DAYS * DAY_MS);

  const condition = (() => {
    switch (filter) {
      case "expiring":
        return and(gte(shops.subscriptionEndsAt, now), lte(shops.subscriptionEndsAt, reminderEdge));
      case "grace":
        return and(lt(shops.subscriptionEndsAt, now), gte(shops.subscriptionEndsAt, graceEdge));
      case "locked":
        return lt(shops.subscriptionEndsAt, graceEdge);
      case "none":
        return isNull(shops.subscriptionEndsAt);
      default:
        return lte(shops.subscriptionEndsAt, reminderEdge);
    }
  })();

  const rows = await db
    .select({
      id: shops.id,
      name: shops.name,
      email: shops.email,
      phone: shops.phone,
      isActive: shops.isActive,
      plan: shops.plan,
      subscriptionEndsAt: shops.subscriptionEndsAt,
    })
    .from(shops)
    .where(and(eq(shops.isDemo, false), condition))
    .orderBy(asc(shops.subscriptionEndsAt), asc(shops.name))
    .limit(500);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [owners, lastPaid, plans] = await Promise.all([
    db
      .select({
        shopId: users.shopId,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(inArray(users.shopId, ids), eq(users.role, "admin")))
      .orderBy(asc(users.createdAt)),
    db
      .select({ shopId: subscriptionPayments.shopId, value: max(subscriptionPayments.paidAt) })
      .from(subscriptionPayments)
      .where(and(inArray(subscriptionPayments.shopId, ids), eq(subscriptionPayments.status, "paid")))
      .groupBy(subscriptionPayments.shopId),
    getPlans(),
  ]);

  const ownerByShop = new Map<string, (typeof owners)[number]>();
  for (const owner of owners) {
    if (owner.shopId && !ownerByShop.has(owner.shopId)) ownerByShop.set(owner.shopId, owner);
  }
  const lastPaidByShop = new Map(lastPaid.map((r) => [r.shopId, r.value]));

  return rows.map((row) => {
    const owner = ownerByShop.get(row.id);
    return {
      ...row,
      state: subscriptionState(row.subscriptionEndsAt, now),
      daysLeft: row.subscriptionEndsAt
        ? Math.ceil((row.subscriptionEndsAt.getTime() - now.getTime()) / DAY_MS)
        : null,
      renewalPaise:
        row.plan === "yearly" || row.plan === "monthly" ? toPaise(plans[row.plan].price) : null,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}`.trim() : null,
      ownerPhone: owner?.phone ?? null,
      lastPaidAt: lastPaidByShop.get(row.id) ?? null,
    };
  });
}

export async function getDueCounts(): Promise<Record<DueFilter, number>> {
  const now = new Date();
  const rows = await db
    .select({ endsAt: shops.subscriptionEndsAt })
    .from(shops)
    .where(eq(shops.isDemo, false));
  const counts: Record<DueFilter, number> = { due: 0, expiring: 0, grace: 0, locked: 0, none: 0 };
  for (const row of rows) {
    const state = subscriptionState(row.endsAt, now);
    if (state === "expiring" || state === "grace" || state === "locked") {
      counts[state] += 1;
      counts.due += 1;
    }
    if (state === "none") counts.none += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Tenant detail
// ---------------------------------------------------------------------------

export type TenantOwner = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
};

export type TenantUsage = {
  outlets: number;
  staff: number;
  products: number;
  customers: number;
  bookings: number;
  bookingsLast30Days: number;
  bookingValue: string;
  lastBookingAt: Date | null;
};

export async function getTenantOwners(id: string): Promise<TenantOwner[]> {
  const shopId = parseTenantId(id);
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.shopId, shopId), eq(users.role, "admin")))
    .orderBy(asc(users.createdAt));
}

export async function getTenantUsage(id: string): Promise<TenantUsage> {
  const shopId = parseTenantId(id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

  const [[outletRow], [staffRow], [productRow], [customerRow], [bookingRow], [recentRow]] =
    await Promise.all([
      db.select({ value: count() }).from(outlets).where(eq(outlets.shopId, shopId)),
      db
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.shopId, shopId), inArray(users.role, ["admin", "manager", "staff"]))),
      db.select({ value: count() }).from(products).where(eq(products.shopId, shopId)),
      db.select({ value: count() }).from(customers).where(eq(customers.shopId, shopId)),
      db
        .select({
          value: count(),
          total: sum(bookings.totalAmount),
          last: max(bookings.createdAt),
        })
        .from(bookings)
        .where(and(eq(bookings.shopId, shopId), sql`${bookings.status} <> 'cancelled'`)),
      db
        .select({ value: count() })
        .from(bookings)
        .where(and(eq(bookings.shopId, shopId), gte(bookings.createdAt, thirtyDaysAgo))),
    ]);

  return {
    outlets: outletRow?.value ?? 0,
    staff: staffRow?.value ?? 0,
    products: productRow?.value ?? 0,
    customers: customerRow?.value ?? 0,
    bookings: bookingRow?.value ?? 0,
    bookingsLast30Days: recentRow?.value ?? 0,
    bookingValue: bookingRow?.total ?? "0",
    lastBookingAt: bookingRow?.last ?? null,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Records a payment the business made outside Razorpay (UPI, bank
 * transfer, cash) and extends its subscription. A standard plan adds one
 * billing period on top of whichever is later — today or the current end
 * date — so paying early never loses days; a custom deal takes the end
 * date the admin enters.
 */
export async function recordOfflinePayment(id: string, input: RecordOfflinePaymentInput) {
  const shopId = parseTenantId(id);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [shop] = await tx
      .select({ id: shops.id, name: shops.name, plan: shops.plan, endsAt: shops.subscriptionEndsAt })
      .from(shops)
      .where(eq(shops.id, shopId))
      .limit(1)
      .for("update");
    if (!shop) throw AppError.notFound("Tenant not found");

    const [paidBefore] = await tx
      .select({ value: count() })
      .from(subscriptionPayments)
      .where(and(eq(subscriptionPayments.shopId, shopId), eq(subscriptionPayments.status, "paid")));
    const isFirstPayment = (paidBefore?.value ?? 0) === 0;

    const periodStart = shop.endsAt && shop.endsAt > now ? shop.endsAt : now;
    let periodEnd: Date;
    if (input.plan === "custom") {
      if (!input.endsAt) throw new AppError("Pick the date this deal runs until", 400);
      periodEnd = new Date(`${input.endsAt}T23:59:59`);
      if (periodEnd <= now) throw new AppError("The end date must be in the future", 400);
    } else {
      periodEnd = addMonths(periodStart, PLANS[input.plan].periodMonths);
    }

    const amountPaise = toPaise(input.amount);
    const setupFeePaise = Math.min(toPaise(input.setupFee ?? 0), amountPaise);
    const noteParts = [
      `Offline payment via ${input.method}`,
      input.reference ? `ref ${input.reference}` : null,
      input.note || null,
    ].filter(Boolean);

    const [payment] = await tx
      .insert(subscriptionPayments)
      .values({
        shopId,
        purpose: isFirstPayment ? "signup" : "renewal",
        plan: input.plan,
        status: "paid",
        planFeePaise: amountPaise - setupFeePaise,
        setupFeePaise,
        amountPaise,
        note: noteParts.join(" · ").slice(0, 500),
        periodStart,
        periodEnd,
        paidAt: input.paidOn ? new Date(`${input.paidOn}T12:00:00`) : now,
      })
      .returning({ id: subscriptionPayments.id });

    await tx
      .update(shops)
      .set({ plan: input.plan, subscriptionEndsAt: periodEnd, updatedAt: now })
      .where(eq(shops.id, shopId));

    await recordAudit(tx, {
      shopId,
      action: AuditAction.SUBSCRIPTION_PAYMENT_RECORDED,
      entityType: "subscription_payment",
      entityId: payment.id,
      summary: `Offline payment of ₹${input.amount.toLocaleString("en-IN")} recorded for "${shop.name}" (${input.plan})`,
      before: { plan: shop.plan, subscriptionEndsAt: shop.endsAt },
      after: { plan: input.plan, subscriptionEndsAt: periodEnd, amountPaise },
    });

    return { paymentId: payment.id, subscriptionEndsAt: periodEnd };
  });
}

/** Clears the "needs attention" flag on a payment once the admin has
 * sorted it out by hand (refunded, or set the account up manually). */
export async function resolvePaymentAttention(paymentId: string, input: ResolvePaymentInput) {
  const parsed = tenantIdParamSchema.safeParse(paymentId);
  if (!parsed.success) throw AppError.notFound("Payment not found");

  const [existing] = await db
    .select({
      id: subscriptionPayments.id,
      shopId: subscriptionPayments.shopId,
      note: subscriptionPayments.note,
      needsAttention: subscriptionPayments.needsAttention,
    })
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.id, parsed.data))
    .limit(1);
  if (!existing) throw AppError.notFound("Payment not found");
  if (!existing.needsAttention) return existing;

  const note = [existing.note, `Resolved: ${input.note}`].filter(Boolean).join(" · ").slice(0, 1000);

  const [updated] = await db
    .update(subscriptionPayments)
    .set({ needsAttention: false, note, updatedAt: new Date() })
    .where(eq(subscriptionPayments.id, existing.id))
    .returning({ id: subscriptionPayments.id });

  await recordAudit(db, {
    shopId: existing.shopId,
    action: AuditAction.SUBSCRIPTION_PAYMENT_RESOLVED,
    entityType: "subscription_payment",
    entityId: existing.id,
    summary: `Flagged payment resolved: ${input.note}`.slice(0, 500),
  });

  return updated;
}

/**
 * Gives a tenant owner a fresh temporary password (shown once to the
 * admin) and signs them out everywhere — the support path for "I forgot
 * my password". Refused on the shared demo shop.
 */
export async function resetOwnerPassword(tenantId: string, userId: string) {
  const shopId = parseTenantId(tenantId);
  const parsedUser = tenantIdParamSchema.safeParse(userId);
  if (!parsedUser.success) throw AppError.notFound("Owner not found");

  const [owner] = await db
    .select({ id: users.id, email: users.email, shopName: shops.name, isDemo: shops.isDemo })
    .from(users)
    .innerJoin(shops, eq(users.shopId, shops.id))
    .where(and(eq(users.id, parsedUser.data), eq(users.shopId, shopId), eq(users.role, "admin")))
    .limit(1);
  if (!owner) throw AppError.notFound("Owner not found");
  if (owner.isDemo) {
    throw AppError.forbidden("The demo account's password can't be reset from here.");
  }

  const temporaryPassword = generateTemporaryPassword();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, owner.id));
  await destroyAllSessionsForUser(owner.id);

  await recordAudit(db, {
    shopId,
    action: AuditAction.TENANT_OWNER_PASSWORD_RESET,
    entityType: "user",
    entityId: owner.id,
    summary: `Owner password for "${owner.shopName}" reset by platform admin`,
  });

  return { email: owner.email, temporaryPassword };
}

/** The shop currently behind the public "Try the demo" button, if any. */
export async function getDemoTenant(): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(eq(shops.isDemo, true))
    .limit(1);
  return row ?? null;
}

export type TenantPaymentSummary = {
  id: string;
  name: string;
  plan: "yearly" | "monthly" | "custom" | null;
  subscriptionEndsAt: Date | null;
  isDemo: boolean;
  payments: number;
  totalPaidPaise: number;
  lastPaidAt: Date | null;
  lastAmountPaise: number | null;
};

/**
 * One row per tenant with what they have paid the platform so far. Amounts
 * come from the stored payments (what was actually charged), so they are
 * unaffected by later price changes. Tenants with no payments are included.
 */
export async function listTenantPaymentSummaries(): Promise<TenantPaymentSummary[]> {
  const paid = eq(subscriptionPayments.status, "paid");
  const [tenants, totals, latest] = await Promise.all([
    db
      .select({
        id: shops.id,
        name: shops.name,
        plan: shops.plan,
        subscriptionEndsAt: shops.subscriptionEndsAt,
        isDemo: shops.isDemo,
      })
      .from(shops)
      .orderBy(asc(shops.name)),
    db
      .select({
        shopId: subscriptionPayments.shopId,
        payments: count(),
        total: sum(subscriptionPayments.amountPaise),
        lastPaidAt: max(subscriptionPayments.paidAt),
      })
      .from(subscriptionPayments)
      .where(and(paid, isNotNull(subscriptionPayments.shopId)))
      .groupBy(subscriptionPayments.shopId),
    db
      .selectDistinctOn([subscriptionPayments.shopId], {
        shopId: subscriptionPayments.shopId,
        amountPaise: subscriptionPayments.amountPaise,
      })
      .from(subscriptionPayments)
      .where(and(paid, isNotNull(subscriptionPayments.shopId)))
      .orderBy(subscriptionPayments.shopId, desc(subscriptionPayments.paidAt)),
  ]);

  const totalByShop = new Map(totals.map((t) => [t.shopId, t]));
  const latestByShop = new Map(latest.map((l) => [l.shopId, l.amountPaise]));

  return tenants
    .map((t) => {
      const row = totalByShop.get(t.id);
      return {
        ...t,
        payments: row?.payments ?? 0,
        totalPaidPaise: Number(row?.total ?? 0),
        lastPaidAt: row?.lastPaidAt ?? null,
        lastAmountPaise: latestByShop.get(t.id) ?? null,
      };
    })
    .sort((a, b) => b.totalPaidPaise - a.totalPaidPaise || a.name.localeCompare(b.name));
}
