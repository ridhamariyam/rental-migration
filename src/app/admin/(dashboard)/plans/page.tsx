import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { planLabel, SubscriptionBadge } from "@/components/admin/billing-ui";
import { PlanPricesForm } from "@/components/admin/plan-prices-form";
import { adminPaths } from "@/lib/admin-paths";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPaise, PLANS } from "@/lib/plans";
import { listTenantPaymentSummaries } from "@/server/admin/service";
import { getPlans, listPriceChanges } from "@/server/billing/plans";

export const metadata = {
  title: "Plans & pricing — Rentique Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const [plans, changes, tenants] = await Promise.all([
    getPlans(),
    listPriceChanges(),
    listTenantPaymentSummaries(),
  ]);
  const grandTotal = tenants.reduce((acc, t) => acc + t.totalPaidPaise, 0);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Plans &amp; pricing</h1>
        <p className="text-muted-foreground text-sm">
          Set what businesses pay for Rentque. New prices apply to the website and to checkouts started from now on.
          Past payments keep the amount that was charged.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current prices</CardTitle>
          <CardDescription>
            Defaults: Yearly {formatPaise(PLANS.yearly.price * 100)}, Monthly {formatPaise(PLANS.monthly.price * 100)},
            setup fee {formatPaise(PLANS.yearly.setupFee * 100)}. Custom deals are agreed on WhatsApp and recorded per
            tenant with “Record payment”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanPricesForm plans={plans} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Payment history by business</CardTitle>
            <CardDescription>
              What each business has paid you, at the prices they were charged. Open one to see every payment.
              {grandTotal > 0 ? ` Total received: ${formatPaise(grandTotal)}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tenants.length === 0 ? (
              <p className="text-muted-foreground text-sm">No businesses yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                <li className="text-muted-foreground hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-4 px-3 py-2 text-xs font-medium tracking-wide uppercase md:grid">
                  <span>Business</span>
                  <span>Plan</span>
                  <span>Last payment</span>
                  <span className="text-right">Total paid</span>
                </li>
                {tenants.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`${adminPaths.tenants}/${t.id}`}
                      className="hover:bg-muted/50 flex flex-col gap-1.5 px-3 py-3 transition-colors md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)] md:items-center md:gap-4"
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2 md:block">
                        <span className="truncate font-medium">{t.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums md:hidden">{formatPaise(t.totalPaidPaise)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-sm">
                        {t.isDemo ? (
                          <Badge variant="secondary" className="bg-violet-500/10 text-violet-700 dark:text-violet-400">
                            Demo
                          </Badge>
                        ) : (
                          <SubscriptionBadge endsAt={t.subscriptionEndsAt} />
                        )}
                        <span className="text-muted-foreground">{planLabel(t.plan)}</span>
                      </span>
                      <span className="text-muted-foreground text-xs md:text-sm">
                        {t.lastPaidAt && t.lastAmountPaise !== null
                          ? `${formatPaise(t.lastAmountPaise)} on ${formatDate(t.lastPaidAt)}`
                          : "No payments yet"}
                        {t.payments > 1 ? ` · ${t.payments} payments` : ""}
                      </span>
                      <span className="hidden text-right font-semibold tabular-nums md:block">
                        {formatPaise(t.totalPaidPaise)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HistoryIcon className="size-4" aria-hidden="true" />
              Price changes
            </CardTitle>
            <CardDescription>Every change you make, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {changes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No changes yet. The default prices are in use.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {changes.map((c) => (
                  <li key={c.id} className="flex gap-3">
                    <span className="bg-primary/60 mt-1.5 size-2 shrink-0 rounded-full" aria-hidden="true" />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm break-words">{c.summary}</span>
                      <span className="text-muted-foreground text-xs">{formatDateTime(c.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
