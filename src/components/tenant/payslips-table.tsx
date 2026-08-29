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
import { formatMinutes, formatMoney } from "@/lib/format";
import type { PayslipListQuery } from "@/lib/validation/salary";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listPayslips } from "@/server/salary/service";
import { ReceiptTextIcon } from "lucide-react";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export async function PayslipsTable({
  actor,
  query,
  showStaffColumn,
  basePath,
}: {
  actor: TenantSessionUser;
  query: PayslipListQuery;
  showStaffColumn: boolean;
  basePath: string;
}) {
  const { items, total, page, totalPages } = await listPayslips(actor, query);

  if (items.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptTextIcon />
          </EmptyMedia>
          <EmptyTitle>No payslips yet</EmptyTitle>
          <EmptyDescription>
            Generated payslips appear here once created.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function href(nextPage: number): string {
    const params = new URLSearchParams();
    if (query.staffId) params.set("staffId", query.staffId);
    if (nextPage > 1) params.set("page", String(nextPage));
    const search = params.toString();
    return `${basePath}${search ? `?${search}` : ""}`;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {showStaffColumn ? (
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Staff
              </TableHead>
            ) : null}
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Period
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Present / Working
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Total hours
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Avg / day
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Net amount
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((payslip) => (
            <TableRow key={payslip.id}>
              {showStaffColumn ? (
                <TableCell className="px-4 py-3 font-medium">
                  {payslip.staffFirstName} {payslip.staffLastName}
                </TableCell>
              ) : null}
              <TableCell className="px-4 py-3 text-sm">
                {MONTH_LABELS[payslip.periodMonth - 1]} {payslip.periodYear}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {payslip.presentDays + payslip.approvedLeaveDays} /{" "}
                {payslip.workingDays}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {formatMinutes(payslip.totalWorkedMinutes)}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {payslip.presentDays > 0
                  ? formatMinutes(payslip.averageMinutesPerDay)
                  : "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm font-medium">
                {formatMoney(payslip.netAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} payslip{total === 1 ? "" : "s"} · page {page} of {totalPages}
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
