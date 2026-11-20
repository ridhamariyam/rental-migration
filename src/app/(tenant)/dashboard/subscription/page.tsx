import { redirect } from "next/navigation";
import { CreditCardIcon, ReceiptTextIcon, SparklesIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscriptionBadge, subscriptionSummary } from "@/components/admin/billing-ui";
import { SubscriptionRenew } from "@/components/tenant/subscription-renew";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { shops } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { formatPaise, subscriptionState } from "@/lib/plans";
import { tenantPaths } from "@/lib/tenant-paths";
import { getPlans } from "@/server/billing/plans";
import { isRazorpayConfigured } from "@/server/billing/razorpay";
import { listPaymentsForShop } from "@/server/billing/service";
import { eq } from "drizzle-orm";

export const metadata = {
  title: "Subscription — Rentique",
};

export const dynamic = "force-dynamic";

const PLAN_NAMES = { yearly: "Yearly", monthly: "Monthly", custom: "Custom" } as const;

/**
 * The owner's own Rentque plan: status, renew (Razorpay, at the live
 * price), and every payment made to the platform. Owner-only
 * (`SHOP_MANAGE`). Deliberately reads the session with `getCurrentUser()`
 * rather than `requireTenantUser()`, which refuses locked shops.
 */
export default async function SubscriptionPage() {
  const user = await getCurrentUser();
  if (!user?.shopId) redirect("/login");
  if (!hasPermission(user.role, Permission.SHOP_MANAGE)) redirect(tenantPaths.dashboard);

  const [[shop], plans, payments] = await Promise.all([
    db
      .select({
        name: shops.name,
        plan: shops.plan,
        endsAt: shops.subscriptionEndsAt,
        isDemo: shops.isDemo,
      })
      .from(shops)
      .where(eq(shops.id, user.shopId))
      .limit(1),
    getPlans(),
    listPaymentsForShop(user.shopId),
  ]);
  if (!shop) redirect("/login");

  const state = subscriptionState(shop.endsAt);
  const canRenew = !shop.isDemo && user.role === "admin" && state !== "none";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Subscription</h1>
        <p className="text-muted-foreground text-sm">Your Rentque plan, renewals and payment history.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCardIcon className="size-4" aria-hidden="true" />
            Current plan
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Plan</p>
            <p className="mt-1 font-semibold">{shop.plan ? PLAN_NAMES[shop.plan] : "Managed account"}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Paid until</p>
            <p className="mt-1 font-semibold">{shop.endsAt ? formatDate(shop.endsAt, "long") : "—"}</p>
            <p className="text-muted-foreground text-xs">{subscriptionSummary(shop.endsAt)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Status</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <SubscriptionBadge state={state} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Renew or upgrade</CardTitle>
          <CardDescription>
            {shop.isDemo
              ? "This is the demo account, so it can't be renewed."
              : state === "none"
                ? "Your account is managed by the Rentque team and doesn't need renewing."
                : "Pick a plan to renew or switch to — e.g. move from Monthly to Yearly to save. Renewing early adds the new period on top of the time you have left, so you never lose days."}
          </CardDescription>
        </CardHeader>
        {canRenew ? (
          <CardContent>
            <SubscriptionRenew
              plans={plans}
              currentPlan={shop.plan}
              endsAt={shop.endsAt?.toISOString() ?? null}
              businessName={shop.name}
              razorpayEnabled={isRazorpayConfigured()}
            />
          </CardContent>
        ) : shop.isDemo ? (
          <CardContent>
            <p className="flex items-center gap-2 text-sm">
              <SparklesIcon className="text-primary size-4" aria-hidden="true" />
              Like what you see? Use “Get your own account” at the top to buy a plan.
            </p>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptTextIcon className="size-4" aria-hidden="true" />
            Payment history
          </CardTitle>
          <CardDescription>Every payment you&apos;ve made to Rentque.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              No payments yet.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">
                      {PLAN_NAMES[p.plan]} · {p.purpose === "signup" ? "First payment" : "Renewal"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {p.paidAt ? `Paid ${formatDate(p.paidAt)}` : "—"}
                      {p.periodStart && p.periodEnd
                        ? ` · covers ${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`
                        : ""}
                    </span>
                    {p.razorpayPaymentId ? (
                      <span className="text-muted-foreground truncate font-mono text-xs">{p.razorpayPaymentId}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatPaise(p.amountPaise)}
                    {p.setupFeePaise > 0 ? (
                      <span className="text-muted-foreground block text-xs font-normal sm:text-right">
                        incl. {formatPaise(p.setupFeePaise)} setup
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
