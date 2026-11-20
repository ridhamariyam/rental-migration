import Link from "next/link";
import { CalendarCheckIcon, MessageCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  planLabel,
  renewalReminderLink,
  SubscriptionBadge,
  subscriptionSummary,
} from "@/components/admin/billing-ui";
import { RecordPaymentDialog } from "@/components/admin/record-payment-dialog";
import { adminPaths } from "@/lib/admin-paths";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/plans";
import { avatarGradient } from "@/lib/tenant-avatar";
import {
  DUE_FILTERS,
  getDueCounts,
  listDues,
  type DueFilter,
} from "@/server/admin/service";
import { getPlans } from "@/server/billing/plans";

export const metadata = {
  title: "Dues — Rentique Admin",
};

export const dynamic = "force-dynamic";

const FILTER_LABELS: Record<DueFilter, { label: string; empty: string }> = {
  due: { label: "All due", empty: "Every business is paid up. Nothing to chase right now." },
  expiring: { label: "Expiring in 7 days", empty: "No subscriptions end in the next 7 days." },
  grace: { label: "Grace period", empty: "No business is in its grace period." },
  locked: { label: "Locked", empty: "No business is locked out." },
  none: { label: "No plan", empty: "Every business has a plan set." },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminDuesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).filter;
  const filter: DueFilter = (DUE_FILTERS as readonly string[]).includes(String(raw)) ? (raw as DueFilter) : "due";

  const [items, counts, plans] = await Promise.all([listDues(filter), getDueCounts(), getPlans()]);
  const outstandingPaise = items
    .filter((i) => i.state === "grace" || i.state === "locked")
    .reduce((acc, i) => acc + (i.renewalPaise ?? 0), 0);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Dues</h1>
        <p className="text-muted-foreground text-sm">
          Subscriptions to chase: ending soon, in the 7-day grace period, or locked. Send a WhatsApp reminder or record a
          payment you received.
        </p>
      </div>

      <nav aria-label="Filter dues" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="bg-muted inline-flex min-w-max gap-1 rounded-lg p-1">
          {DUE_FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "due" ? adminPaths.dues : `${adminPaths.dues}?filter=${f}`}
              aria-current={f === filter ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                f === filter
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {FILTER_LABELS[f].label}
              <span className="bg-foreground/5 rounded px-1.5 text-xs tabular-nums">{counts[f]}</span>
            </Link>
          ))}
        </div>
      </nav>

      {outstandingPaise > 0 ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Overdue renewals in this view: </span>
          <span className="font-semibold tabular-nums">{formatPaise(outstandingPaise)}</span>
        </p>
      ) : null}

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        {items.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheckIcon />
              </EmptyMedia>
              <EmptyTitle>All clear</EmptyTitle>
              <EmptyDescription>{FILTER_LABELS[filter].empty}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            <li className="text-muted-foreground hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-4 px-4 py-2.5 text-xs font-medium tracking-wide uppercase lg:grid">
              <span>Business</span>
              <span>Subscription</span>
              <span>Owner</span>
              <span className="text-right">Actions</span>
            </li>
            {items.map((item) => {
              const reminder = renewalReminderLink({
                phone: item.ownerPhone ?? item.phone,
                businessName: item.name,
                ownerName: item.ownerName,
                endsAt: item.subscriptionEndsAt,
                amountPaise: item.renewalPaise,
              });
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 px-4 py-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
                >
                  <Link href={`${adminPaths.tenants}/${item.id}`} className="group flex min-w-0 items-center gap-3">
                    <span
                      className="size-9 shrink-0 rounded-full shadow-sm"
                      style={{ backgroundImage: avatarGradient(item.name) }}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium group-hover:underline">{item.name}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {item.email}
                        {!item.isActive ? " · Blocked" : ""}
                      </span>
                    </span>
                  </Link>

                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <SubscriptionBadge state={item.state} />
                      <span className="text-sm">{planLabel(item.plan)}</span>
                      {item.renewalPaise ? (
                        <span className="text-muted-foreground text-xs tabular-nums">{formatPaise(item.renewalPaise)}</span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {subscriptionSummary(item.subscriptionEndsAt)}
                      {item.lastPaidAt ? ` · last paid ${formatDate(item.lastPaidAt)}` : ""}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-col text-sm">
                    <span className="truncate">{item.ownerName ?? "—"}</span>
                    <span className="text-muted-foreground truncate text-xs">{item.ownerPhone ?? item.phone}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {reminder ? (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<a href={reminder} target="_blank" rel="noopener noreferrer" />}
                      >
                        <MessageCircleIcon />
                        Remind
                      </Button>
                    ) : null}
                    <RecordPaymentDialog
                      tenantId={item.id}
                      tenantName={item.name}
                      plans={plans}
                      customDeal={item.customDeal}
                      currentPlan={item.plan}
                      currentEndsAt={item.subscriptionEndsAt?.toISOString() ?? null}
                      hasPaidBefore={Boolean(item.lastPaidAt)}
                      triggerLabel="Mark paid"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
