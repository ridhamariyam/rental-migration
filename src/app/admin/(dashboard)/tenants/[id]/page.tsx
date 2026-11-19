import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  BoxesIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircle2Icon,
  IndianRupeeIcon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  SparklesIcon,
  StoreIcon,
  UsersIcon,
  UserRoundIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  planLabel,
  renewalReminderLink,
  StatTile,
  SubscriptionBadge,
  subscriptionSummary,
} from "@/components/admin/billing-ui";
import { RecordPaymentDialog } from "@/components/admin/record-payment-dialog";
import {
  DemoToggleAction,
  EditSubscriptionDialog,
  ResetOwnerPasswordAction,
} from "@/components/admin/tenant-billing-actions";
import { TenantStatusAction } from "@/components/admin/tenant-status-action";
import { adminPaths } from "@/lib/admin-paths";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { formatPaise, PLANS } from "@/lib/plans";
import { avatarGradient } from "@/lib/tenant-avatar";
import {
  getDemoTenant,
  getTenantOwners,
  getTenantUsage,
  listPlatformActivity,
} from "@/server/admin/service";
import { listPaymentsForShop } from "@/server/billing/service";
import { getTenantById } from "@/server/tenants/service";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const tenant = await getTenantById(id);

  return {
    title: tenant ? `${tenant.name} — Rentique Admin` : "Tenant not found — Rentique Admin",
  };
}

const ACTION_LABELS: Record<string, string> = {
  "tenant.created": "Tenant created",
  "tenant.blocked": "Blocked",
  "tenant.unblocked": "Unblocked",
  "tenant.demo_changed": "Demo setting changed",
  "tenant.owner_password_reset": "Owner password reset",
  "subscription.paid": "Paid online",
  "subscription.updated": "Subscription edited",
  "subscription.payment_recorded": "Offline payment recorded",
  "subscription.payment_resolved": "Payment resolved",
};

const numberFormat = new Intl.NumberFormat("en-IN");

export default async function AdminTenantDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const tenant = await getTenantById(id);

  if (!tenant) {
    notFound();
  }

  const [owners, usage, payments, activity, demoTenant] = await Promise.all([
    getTenantOwners(tenant.id),
    getTenantUsage(tenant.id),
    listPaymentsForShop(tenant.id),
    listPlatformActivity({ shopId: tenant.id, limit: 8 }),
    getDemoTenant(),
  ]);

  const primaryOwner = owners[0] ?? null;
  const totalPaidPaise = payments.reduce((acc, p) => acc + p.amountPaise, 0);
  const renewalPaise =
    tenant.plan === "yearly" || tenant.plan === "monthly" ? PLANS[tenant.plan].price * 100 : null;
  const reminder = renewalReminderLink({
    phone: primaryOwner?.phone ?? tenant.phone,
    businessName: tenant.name,
    ownerName: primaryOwner ? `${primaryOwner.firstName} ${primaryOwner.lastName}` : null,
    endsAt: tenant.subscriptionEndsAt,
    amountPaise: renewalPaise,
  });

  const fields = [
    { label: "Email", value: tenant.email, icon: MailIcon },
    { label: "Phone", value: tenant.phone, icon: PhoneIcon },
    { label: "Address", value: tenant.address ?? "—", icon: MapPinIcon },
    { label: "Onboarded", value: formatDate(tenant.createdAt, "long"), icon: BuildingIcon },
  ];

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={adminPaths.tenants}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Tenants
        </Link>

        {created === "1" ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">Tenant created successfully.</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <span
            className="size-14 shrink-0 rounded-2xl shadow-sm"
            style={{ backgroundImage: avatarGradient(tenant.name) }}
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight break-words">{tenant.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              {tenant.isActive ? (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  <span className="size-1.5 rounded-full bg-current" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-current" />
                  Blocked
                </Badge>
              )}
              <SubscriptionBadge endsAt={tenant.subscriptionEndsAt} />
              {tenant.isDemo ? (
                <Badge variant="secondary" className="bg-violet-500/10 text-violet-700 dark:text-violet-400">
                  <SparklesIcon />
                  Demo account
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <section aria-label="Usage" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Bookings" value={numberFormat.format(usage.bookings)} hint={`${usage.bookingsLast30Days} in last 30 days`} icon={CalendarIcon} />
        <StatTile label="Booking value" value={formatMoney(usage.bookingValue)} hint="Excl. cancelled" icon={IndianRupeeIcon} />
        <StatTile label="Products" value={numberFormat.format(usage.products)} icon={BoxesIcon} />
        <StatTile label="Customers" value={numberFormat.format(usage.customers)} icon={UsersIcon} />
        <StatTile label="Staff" value={numberFormat.format(usage.staff)} icon={UserRoundIcon} />
        <StatTile
          label="Outlets"
          value={numberFormat.format(usage.outlets)}
          hint={usage.lastBookingAt ? `Last booking ${formatDate(usage.lastBookingAt)}` : "No bookings yet"}
          icon={StoreIcon}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription</CardTitle>
              <CardDescription>
                {tenant.isDemo ? "The demo account never locks." : "What this business pays you for Rentque."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Plan</p>
                  <p className="mt-1 font-semibold">{planLabel(tenant.plan)}</p>
                  {renewalPaise ? (
                    <p className="text-muted-foreground text-xs">
                      {formatPaise(renewalPaise)} / {PLANS[tenant.plan as "yearly" | "monthly"].periodLabel}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Paid until</p>
                  <p className="mt-1 font-semibold">
                    {tenant.subscriptionEndsAt ? formatDate(tenant.subscriptionEndsAt, "long") : "—"}
                  </p>
                  <p className="text-muted-foreground text-xs">{subscriptionSummary(tenant.subscriptionEndsAt)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Total paid</p>
                  <p className="mt-1 font-semibold tabular-nums">{formatPaise(totalPaidPaise)}</p>
                  <p className="text-muted-foreground text-xs">
                    {payments.length} payment{payments.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <RecordPaymentDialog
                  tenantId={tenant.id}
                  tenantName={tenant.name}
                  currentPlan={tenant.plan}
                  currentEndsAt={tenant.subscriptionEndsAt?.toISOString() ?? null}
                  hasPaidBefore={payments.length > 0}
                />
                <EditSubscriptionDialog
                  tenantId={tenant.id}
                  plan={tenant.plan}
                  endsAt={tenant.subscriptionEndsAt?.toISOString() ?? null}
                />
                {reminder ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<a href={reminder} target="_blank" rel="noopener noreferrer" />}
                  >
                    <MessageCircleIcon />
                    WhatsApp reminder
                  </Button>
                ) : null}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">Payment history</h3>
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
                            {planLabel(p.plan)} · {p.purpose === "signup" ? "Signup" : "Renewal"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {p.paidAt ? formatDate(p.paidAt) : "—"}
                            {p.periodStart && p.periodEnd
                              ? ` · covers ${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`
                              : ""}
                          </span>
                          {p.note ? <span className="text-muted-foreground line-clamp-2 text-xs">{p.note}</span> : null}
                          {p.razorpayPaymentId ? (
                            <span className="text-muted-foreground truncate font-mono text-xs">{p.razorpayPaymentId}</span>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{formatPaise(p.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.label} className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                      <field.icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{field.label}</p>
                      <p className="text-sm font-medium break-words">{field.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Owner accounts</CardTitle>
              <CardDescription>The people who sign in as the business owner.</CardDescription>
            </CardHeader>
            <CardContent>
              {owners.length === 0 ? (
                <p className="text-muted-foreground text-sm">No owner account found.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {owners.map((owner) => (
                    <li key={owner.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium">
                          {owner.firstName} {owner.lastName}
                          {!owner.isActive ? <span className="text-muted-foreground font-normal"> · deactivated</span> : null}
                        </span>
                        <span className="text-muted-foreground text-xs break-all">
                          {owner.email}
                          {owner.phone ? ` · ${owner.phone}` : ""}
                        </span>
                        {owner.mustChangePassword ? (
                          <span className="text-xs text-amber-700 dark:text-amber-400">
                            Hasn&apos;t set their own password yet
                          </span>
                        ) : null}
                      </div>
                      <ResetOwnerPasswordAction
                        tenantId={tenant.id}
                        userId={owner.id}
                        ownerName={owner.firstName}
                        disabledReason={tenant.isDemo ? "Not available for the demo account" : undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                {tenant.isActive
                  ? "Blocking this tenant immediately signs out every user at this business and prevents new sign-ins until it's unblocked."
                  : "All access is blocked. Unblocking immediately restores sign-in for every user at this business."}
              </p>
              <TenantStatusAction tenantId={tenant.id} isActive={tenant.isActive} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Website demo</CardTitle>
              <CardDescription>
                {tenant.isDemo
                  ? "Visitors who click “Try the demo” are signed in to this business."
                  : demoTenant
                    ? `“${demoTenant.name}” is the demo right now.`
                    : "No demo account is set, so the “Try the demo” button is hidden."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DemoToggleAction
                tenantId={tenant.id}
                isDemo={tenant.isDemo}
                otherDemoName={demoTenant && demoTenant.id !== tenant.id ? demoTenant.name : null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin history</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="bg-primary/60 mt-1.5 size-2 shrink-0 rounded-full" aria-hidden="true" />
                      <div className="flex min-w-0 flex-col">
                        <span className="text-sm font-medium">{ACTION_LABELS[a.action] ?? a.action}</span>
                        <span className="text-muted-foreground text-xs">{formatDateTime(a.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
