import Link from "next/link";
import { Building2Icon, EyeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ListCardRow,
  ListCards,
  TableOnly,
} from "@/components/tenant/list-cards";
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
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import { avatarGradient } from "@/lib/tenant-avatar";
import type { OutletListQuery } from "@/lib/validation/outlets";
import { listOutlets } from "@/server/outlets/service";

function outletsHref(query: OutletListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.outlets}${search ? `?${search}` : ""}`;
}

/**
 * Async Server Component: fetches straight from `listOutlets`, scoped to
 * the signed-in tenant. Rendered inside a `<Suspense>` in `page.tsx` so
 * search/pagination changes show a fresh loading skeleton instead of a
 * flash of stale data (same pattern as `TenantsTable`).
 */
export async function OutletsTable({
  shopId,
  query,
}: {
  shopId: string;
  query: OutletListQuery;
}) {
  const { items, total, page, totalPages } = await listOutlets(shopId, query);
  const hasFilters = Boolean(query.q) || query.status !== "all";

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No outlets match your filters" : "No outlets yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term or clear the status filter."
              : "Add your first branch to start assigning staff and inventory to it."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <ListCards>
        {items.map((outlet) => (
          <ListCardRow
            key={outlet.id}
            media={
              <span
                className="size-10 rounded-full shadow-sm"
                style={{ backgroundImage: avatarGradient(outlet.name) }}
                aria-hidden="true"
              />
            }
            title={outlet.name}
            badge={
              outlet.isActive ? (
                <Badge
                  variant="secondary"
                  className="bg-primary/10 text-primary shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  Active
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-muted-foreground shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  Inactive
                </Badge>
              )
            }
            meta={
              <>
                {outlet.code} · {outlet.managerName ?? "Unassigned"}
              </>
            }
            action={
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`${tenantPaths.outlets}/${outlet.id}`} />}
              >
                <EyeIcon />
                View
              </Button>
            }
          />
        ))}
      </ListCards>

      <TableOnly>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Outlet
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Contact
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Manager
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((outlet) => (
              <TableRow key={outlet.id}>
                <TableCell className="px-4 py-3 font-medium">
                  <Link
                    href={`${tenantPaths.outlets}/${outlet.id}`}
                    className="group flex items-center gap-3"
                  >
                    <span
                      className="size-8 shrink-0 rounded-full shadow-sm"
                      style={{ backgroundImage: avatarGradient(outlet.name) }}
                      aria-hidden="true"
                    />
                    <div className="flex flex-col">
                      <span className="group-hover:underline">
                        {outlet.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {outlet.code}
                      </span>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  <div className="flex flex-col">
                    <span>{outlet.phone ?? "—"}</span>
                    <span className="truncate">{outlet.address ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {outlet.managerName ?? "Unassigned"}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {outlet.isActive ? (
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
                      Inactive
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableOnly>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} outlet{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={outletsHref(query, Math.max(1, page - 1))}
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
                    href={outletsHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={outletsHref(query, Math.min(totalPages, page + 1))}
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
