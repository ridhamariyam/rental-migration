import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { DecideLeaveActions } from "@/components/tenant/decide-leave-actions";
import { LeaveStatusBadge } from "@/components/tenant/leave-status-badge";
import { WithdrawLeaveDialog } from "@/components/tenant/withdraw-leave-dialog";
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import { formatDate } from "@/lib/format";
import {
  avatarGradient,
  initialsFor,
  resolveAvatarSrc,
} from "@/lib/tenant-avatar";
import type { LeaveListQuery } from "@/lib/validation/leave";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listLeaves } from "@/server/leave/service";
import { CalendarOffIcon } from "lucide-react";

function leaveHref(query: LeaveListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.status !== "all") params.set("status", query.status);
  if (query.staffId) params.set("staffId", query.staffId);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.leave}${search ? `?${search}` : ""}`;
}

export async function LeaveTable({
  actor,
  query,
  canManage,
}: {
  actor: TenantSessionUser;
  query: LeaveListQuery;
  canManage: boolean;
}) {
  const { items, total, page, totalPages } = await listLeaves(actor, query);
  const hasFilters = query.status !== "all" || Boolean(query.staffId);

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarOffIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No requests match your filters" : "No leave requests"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different status or clear the staff filter."
              : "Requests you make (or your team makes) appear here."}
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
            {canManage ? (
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Staff
              </TableHead>
            ) : null}
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Dates
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Reason
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Status
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((leave) => {
            const isOwn = leave.staffId === actor.id;
            const canDecide = canManage && !isOwn && leave.status === "pending";
            const canWithdraw =
              leave.status === "pending" && (isOwn || canManage);
            const name = `${leave.staffFirstName} ${leave.staffLastName}`.trim();

            return (
              <TableRow key={leave.id}>
                {canManage ? (
                  <TableCell className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8 shrink-0">
                        <AvatarImage src={resolveAvatarSrc(leave.staffAvatarUrl, name)} alt={name} />
                        <AvatarFallback
                          className="text-xs font-semibold text-white"
                          style={{ backgroundImage: avatarGradient(name) }}
                        >
                          {initialsFor(name)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{name}</span>
                    </div>
                  </TableCell>
                ) : null}
                <TableCell className="text-muted-foreground px-4 py-3 text-sm whitespace-nowrap">
                  {formatDate(leave.fromDate)} – {formatDate(leave.toDate)}
                </TableCell>
                <TableCell className="max-w-64 truncate px-4 py-3 text-sm">
                  {leave.reason}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <LeaveStatusBadge status={leave.status} />
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  {canDecide ? (
                    <DecideLeaveActions leaveId={leave.id} />
                  ) : canWithdraw ? (
                    <WithdrawLeaveDialog leaveId={leave.id} />
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} request{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={leaveHref(query, Math.max(1, page - 1))}
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
                    href={leaveHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={leaveHref(query, Math.min(totalPages, page + 1))}
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
