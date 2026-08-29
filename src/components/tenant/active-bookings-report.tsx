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
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";
import { tenantPaths } from "@/lib/tenant-paths";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listActiveBookings } from "@/server/reports/service";
import { CircleCheckIcon, PackageOpenIcon } from "lucide-react";

/**
 * Bookings currently out with a customer (doc §21's "Pending returns"/
 * "Pending deposits" — see `src/server/reports/service.ts`'s doc comment
 * on why `kind: "deposits"` means "deposit money currently held", not a
 * half-settled backlog this schema doesn't have). Paginated: a busy shop's
 * "currently out" list is exactly the kind of open-ended set every other
 * list page in this app paginates.
 */
export async function ActiveBookingsReport({
  actor,
  kind,
  outletId,
  page,
  pageSize,
}: {
  actor: TenantSessionUser;
  kind: "returns" | "deposits";
  outletId?: string;
  page: number;
  pageSize: number;
}) {
  const { items, total, totalPages } = await listActiveBookings(actor, {
    kind,
    outletId,
    page,
    pageSize,
  });

  if (items.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheckIcon />
          </EmptyMedia>
          <EmptyTitle>
            {kind === "returns" ? "Nothing due back" : "No deposits held"}
          </EmptyTitle>
          <EmptyDescription>
            {kind === "returns"
              ? "Every picked-up rental has already been returned."
              : "No rental currently out is holding a security deposit."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function href(nextPage: number): string {
    const params = new URLSearchParams();
    params.set("report", kind === "returns" ? "pending-returns" : "deposits-held");
    if (outletId) params.set("outletId", outletId);
    if (nextPage > 1) params.set("page", String(nextPage));
    return `${tenantPaths.reports}?${params.toString()}`;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Booking
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Customer
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Outlet
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Due back
            </TableHead>
            {kind === "returns" ? (
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
            ) : (
              <TableHead className="text-muted-foreground h-11 px-4 text-right text-xs font-medium tracking-wide uppercase">
                Deposit held
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">{item.bookingNumber}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {item.productName} · {item.sku}
                  </span>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 text-sm">
                <div className="flex flex-col">
                  <span>{item.customerName}</span>
                  <span className="text-muted-foreground text-xs">
                    {item.customerPhone}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {item.outletName ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm">
                {formatDate(item.toDate)}
              </TableCell>
              {kind === "returns" ? (
                <TableCell className="px-4 py-3">
                  {item.daysOverdue > 0 ? (
                    <Badge variant="destructive">
                      <PackageOpenIcon />
                      {item.daysOverdue} day{item.daysOverdue === 1 ? "" : "s"} overdue
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      On time
                    </Badge>
                  )}
                </TableCell>
              ) : (
                <TableCell className="px-4 py-3 text-right text-sm font-medium">
                  {formatMoney(item.securityDeposit)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} booking{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={href(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                {page}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href={href(Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
                className={
                  page >= totalPages ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  );
}
