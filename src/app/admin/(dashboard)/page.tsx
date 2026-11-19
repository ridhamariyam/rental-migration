import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxesIcon,
  Building2Icon,
  CalendarClockIcon,
  CalendarIcon,
  CircleCheckIcon,
  ClockAlertIcon,
  IndianRupeeIcon,
  LockIcon,
  PlusIcon,
  RepeatIcon,
  SparklesIcon,
  StoreIcon,
  TrendingUpIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PaymentStatusBadge,
  planLabel,
  StatTile,
  SubscriptionBadge,
} from "@/components/admin/billing-ui";
import { PlatformRevenueChart } from "@/components/admin/platform-revenue-chart";
import { adminPaths } from "@/lib/admin-paths";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/plans";
import { avatarGradient } from "@/lib/tenant-avatar";
import {
  getPlatformOverview,
  listPlatformActivity,
  listRecentTenants,
} from "@/server/admin/service";
import { getBillingStats, listRecentPaidPayments } from "@/server/billing/service";

export const metadata = {
  title: "Dashboard — Rentique Admin",
};

// The platform owner's first screen: always live numbers, never cached.
export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  "tenant.created": "Tenant created",
  "tenant.blocked": "Tenant blocked",
  "tenant.unblocked": "Tenant unblocked",
  "tenant.demo_changed": "Demo account changed",
  "tenant.owner_password_reset": "Owner password reset",
  "subscription.paid": "Online payment",
  "subscription.updated": "Subscription edited",
  "subscription.payment_recorded": "Offline payment",
  "subscription.payment_resolved": "Payment resolved",
};

const numberFormat = new Intl.NumberFormat("en-IN");

const STATE_DOT = {
  active: "bg-emerald-500",
  expiring: "bg-amber-500",
  grace: "bg-orange-500",
  locked: "bg-destructive",
  none: "bg-muted-foreground/40",
} as const;

export default async function AdminDashboardPage() {
  const [overview, billing, recentPayments, recentTenants, activity] = await Promise.all([
    getPlatformOverview(),
    getBillingStats(),
    listRecentPaidPayments(6),
    listRecentTenants(6),
    listPlatformActivity({ limit: 8 }),
  ]);

  const { tenants, subscriptions, usage } = overview;
  const overdue = subscriptions.grace + subscriptions.locked;
  const yearRevenue = overview.monthly.reduce((acc, m) => acc + m.revenuePaise, 0);

  const subscriptionRows = [
    { label: "Active", count: subscriptions.active, href: adminPaths.tenants + "?subscription=active", state: "active" as const },
    { label: "Expiring in 7 days", count: subscriptions.expiring, href: `${adminPaths.dues}?filter=expiring`, state: "expiring" as const },
    { label: "Overdue (grace period)", count: subscriptions.grace, href: `${adminPaths.dues}?filter=grace`, state: "grace" as const },
    { label: "Locked out", count: subscriptions.locked, href: `${adminPaths.dues}?filter=locked`, state: "locked" as const },
    { label: "No plan set", count: subscriptions.none, href: `${adminPaths.dues}?filter=none`, state: "none" as const },
  ];

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Revenue, subscriptions and activity across every business on the platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={adminPaths.dues} />}>
            <CalendarClockIcon />
            Dues
          </Button>
          <Button nativeButton={false} render={<Link href={adminPaths.newTenant} />}>
            <PlusIcon />
            Add tenant
          </Button>
        </div>
      </div>

      {billing.needsAttention > 0 || overdue > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {billing.needsAttention > 0 ? (
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertTriangleIcon className="text-amber-600" />
              <AlertTitle>
                {billing.needsAttention} paid signup{billing.needsAttention === 1 ? "" : "s"} need{billing.needsAttention === 1 ? "s" : ""} attention
              </AlertTitle>
              <AlertDescription>
                <span>
                  The customer paid but the account couldn&apos;t be created automatically.{" "}
                  <Link className="text-foreground font-medium underline" href={`${adminPaths.payments}?status=attention`}>
                    Review payments
                  </Link>
                </span>
              </AlertDescription>
            </Alert>
          ) : null}
          {overdue > 0 ? (
            <Alert className="border-destructive/25 bg-destructive/5">
              <ClockAlertIcon className="text-destructive" />
              <AlertTitle>
                {overdue} business{overdue === 1 ? "" : "es"} overdue on payment
              </AlertTitle>
              <AlertDescription>
                <span>
                  {subscriptions.locked} locked out, {subscriptions.grace} in the grace
                  period.{" "}
                  <Link className="text-foreground font-medium underline" href={adminPaths.dues}>
                    Chase dues
                  </Link>
                </span>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}

      <section aria-label="Revenue" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="This month"
          value={formatPaise(billing.monthRevenuePaise)}
          hint="Subscription payments received"
          icon={IndianRupeeIcon}
          tone="primary"
        />
        <StatTile
          label="Recurring / month"
          value={formatPaise(overview.recurringPaisePerMonth)}
          hint="Est. from live yearly + monthly plans"
          icon={RepeatIcon}
        />
        <StatTile
          label="Last 12 months"
          value={formatPaise(yearRevenue)}
          hint={`All time ${formatPaise(billing.totalRevenuePaise)}`}
          icon={TrendingUpIcon}
        />
        <StatTile
          label="Paid signups"
          value={numberFormat.format(billing.paidSignups)}
          hint={`${billing.pendingCheckouts} checkout${billing.pendingCheckouts === 1 ? "" : "s"} started in 24h`}
          icon={UserPlusIcon}
        />
      </section>

      <section aria-label="Tenants" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Tenants"
          value={numberFormat.format(tenants.total)}
          hint={`${tenants.active} active · ${tenants.blocked} blocked`}
          icon={Building2Icon}
        />
        <StatTile
          label="Paying"
          value={numberFormat.format(subscriptions.active + subscriptions.expiring)}
          hint={`+${tenants.newThisMonth} new this month`}
          icon={CircleCheckIcon}
          tone="success"
        />
        <StatTile
          label="Expiring soon"
          value={numberFormat.format(subscriptions.expiring)}
          hint="Within 7 days"
          icon={CalendarClockIcon}
          tone={subscriptions.expiring > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Overdue"
          value={numberFormat.format(overdue)}
          hint={`${subscriptions.locked} locked`}
          icon={LockIcon}
          tone={overdue > 0 ? "danger" : "neutral"}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Subscription revenue</CardTitle>
            <CardDescription>Paid subscription payments per month, last 12 months.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={adminPaths.payments} />}>
                All payments
                <ArrowRightIcon />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <PlatformRevenueChart data={overview.monthly} />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Subscriptions</CardTitle>
            <CardDescription>Excludes the demo account.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {subscriptionRows.map((row) => (
              <Link
                key={row.label}
                href={row.href}
                className="hover:bg-muted/60 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors"
              >
                <span className="flex min-w-0 items-center gap-2.5 text-sm">
                  <span className={`size-2 shrink-0 rounded-full ${STATE_DOT[row.state]}`} aria-hidden="true" />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="font-semibold tabular-nums">{row.count}</span>
              </Link>
            ))}
            <div className="mt-3 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <SparklesIcon className="text-primary size-4" aria-hidden="true" />
                Demo account
              </div>
              {billing.demoTenant ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  <Link href={`${adminPaths.tenants}/${billing.demoTenant.id}`} className="text-foreground font-medium hover:underline">
                    {billing.demoTenant.name}
                  </Link>{" "}
                  {billing.demoTenant.isActive ? "is live on the “Try the demo” button." : "is blocked, so the demo button is hidden."}
                </p>
              ) : (
                <p className="text-muted-foreground mt-1 text-sm">
                  None set. Open a tenant and turn on “Use as demo account”.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Recent payments</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={adminPaths.payments} />}>
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No payments yet.</p>
            ) : (
              <ul className="divide-y">
                {recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {p.shopName ?? p.signupDetails?.businessName ?? "Unknown business"}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {planLabel(p.plan)} · {p.purpose === "signup" ? "Signup" : "Renewal"}
                        {p.paidAt ? ` · ${formatDate(p.paidAt)}` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">{formatPaise(p.amountPaise)}</span>
                      {p.needsAttention ? <PaymentStatusBadge status={p.status} needsAttention /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Newest tenants</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={adminPaths.tenants} />}>
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recentTenants.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No tenants yet.</p>
            ) : (
              <ul className="divide-y">
                {recentTenants.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`${adminPaths.tenants}/${t.id}`}
                      className="group flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="size-8 shrink-0 rounded-full shadow-sm"
                          style={{ backgroundImage: avatarGradient(t.name) }}
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium group-hover:underline">{t.name}</span>
                          <span className="text-muted-foreground truncate text-xs">
                            Joined {formatDate(t.createdAt)} · {planLabel(t.plan)}
                          </span>
                        </span>
                      </span>
                      <SubscriptionBadge endsAt={t.subscriptionEndsAt} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Admin activity</CardTitle>
            <CardDescription>Billing and account changes.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="bg-primary/60 mt-1.5 size-2 shrink-0 rounded-full" aria-hidden="true" />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{ACTION_LABELS[a.action] ?? a.action}</span>
                      <span className="text-muted-foreground line-clamp-2 text-xs">{a.summary ?? a.shopName}</span>
                      <span className="text-muted-foreground text-xs">{formatDateTime(a.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-label="Platform usage" className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Platform usage</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Bookings" value={numberFormat.format(usage.bookings)} icon={CalendarIcon} />
          <StatTile label="Last 30 days" value={numberFormat.format(usage.bookingsLast30Days)} hint="New bookings" icon={TrendingUpIcon} />
          <StatTile label="Products" value={numberFormat.format(usage.products)} icon={BoxesIcon} />
          <StatTile label="Customers" value={numberFormat.format(usage.customers)} icon={UsersIcon} />
          <StatTile label="Staff users" value={numberFormat.format(usage.staff)} icon={UserPlusIcon} />
          <StatTile label="Outlets" value={numberFormat.format(usage.outlets)} icon={StoreIcon} />
        </div>
      </section>
    </main>
  );
}
