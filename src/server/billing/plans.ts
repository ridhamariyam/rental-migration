import "server-only";

import { desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLogs, planPrices } from "@/lib/db/schema";
import { PLAN_IDS, withPrices, type PlanCatalog, type PlanId } from "@/lib/plans";
import type { UpdatePlanPricesInput } from "@/lib/validation/admin-billing";
import { AuditAction, recordAudit } from "@/server/audit/service";

/**
 * The live plan catalog: defaults from `src/lib/plans.ts` with the super
 * admin's saved prices on top. Every place that charges or shows a price
 * (checkout, the public pricing section, the signup form, the admin
 * screens) reads it from here, so they can never disagree.
 */
export async function getPlans(): Promise<PlanCatalog> {
  const rows = await db
    .select({ plan: planPrices.plan, price: planPrices.price, setupFee: planPrices.setupFee })
    .from(planPrices);
  return withPrices(rows);
}

/**
 * Saves new prices for the standard plans. Applies to checkouts started
 * from now on only — past payments keep the amount they were charged, and
 * a checkout already open keeps the price on its Razorpay order.
 */
export async function updatePlanPrices(input: UpdatePlanPricesInput): Promise<PlanCatalog> {
  return db.transaction(async (tx) => {
    const beforeRows = await tx
      .select({ plan: planPrices.plan, price: planPrices.price, setupFee: planPrices.setupFee })
      .from(planPrices)
      .for("update");
    const before = withPrices(beforeRows);

    const changes: string[] = [];
    for (const planId of PLAN_IDS) {
      const next = input[planId];
      const prev = before[planId];
      if (next.price === prev.price && next.setupFee === prev.setupFee) continue;

      await tx
        .insert(planPrices)
        .values({ plan: planId, price: next.price, setupFee: next.setupFee })
        .onConflictDoUpdate({
          target: planPrices.plan,
          set: { price: next.price, setupFee: next.setupFee, updatedAt: new Date() },
        });

      const parts = [];
      if (next.price !== prev.price) parts.push(`price ₹${prev.price} → ₹${next.price}`);
      if (next.setupFee !== prev.setupFee) parts.push(`setup fee ₹${prev.setupFee} → ₹${next.setupFee}`);
      changes.push(`${prev.name}: ${parts.join(", ")}`);
    }

    if (changes.length > 0) {
      const after = withPrices(
        PLAN_IDS.map((planId) => ({ plan: planId, ...input[planId] })),
      );
      await recordAudit(tx, {
        shopId: null,
        action: AuditAction.PLAN_PRICES_CHANGED,
        entityType: "plan_prices",
        summary: changes.join(" · "),
        before: pickPrices(before),
        after: pickPrices(after),
      });
    }

    return withPrices(
      PLAN_IDS.map((planId) => ({ plan: planId, ...input[planId] })),
    );
  });
}

function pickPrices(catalog: PlanCatalog) {
  return Object.fromEntries(
    PLAN_IDS.map((id) => [id, { price: catalog[id].price, setupFee: catalog[id].setupFee }]),
  ) as Record<PlanId, { price: number; setupFee: number }>;
}

export type PriceChange = {
  id: string;
  summary: string | null;
  createdAt: Date;
};

/** Every price change, newest first (from the audit log). */
export async function listPriceChanges(limit = 50): Promise<PriceChange[]> {
  return db
    .select({ id: auditLogs.id, summary: auditLogs.summary, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(inArray(auditLogs.action, [AuditAction.PLAN_PRICES_CHANGED]))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

