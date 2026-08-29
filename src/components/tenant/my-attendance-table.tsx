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
import { AttendanceStatusBadge } from "@/components/tenant/attendance-status-badge";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate, formatTime, formatWorkedHours } from "@/lib/format";
import type { AttendanceListQuery } from "@/lib/validation/attendance";
import { getMyAttendance } from "@/server/attendance/service";
import { MapPinOffIcon } from "lucide-react";

export async function MyAttendanceTable({
  shopId,
  userId,
  query,
}: {
  shopId: string;
  userId: string;
  query: AttendanceListQuery;
}) {
  const { items, total, page, totalPages } = await getMyAttendance(
    shopId,
    userId,
    query,
  );

  if (items.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinOffIcon />
          </EmptyMedia>
          <EmptyTitle>No attendance yet</EmptyTitle>
          <EmptyDescription>
            Check in for the first time to start your record.
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="px-4 py-3 font-medium">
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
            </TableRow>
          ))}
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
                href={
                  page <= 1
                    ? "#"
                    : `${tenantPaths.attendance}?page=${page - 1}`
                }
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
                href={
                  page >= totalPages
                    ? "#"
                    : `${tenantPaths.attendance}?page=${page + 1}`
                }
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
