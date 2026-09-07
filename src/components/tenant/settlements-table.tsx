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
import { SettlementRowActions } from "@/components/tenant/settlement-row-actions";
import { SettlementStatusBadge } from "@/components/tenant/settlement-status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import type { SettlementListQuery } from "@/lib/validation/settlements";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listSettlements } from "@/server/settlements/service";
import { HandCoinsIcon } from "lucide-react";

export async function SettlementsTable({
  actor,
  query,
  canManage,
  basePath,
}: {
  actor: TenantSessionUser;
  query: SettlementListQuery;
  canManage: boolean;
  basePath: string;
}) {
  const { items, total, page, totalPages } = await listSettlements(actor, query);

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HandCoinsIcon />
          </EmptyMedia>
          <EmptyTitle>No settlements yet</EmptyTitle>
          <EmptyDescription>
            {query.status !== "all" || query.q || query.outletId
              ? "No settlements match these filters."
              : "A customer-owned item's rental creates one automatically once it's returned."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function href(nextPage: number): string {
    const params = new URLSearchParams();
    if (query.status !== "all") params.set("status", query.status);
    if (query.outletId) params.set("outletId", query.outletId);
    if (query.q) params.set("q", query.q);
    if (nextPage > 1) params.set("page", String(nextPage));
    const search = params.toString();
    return `${basePath}${search ? `?${search}` : ""}`;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Item
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Owner
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Gross / share
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Owner amount
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Status
            </TableHead>
            {canManage ? (
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Actions
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((settlement) => (
            <TableRow key={settlement.id}>
              <TableCell className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">{settlement.productName}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {settlement.sku} · {settlement.bookingNumber}
                  </span>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 text-sm">
                <div className="flex flex-col">
                  <span>{settlement.ownerName || "—"}</span>
                  {settlement.ownerPhone ? (
                    <span className="text-muted-foreground text-xs">
                      {settlement.ownerPhone}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {formatMoney(settlement.grossRentalAmount)} ·{" "}
                {formatMoney(settlement.shareAmount)} share
              </TableCell>
              <TableCell className="px-4 py-3 text-sm font-medium">
                {formatMoney(settlement.ownerAmount)}
                {settlement.paidAt ? (
                  <span className="text-muted-foreground block text-xs font-normal">
                    Paid {formatDate(settlement.paidAt)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="px-4 py-3">
                <SettlementStatusBadge status={settlement.status} />
              </TableCell>
              {canManage ? (
                <TableCell className="px-4 py-3">
                  {settlement.status === "pending" ? (
                    <SettlementRowActions
                      settlementId={settlement.id}
                      ownerName={settlement.ownerName}
                      ownerAmount={settlement.ownerAmount}
                    />
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} settlement{total === 1 ? "" : "s"} · page {page} of{" "}
          {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={href(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                className={
                  page <= 1 ? "pointer-events-none opacity-50" : undefined
                }
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
