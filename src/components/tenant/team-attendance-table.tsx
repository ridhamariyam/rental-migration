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
import { AttendanceStatusBadge } from "@/components/tenant/attendance-status-badge";
import { CorrectAttendanceDialog } from "@/components/tenant/correct-attendance-dialog";
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import { formatDate, formatTime, formatWorkedHours } from "@/lib/format";
import {
  avatarGradient,
  initialsFor,
  staffAvatarSrc,
} from "@/lib/tenant-avatar";
import type { AttendanceListQuery } from "@/lib/validation/attendance";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listAttendance } from "@/server/attendance/service";
import { MapPinOffIcon } from "lucide-react";

function teamHref(query: AttendanceListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.status !== "all") params.set("status", query.status);
  if (query.staffId) params.set("staffId", query.staffId);
  if (query.outletId) params.set("outletId", query.outletId);
  if (query.fromDate) params.set("fromDate", query.fromDate);
  if (query.toDate) params.set("toDate", query.toDate);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.attendance}/team${search ? `?${search}` : ""}`;
}

export async function TeamAttendanceTable({
  actor,
  query,
  canCorrect,
}: {
  actor: TenantSessionUser;
  query: AttendanceListQuery;
  canCorrect: boolean;
}) {
  const { items, total, page, totalPages } = await listAttendance(actor, query);
  const hasFilters =
    query.status !== "all" ||
    Boolean(query.staffId) ||
    Boolean(query.outletId) ||
    Boolean(query.fromDate) ||
    Boolean(query.toDate);

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinOffIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No records match your filters" : "No attendance yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different date range or clear a filter."
              : "Records appear here once staff start checking in."}
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
              Staff
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Outlet
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Date
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Check in
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Check out
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Hours
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Status
            </TableHead>
            {canCorrect ? (
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((record) => {
            const name = `${record.staffFirstName} ${record.staffLastName}`.trim();
            return (
              <TableRow key={record.id}>
                <TableCell className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarImage src={staffAvatarSrc(name)} alt={name} />
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
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {record.outletName ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm">
                {formatDate(record.date)}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {formatTime(record.checkInTime)}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {record.checkOutTime ? formatTime(record.checkOutTime) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {formatWorkedHours(record.checkInTime, record.checkOutTime) ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3">
                <AttendanceStatusBadge status={record.status} />
              </TableCell>
              {canCorrect ? (
                <TableCell className="px-4 py-3 text-right">
                  <CorrectAttendanceDialog attendance={record} />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} record{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={teamHref(query, Math.max(1, page - 1))}
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
                    href={teamHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={teamHref(query, Math.min(totalPages, page + 1))}
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
