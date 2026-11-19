import Link from "next/link";
import { ReceiptIndianRupeeIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { PaymentStatusBadge, planLabel } from "@/components/admin/billing-ui";
import { ResolvePaymentAction } from "@/components/admin/tenant-billing-actions";
import { adminPaths } from "@/lib/admin-paths";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { paymentListQuerySchema, type PaymentListQuery } from "@/lib/validation/billing";
import { getBillingStats, listSubscriptionPayments } from "@/server/billing/service";

export const metadata = {
  title: "Payments — Rentique Admin",
};

export const dynamic = "force-dynamic";

const TABS: { value: PaymentListQuery["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "attention", label: "Needs attention" },
  { value: "created", label: "Checkout started" },
  { value: "failed", label: "Failed" },
];

function href(status: PaymentListQuery["status"], page = 1): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${adminPaths.payments}${search ? `?${search}` : ""}`;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const query = paymentListQuerySchema.parse({ page: raw.page, status: raw.status });
  const [{ items, total, page, totalPages }, stats] = await Promise.all([
    listSubscriptionPayments(query),
    getBillingStats(),
  ]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground text-sm">
          Every subscription payment: online (Razorpay) checkouts and offline payments you recorded.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "All time", value: formatPaise(stats.totalRevenuePaise) },
          { label: "This month", value: formatPaise(stats.monthRevenuePaise) },
          { label: "Paid signups", value: String(stats.paidSignups) },
          { label: "Needs attention", value: String(stats.needsAttention), warn: stats.needsAttention > 0 },
        ].map((tile) => (
          <div
            key={tile.label}
            className={cn(
              "bg-card ring-foreground/10 flex flex-col rounded-xl p-3 shadow-xs ring-1",
              tile.warn && "bg-amber-500/5 ring-amber-500/30",
            )}
          >
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{tile.label}</span>
            <span className="text-lg font-semibold tabular-nums">{tile.value}</span>
          </div>
        ))}
      </div>

      <nav aria-label="Filter payments" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="bg-muted inline-flex min-w-max gap-1 rounded-lg p-1">
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              href={href(tab.value)}
              aria-current={tab.value === query.status ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                tab.value === query.status
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.value === "attention" && stats.needsAttention > 0 ? (
                <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 text-xs tabular-nums">{stats.needsAttention}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </nav>

      <div className="bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        {items.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptIndianRupeeIcon />
              </EmptyMedia>
              <EmptyTitle>No payments here</EmptyTitle>
              <EmptyDescription>
                {query.status === "all"
                  ? "Payments show up here as soon as a business pays online or you record an offline payment."
                  : "Nothing matches this filter."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            <li className="text-muted-foreground hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-4 px-4 py-2.5 text-xs font-medium tracking-wide uppercase lg:grid">
              <span>Business</span>
              <span>Plan</span>
              <span className="text-right">Amount</span>
              <span>Details</span>
              <span className="w-24 text-right">Status</span>
            </li>
            {items.map((p) => {
              const name = p.shopName ?? p.signupDetails?.businessName ?? "Unknown business";
              const contact = p.signupDetails
                ? [p.signupDetails.ownerEmail, p.signupDetails.businessPhone].filter(Boolean).join(" · ")
                : null;
              return (
                <li
                  key={p.id}
                  className={cn(
                    "flex flex-col gap-2 px-4 py-3.5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] lg:items-center lg:gap-4",
                    p.needsAttention && "bg-amber-500/5",
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
                    <div className="flex min-w-0 flex-col">
                      {p.shopId ? (
                        <Link href={`${adminPaths.tenants}/${p.shopId}`} className="truncate font-medium hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{name}</span>
                      )}
                      <span className="text-muted-foreground truncate text-xs">
                        {formatDateTime(p.paidAt ?? p.createdAt)}
                        {!p.shopId && contact ? ` · ${contact}` : ""}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums lg:hidden">{formatPaise(p.amountPaise)}</span>
                  </div>

                  <span className="text-sm">
                    {planLabel(p.plan)} · <span className="text-muted-foreground">{p.purpose === "signup" ? "Signup" : "Renewal"}</span>
                  </span>

                  <span className="hidden text-right text-sm font-semibold tabular-nums lg:block">
                    {formatPaise(p.amountPaise)}
                    {p.setupFeePaise > 0 ? (
                      <span className="text-muted-foreground block text-xs font-normal">
                        incl. {formatPaise(p.setupFeePaise)} setup
                      </span>
                    ) : null}
                  </span>

                  <div className="text-muted-foreground flex min-w-0 flex-col text-xs">
                    {p.periodStart && p.periodEnd ? (
                      <span>
                        Covers {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                      </span>
                    ) : null}
                    {p.razorpayPaymentId ? <span className="truncate font-mono">{p.razorpayPaymentId}</span> : null}
                    {p.note ? <span className="line-clamp-2">{p.note}</span> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:w-24 lg:flex-col lg:items-end">
                    <PaymentStatusBadge status={p.status} needsAttention={p.needsAttention} />
                    {p.needsAttention ? <ResolvePaymentAction paymentId={p.id} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <p className="text-muted-foreground text-sm">
              {total} payment{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </p>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={href(query.status, Math.max(1, page - 1))}
                    aria-disabled={page <= 1}
                    className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href={href(query.status, Math.min(totalPages, page + 1))}
                    aria-disabled={page >= totalPages}
                    className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </div>
    </main>
  );
}
