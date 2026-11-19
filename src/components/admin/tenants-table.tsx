import Link from "next/link";
import { Building2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminPaths } from "@/lib/admin-paths";
import { formatDate } from "@/lib/format";
import { paginationRange } from "@/lib/pagination-range";
import { avatarGradient } from "@/lib/tenant-avatar";
import type { TenantListQuery } from "@/lib/validation/tenants";
import { listTenants } from "@/server/tenants/service";
import {
  planLabel,
  SubscriptionBadge,
  subscriptionSummary,
} from "@/components/admin/billing-ui";

function tenantsHref(query: TenantListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.subscription !== "all") params.set("subscription", query.subscription);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${adminPaths.tenants}${search ? `?${search}` : ""}`;
}

/**
 * Async Server Component: fetches straight from `listTenants` (no
 * client-side round trip to the API route, which exists for future/external
 * consumers, not for this page). Rendered inside a `<Suspense>` in
 * `page.tsx` so search/pagination changes show a fresh loading skeleton
 * instead of a flash of stale data.
 *
 * Renders bare (no own border/rounding) — `page.tsx` wraps this and
 * `TenantFilters` together in a single card, so the toolbar and the table
 * read as one surface rather than stacked separate elements.
 */
export async function TenantsTable({ query }: { query: TenantListQuery }) {
  const { items, total, page, totalPages } = await listTenants(query);
  const hasFilters =
    Boolean(query.q) || query.status !== "all" || query.subscription !== "all";

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters
              ? "No tenants match your filters"
              : "No tenants onboarded yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term or clear the status filter."
              : "Businesses appear here when they sign up and pay, or when you add one."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Name
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-11 px-4 text-xs font-medium tracking-wide uppercase md:table-cell">
              Contact
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Subscription
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Status
            </TableHead>
            <TableHead className="text-muted-foreground hidden h-11 px-4 text-xs font-medium tracking-wide uppercase lg:table-cell">
              Created
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((tenant) => (
            <TableRow key={tenant.id}>
              <TableCell className="px-4 py-3 font-medium">
                <Link
                  href={`${adminPaths.tenants}/${tenant.id}`}
                  className="group flex items-center gap-3"
                >
                  <span
                    className="size-8 shrink-0 rounded-full shadow-sm"
                    style={{ backgroundImage: avatarGradient(tenant.name) }}
                    aria-hidden="true"
                  />
                  <span className="group-hover:underline">{tenant.name}</span>
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground hidden px-4 py-3 text-sm md:table-cell">
                <div className="flex flex-col">
                  <span>{tenant.email}</span>
                  <span>{tenant.phone}</span>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex flex-col items-start gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <SubscriptionBadge endsAt={tenant.subscriptionEndsAt} />
                    {tenant.isDemo ? (
                      <Badge variant="secondary" className="bg-violet-500/10 text-violet-700 dark:text-violet-400">
                        Demo
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {planLabel(tenant.plan)}
                    {tenant.subscriptionEndsAt ? (
                      <span className="hidden sm:inline">
                        {` · ${subscriptionSummary(tenant.subscriptionEndsAt)}`}
                      </span>
                    ) : null}
                  </span>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3">
                {tenant.isActive ? (
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-primary"
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-current" />
                    Blocked
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground hidden px-4 py-3 text-sm lg:table-cell">
                {formatDate(tenant.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} tenant{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={tenantsHref(query, Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                className={
                  page <= 1 ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
            {paginationRange(page, totalPages).map((item, index) =>
              item === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href={tenantsHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={tenantsHref(query, Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
                className={
                  page >= totalPages
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  );
}
