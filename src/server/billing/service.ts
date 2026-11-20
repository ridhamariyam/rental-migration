import "server-only";

import { and, asc, count, desc, eq, gte, isNotNull, lte, or, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  shops,
  subscriptionPayments,
  users,
  type SignupDetails,
  type SubscriptionPayment,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { destroySessionsForShop } from "@/lib/auth/session";
import { AppError } from "@/lib/errors/app-error";
import {
  PLANS,
  SUBSCRIPTION_REMINDER_DAYS,
  addMonths,
  signupTotal,
  toPaise,
  type PlanId,
} from "@/lib/plans";
import type {
  PaymentListQuery,
  SignupInput,
} from "@/lib/validation/billing";
import { tenantIdParamSchema } from "@/lib/validation/tenants";
import { AuditAction, recordAudit } from "@/server/audit/service";
import { getPlans } from "@/server/billing/plans";
import { sendWelcomeAfterResponse } from "@/server/billing/welcome";
import {
  createRazorpayOrder,
  razorpayKeyId,
  assertRazorpayConfigured,
} from "@/server/billing/razorpay";

/** Everything the browser needs to open Razorpay Checkout. */
export type CheckoutSession = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
};

/** How long after payment the buyer's browser may still exchange the
 * checkout proof for a signed-in session (see the verify route). */
const SIGNUP_SESSION_WINDOW_MS = 30 * 60 * 1000;

async function findShopConflicts(
  executor: Pick<typeof db, "select">,
  email: string,
  phone: string,
): Promise<{ field: string; message: string }[]> {
  const rows = await executor
    .select({ email: shops.email, phone: shops.phone })
    .from(shops)
    .where(or(eq(shops.email, email), eq(shops.phone, phone)));

  const errors: { field: string; message: string }[] = [];
  if (rows.some((row) => row.email === email)) {
    errors.push({
      field: "businessEmail",
      message: "A business with this email is already registered",
    });
  }
  if (rows.some((row) => row.phone === phone)) {
    errors.push({
      field: "businessPhone",
      message: "A business with this phone number is already registered",
    });
  }
  return errors;
}

/**
 * Step 1 of buying an account: validate the details, park them (with the
 * owner's hashed password) on a `created` payment row, and open a Razorpay
 * order for plan price + setup fee. No shop or user exists yet — those are
 * only created once the gateway confirms the money arrived.
 */
export async function startSignup(input: SignupInput): Promise<CheckoutSession> {
  assertRazorpayConfigured();

  const conflicts = await findShopConflicts(
    db,
    input.businessEmail,
    input.businessPhone,
  );
  if (conflicts.length > 0) {
    throw new AppError(
      "This business is already registered. Sign in instead, or contact us on WhatsApp.",
      409,
      conflicts,
    );
  }

  // Always the live server-side price — never anything the browser sent.
  const plan = (await getPlans())[input.plan];
  const planFeePaise = toPaise(plan.price);
  const setupFeePaise = toPaise(plan.setupFee);
  const amountPaise = toPaise(signupTotal(plan));
  const ownerPasswordHash = await hashPassword(input.password);

  const details: SignupDetails = {
    businessName: input.businessName,
    businessEmail: input.businessEmail,
    businessPhone: input.businessPhone,
    address: input.address || undefined,
    ownerFirstName: input.ownerFirstName,
    ownerLastName: input.ownerLastName,
    ownerEmail: input.ownerEmail,
    ownerPhone: input.ownerPhone || undefined,
  };

  const [row] = await db
    .insert(subscriptionPayments)
    .values({
      purpose: "signup",
      plan: plan.id,
      planFeePaise,
      setupFeePaise,
      amountPaise,
      signupDetails: details,
      ownerPasswordHash,
    })
    .returning({ id: subscriptionPayments.id });

  const order = await createRazorpayOrder({
    amountPaise,
    receipt: row.id,
    notes: {
      purpose: "signup",
      plan: plan.id,
      business: input.businessName.slice(0, 200),
      paymentRowId: row.id,
    },
  });

  await db
    .update(subscriptionPayments)
    .set({ razorpayOrderId: order.id, updatedAt: new Date() })
    .where(eq(subscriptionPayments.id, row.id));

  return {
    keyId: razorpayKeyId(),
    orderId: order.id,
    amountPaise,
    currency: "INR",
    description: `${plan.name} plan + one-time setup`,
    prefill: {
      name: `${input.ownerFirstName} ${input.ownerLastName}`,
      email: input.ownerEmail,
      contact: input.ownerPhone || input.businessPhone,
    },
  };
}

/** Step 1 of a renewal, started by a signed-in tenant admin. */
export async function startRenewal(
  shopId: string,
  planId: PlanId,
  buyer: { name: string; email: string },
): Promise<CheckoutSession> {
  assertRazorpayConfigured();

  const [shop] = await db
    .select({ id: shops.id, name: shops.name, phone: shops.phone, isDemo: shops.isDemo })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);

  if (!shop) throw AppError.notFound("Business not found");
  if (shop.isDemo) {
    throw AppError.forbidden(
      "This is the demo account. Buy a plan to get your own account.",
    );
  }

  const plan = (await getPlans())[planId];
  const amountPaise = toPaise(plan.price);

  const [row] = await db
    .insert(subscriptionPayments)
    .values({
      shopId: shop.id,
      purpose: "renewal",
      plan: plan.id,
      planFeePaise: amountPaise,
      setupFeePaise: 0,
      amountPaise,
    })
    .returning({ id: subscriptionPayments.id });

  const order = await createRazorpayOrder({
    amountPaise,
    receipt: row.id,
    notes: {
      purpose: "renewal",
      plan: plan.id,
      business: shop.name.slice(0, 200),
      paymentRowId: row.id,
    },
  });

  await db
    .update(subscriptionPayments)
    .set({ razorpayOrderId: order.id, updatedAt: new Date() })
    .where(eq(subscriptionPayments.id, row.id));

  return {
    keyId: razorpayKeyId(),
    orderId: order.id,
    amountPaise,
    currency: "INR",
    description: `${plan.name} plan renewal`,
    prefill: { name: buyer.name, email: buyer.email, contact: shop.phone },
  };
}

export type CompletionResult = {
  purpose: "signup" | "renewal";
  shopId: string | null;
  /** The new owner's user id — only for a signup that provisioned an
   * account *recently*, so the buyer's browser can be signed straight in. */
  sessionUserId: string | null;
  needsAttention: boolean;
};

/**
 * Step 2: the gateway says order `orderId` was paid by `paymentId`. Called
 * from the checkout success handler (after its signature check) *and* from
 * the webhook — whichever arrives first does the work, the other finds the
 * row already `paid` and returns the same result. The payment row is
 * locked `FOR UPDATE` so the two can never both provision a shop.
 *
 * A paid signup whose business email/phone was taken in the meantime is
 * kept as paid + `needsAttention` rather than throwing: the money has
 * moved, so the record must survive for the platform owner to resolve.
 */
export async function completePayment(params: {
  orderId: string;
  paymentId: string;
}): Promise<CompletionResult> {
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.razorpayOrderId, params.orderId))
      .for("update")
      .limit(1);

    if (!payment) {
      throw AppError.notFound("Payment not found");
    }

    if (payment.status === "paid") {
      return { payment, fresh: false };
    }

    const now = new Date();
    // Only the period length is read here (not editable); the amount
    // charged is whatever this payment row recorded at checkout.
    const plan = PLANS[payment.plan as PlanId] ?? PLANS.yearly;

    if (payment.purpose === "renewal") {
      if (!payment.shopId) {
        throw new AppError("Renewal payment has no business", 500);
      }
      const [shop] = await tx
        .select({ id: shops.id, endsAt: shops.subscriptionEndsAt })
        .from(shops)
        .where(eq(shops.id, payment.shopId))
        .for("update")
        .limit(1);

      // Renewing early stacks on top of the remaining time; renewing late
      // starts from today (the lapsed days aren't billed twice).
      const periodStart =
        shop?.endsAt && shop.endsAt > now ? shop.endsAt : now;
      const periodEnd = addMonths(periodStart, plan.periodMonths);

      if (shop) {
        await tx
          .update(shops)
          // Paying again is the clearest "I'm staying" — it undoes a
          // pending cancellation.
          .set({
            plan: plan.id,
            subscriptionEndsAt: periodEnd,
            subscriptionCancelledAt: null,
            subscriptionCancelReason: null,
            updatedAt: now,
          })
          .where(eq(shops.id, shop.id));
      }

      const [updated] = await tx
        .update(subscriptionPayments)
        .set({
          status: "paid",
          razorpayPaymentId: params.paymentId,
          paidAt: now,
          periodStart,
          periodEnd,
          needsAttention: !shop,
          note: shop ? null : "Business was deleted before the renewal was paid",
          updatedAt: now,
        })
        .where(eq(subscriptionPayments.id, payment.id))
        .returning();

      if (shop) {
        await recordAudit(tx, {
          shopId: shop.id,
          action: AuditAction.SUBSCRIPTION_PAID,
          entityType: "subscription_payment",
          entityId: payment.id,
          summary: `${plan.name} plan renewed until ${periodEnd.toDateString()}`,
          after: { plan: plan.id, amountPaise: payment.amountPaise, periodEnd },
        });
      }

      return { payment: updated, fresh: true };
    }

    // --- signup ---
    const details = payment.signupDetails;
    const conflicts = details
      ? await findShopConflicts(tx, details.businessEmail, details.businessPhone)
      : [];

    if (!details || !payment.ownerPasswordHash || conflicts.length > 0) {
      const [updated] = await tx
        .update(subscriptionPayments)
        .set({
          status: "paid",
          razorpayPaymentId: params.paymentId,
          paidAt: now,
          needsAttention: true,
          note:
            conflicts.length > 0
              ? "Paid, but a business with this email/phone already exists — create or link the account by hand."
              : "Paid, but the signup details were missing — create the account by hand.",
          updatedAt: now,
        })
        .where(eq(subscriptionPayments.id, payment.id))
        .returning();
      return { payment: updated, fresh: true };
    }

    const periodEnd = addMonths(now, plan.periodMonths);

    const [shop] = await tx
      .insert(shops)
      .values({
        name: details.businessName,
        email: details.businessEmail,
        phone: details.businessPhone,
        address: details.address ?? null,
        plan: plan.id,
        subscriptionEndsAt: periodEnd,
      })
      .returning();

    await tx.insert(users).values({
      shopId: shop.id,
      role: "admin",
      firstName: details.ownerFirstName,
      lastName: details.ownerLastName,
      email: details.ownerEmail,
      phone: details.ownerPhone ?? null,
      passwordHash: payment.ownerPasswordHash,
      // The owner chose this password themselves on the signup form.
      mustChangePassword: false,
    });

    const [updated] = await tx
      .update(subscriptionPayments)
      .set({
        shopId: shop.id,
        status: "paid",
        razorpayPaymentId: params.paymentId,
        paidAt: now,
        periodStart: now,
        periodEnd,
        ownerPasswordHash: null,
        updatedAt: now,
      })
      .where(eq(subscriptionPayments.id, payment.id))
      .returning();

    await recordAudit(tx, {
      shopId: shop.id,
      action: AuditAction.TENANT_CREATED,
      entityType: "shop",
      entityId: shop.id,
      summary: `Tenant "${shop.name}" self-registered on the ${plan.name} plan`,
      after: { name: shop.name, email: shop.email, phone: shop.phone, plan: plan.id },
    });
    await recordAudit(tx, {
      shopId: shop.id,
      action: AuditAction.SUBSCRIPTION_PAID,
      entityType: "subscription_payment",
      entityId: payment.id,
      summary: `${plan.name} plan purchased (incl. setup), active until ${periodEnd.toDateString()}`,
      after: { plan: plan.id, amountPaise: payment.amountPaise, periodEnd },
    });

    return { payment: updated, fresh: true };
  });

  const { payment } = result;
  let sessionUserId: string | null = null;

  // Welcome the new owner on WhatsApp — only on the call that actually
  // provisioned the account (`fresh`), so the checkout handler and the
  // Razorpay webhook racing each other never send it twice.
  if (
    result.fresh &&
    payment.purpose === "signup" &&
    payment.shopId &&
    !payment.needsAttention &&
    payment.signupDetails &&
    payment.periodEnd
  ) {
    sendWelcomeAfterResponse({
      details: payment.signupDetails,
      planName: (PLANS[payment.plan as PlanId] ?? PLANS.yearly).name,
      periodEnd: payment.periodEnd,
    });
  }

  if (
    payment.purpose === "signup" &&
    payment.shopId &&
    payment.paidAt &&
    Date.now() - payment.paidAt.getTime() < SIGNUP_SESSION_WINDOW_MS
  ) {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.shopId, payment.shopId), eq(users.role, "admin")))
      .orderBy(asc(users.createdAt))
      .limit(1);
    sessionUserId = owner?.id ?? null;
  }

  return {
    purpose: payment.purpose,
    shopId: payment.shopId,
    sessionUserId,
    needsAttention: payment.needsAttention,
  };
}

/**
 * The owner cancels their plan. Nothing is charged automatically here
 * (every period is a one-off Razorpay payment), so cancelling means: no
 * refund, the account keeps working until `subscriptionEndsAt`, then it
 * locks like any lapsed plan. Reversible with `resumeSubscription` until
 * then, and undone by any paid renewal.
 */
export async function cancelSubscription(
  actor: { id: string; shopId: string },
  reason: string | undefined,
) {
  const [shop] = await db
    .select({ endsAt: shops.subscriptionEndsAt, isDemo: shops.isDemo, cancelledAt: shops.subscriptionCancelledAt })
    .from(shops)
    .where(eq(shops.id, actor.shopId))
    .limit(1);
  if (!shop) throw AppError.notFound("Business not found");
  if (shop.isDemo) throw AppError.forbidden("The demo account can't be cancelled.");
  if (!shop.endsAt) {
    throw new AppError("This account is managed by the Rentque team — contact us to close it.", 409);
  }
  if (shop.cancelledAt) return;

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(shops)
      .set({
        subscriptionCancelledAt: now,
        subscriptionCancelReason: reason?.trim() || null,
        updatedAt: now,
      })
      .where(eq(shops.id, actor.shopId));
    await recordAudit(tx, {
      shopId: actor.shopId,
      userId: actor.id,
      action: AuditAction.SUBSCRIPTION_CANCELLED,
      entityType: "shop",
      entityId: actor.shopId,
      summary: `Subscription cancelled by the owner — access until ${shop.endsAt!.toDateString()}`,
      after: { reason: reason?.trim() || null, endsAt: shop.endsAt },
    });
  });
}

export async function resumeSubscription(actor: { id: string; shopId: string }) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(shops)
      .set({ subscriptionCancelledAt: null, subscriptionCancelReason: null, updatedAt: now })
      .where(and(eq(shops.id, actor.shopId), isNotNull(shops.subscriptionCancelledAt)))
      .returning({ id: shops.id });
    if (!updated) return;
    await recordAudit(tx, {
      shopId: actor.shopId,
      userId: actor.id,
      action: AuditAction.SUBSCRIPTION_RESUMED,
      entityType: "shop",
      entityId: actor.shopId,
      summary: "Subscription cancellation undone by the owner",
    });
  });
}

/** Webhook `payment.failed`: record it (only if still unpaid). */
export async function markPaymentFailed(orderId: string, reason: string) {
  await db
    .update(subscriptionPayments)
    .set({ status: "failed", note: reason.slice(0, 500), updatedAt: new Date() })
    .where(
      and(
        eq(subscriptionPayments.razorpayOrderId, orderId),
        eq(subscriptionPayments.status, "created"),
      ),
    );
}

// ---------------------------------------------------------------------------
// Super admin reads / writes
// ---------------------------------------------------------------------------

export type BillingStats = {
  totalRevenuePaise: number;
  monthRevenuePaise: number;
  paidSignups: number;
  subscribedTenants: number;
  expiringSoon: number;
  expired: number;
  needsAttention: number;
  pendingCheckouts: number;
  demoTenant: { id: string; name: string; isActive: boolean } | null;
};

export async function getBillingStats(): Promise<BillingStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const soon = new Date(now.getTime() + SUBSCRIPTION_REMINDER_DAYS * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const paid = eq(subscriptionPayments.status, "paid");

  const [
    [total],
    [month],
    [signups],
    [subscribed],
    [expiring],
    [expired],
    [attention],
    [pending],
    [demo],
  ] = await Promise.all([
    db.select({ value: sum(subscriptionPayments.amountPaise) }).from(subscriptionPayments).where(paid),
    db
      .select({ value: sum(subscriptionPayments.amountPaise) })
      .from(subscriptionPayments)
      .where(and(paid, gte(subscriptionPayments.paidAt, monthStart))),
    db
      .select({ value: count() })
      .from(subscriptionPayments)
      .where(and(paid, eq(subscriptionPayments.purpose, "signup"))),
    db
      .select({ value: count() })
      .from(shops)
      .where(and(isNotNull(shops.subscriptionEndsAt), gte(shops.subscriptionEndsAt, now))),
    db
      .select({ value: count() })
      .from(shops)
      .where(and(gte(shops.subscriptionEndsAt, now), lte(shops.subscriptionEndsAt, soon))),
    db
      .select({ value: count() })
      .from(shops)
      .where(lte(shops.subscriptionEndsAt, now)),
    db
      .select({ value: count() })
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.needsAttention, true)),
    db
      .select({ value: count() })
      .from(subscriptionPayments)
      .where(
        and(
          eq(subscriptionPayments.status, "created"),
          gte(subscriptionPayments.createdAt, dayAgo),
        ),
      ),
    db
      .select({ id: shops.id, name: shops.name, isActive: shops.isActive })
      .from(shops)
      .where(eq(shops.isDemo, true))
      .limit(1),
  ]);

  return {
    totalRevenuePaise: Number(total?.value ?? 0),
    monthRevenuePaise: Number(month?.value ?? 0),
    paidSignups: signups?.value ?? 0,
    subscribedTenants: subscribed?.value ?? 0,
    expiringSoon: expiring?.value ?? 0,
    expired: expired?.value ?? 0,
    needsAttention: attention?.value ?? 0,
    pendingCheckouts: pending?.value ?? 0,
    demoTenant: demo ?? null,
  };
}

export type PaymentListItem = Omit<SubscriptionPayment, "ownerPasswordHash"> & {
  shopName: string | null;
};

const paymentColumns = {
  id: subscriptionPayments.id,
  shopId: subscriptionPayments.shopId,
  purpose: subscriptionPayments.purpose,
  plan: subscriptionPayments.plan,
  status: subscriptionPayments.status,
  planFeePaise: subscriptionPayments.planFeePaise,
  setupFeePaise: subscriptionPayments.setupFeePaise,
  amountPaise: subscriptionPayments.amountPaise,
  currency: subscriptionPayments.currency,
  razorpayOrderId: subscriptionPayments.razorpayOrderId,
  razorpayPaymentId: subscriptionPayments.razorpayPaymentId,
  signupDetails: subscriptionPayments.signupDetails,
  needsAttention: subscriptionPayments.needsAttention,
  note: subscriptionPayments.note,
  periodStart: subscriptionPayments.periodStart,
  periodEnd: subscriptionPayments.periodEnd,
  paidAt: subscriptionPayments.paidAt,
  createdAt: subscriptionPayments.createdAt,
  updatedAt: subscriptionPayments.updatedAt,
  shopName: shops.name,
};

export const PAYMENTS_PAGE_SIZE = 25;

export async function listSubscriptionPayments(query: PaymentListQuery): Promise<{
  items: PaymentListItem[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const where =
    query.status === "attention"
      ? eq(subscriptionPayments.needsAttention, true)
      : query.status === "all"
        ? undefined
        : eq(subscriptionPayments.status, query.status);

  const [[totalRow], items] = await Promise.all([
    db.select({ value: count() }).from(subscriptionPayments).where(where),
    db
      .select(paymentColumns)
      .from(subscriptionPayments)
      .leftJoin(shops, eq(subscriptionPayments.shopId, shops.id))
      .where(where)
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(PAYMENTS_PAGE_SIZE)
      .offset((query.page - 1) * PAYMENTS_PAGE_SIZE),
  ]);

  const total = totalRow?.value ?? 0;
  return {
    items,
    total,
    page: query.page,
    totalPages: Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE)),
  };
}

export async function listRecentPaidPayments(limit = 6): Promise<PaymentListItem[]> {
  return db
    .select(paymentColumns)
    .from(subscriptionPayments)
    .leftJoin(shops, eq(subscriptionPayments.shopId, shops.id))
    .where(eq(subscriptionPayments.status, "paid"))
    .orderBy(desc(subscriptionPayments.paidAt))
    .limit(limit);
}

export async function listPaymentsForShop(shopId: string): Promise<PaymentListItem[]> {
  return db
    .select(paymentColumns)
    .from(subscriptionPayments)
    .leftJoin(shops, eq(subscriptionPayments.shopId, shops.id))
    .where(and(eq(subscriptionPayments.shopId, shopId), eq(subscriptionPayments.status, "paid")))
    .orderBy(desc(subscriptionPayments.paidAt));
}

function parseTenantId(id: string): string {
  const parsed = tenantIdParamSchema.safeParse(id);
  if (!parsed.success) throw AppError.notFound("Tenant not found");
  return parsed.data;
}

/** Manual override: offline payment, custom deal, or a goodwill extension.
 * The end date is stored as the end of that calendar day (IST-agnostic:
 * 23:59:59 server time). */
export async function setTenantSubscription(
  id: string,
  input: { plan: "yearly" | "monthly" | "custom" | null; endsAt: string | null },
) {
  const shopId = parseTenantId(id);
  const [existing] = await db
    .select({ plan: shops.plan, endsAt: shops.subscriptionEndsAt, name: shops.name })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);
  if (!existing) throw AppError.notFound("Tenant not found");

  const endsAt = input.endsAt ? new Date(`${input.endsAt}T23:59:59`) : null;

  const [tenant] = await db
    .update(shops)
    .set({ plan: input.plan, subscriptionEndsAt: endsAt, updatedAt: new Date() })
    .where(eq(shops.id, shopId))
    .returning();

  await recordAudit(db, {
    shopId,
    action: AuditAction.SUBSCRIPTION_UPDATED,
    entityType: "shop",
    entityId: shopId,
    summary: `Subscription for "${existing.name}" set by platform admin`,
    before: { plan: existing.plan, subscriptionEndsAt: existing.endsAt },
    after: { plan: input.plan, subscriptionEndsAt: endsAt },
  });

  return tenant;
}

/**
 * Makes `id` the (single) public demo tenant, or stops it being one.
 * Turning it off signs every demo visitor out.
 */
export async function setTenantDemo(id: string, isDemo: boolean) {
  const shopId = parseTenantId(id);

  const tenant = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: shops.id, name: shops.name })
      .from(shops)
      .where(eq(shops.id, shopId))
      .limit(1);
    if (!existing) throw AppError.notFound("Tenant not found");

    if (isDemo) {
      await tx
        .update(shops)
        .set({ isDemo: false, updatedAt: new Date() })
        .where(and(eq(shops.isDemo, true), sql`${shops.id} <> ${shopId}`));
    }

    const [updated] = await tx
      .update(shops)
      .set({ isDemo, updatedAt: new Date() })
      .where(eq(shops.id, shopId))
      .returning();

    await recordAudit(tx, {
      shopId,
      action: AuditAction.TENANT_DEMO_CHANGED,
      entityType: "shop",
      entityId: shopId,
      summary: isDemo
        ? `"${existing.name}" set as the public demo account`
        : `"${existing.name}" is no longer the demo account`,
      after: { isDemo },
    });

    return updated;
  });

  if (!isDemo) {
    await destroySessionsForShop(shopId);
  }

  return tenant;
}

/** The user a "Try the demo" visitor is signed in as: the demo shop's
 * earliest active owner account. Null when no demo is configured. */
export async function findDemoLoginUser(): Promise<{ id: string; mustChangePassword: boolean } | null> {
  const [row] = await db
    .select({ id: users.id, mustChangePassword: users.mustChangePassword })
    .from(users)
    .innerJoin(shops, eq(users.shopId, shops.id))
    .where(
      and(
        eq(shops.isDemo, true),
        eq(shops.isActive, true),
        eq(users.role, "admin"),
        eq(users.isActive, true),
      ),
    )
    .orderBy(asc(users.createdAt))
    .limit(1);

  if (!row) return null;

  // Demo visitors never see the forced first-login reset.
  if (row.mustChangePassword) {
    await db
      .update(users)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, row.id));
  }

  return row;
}

export async function isDemoAvailable(): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(shops)
    .where(and(eq(shops.isDemo, true), eq(shops.isActive, true)));
  return (row?.value ?? 0) > 0;
}
