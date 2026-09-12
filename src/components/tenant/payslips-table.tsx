import Link from "next/link";
import { FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  ListCardRow,
  ListCards,
  TableOnly,
} from "@/components/tenant/list-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMinutes, formatMoney, formatPayrollPeriod } from "@/lib/format";
import type { PayslipListQuery } from "@/lib/validation/salary";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listPayslips } from "@/server/salary/service";
import { ReceiptTextIcon } from "lucide-react";

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
      {/* A payslip row is all numbers — the card keeps the two that decide
          whether it needs a second look (net amount, days present) in front
          of the truncation point. */}
      <ListCards at="lg">
        {items.map((payslip) => (
          <ListCardRow
            key={payslip.id}
            title={
              showStaffColumn
                ? `${payslip.staffFirstName} ${payslip.staffLastName}`
                : formatPayrollPeriod(payslip)
            }
            action={
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={`${basePath}/payslips/${payslip.id}`} />}
              >
                <FileTextIcon />
                Open
              </Button>
            }
            meta={
              <>
                {formatMoney(payslip.netAmount)} ·{" "}
                {showStaffColumn ? `${formatPayrollPeriod(payslip)} · ` : ""}
                {formatMinutes(payslip.regularMinutes)} @{" "}
                {formatMoney(payslip.hourlyRate)}/hr
                {payslip.overtimeMinutes > 0
                  ? ` + ${formatMinutes(payslip.overtimeMinutes)} extra`
                  : ""}{" "}
                · {payslip.presentDays + payslip.approvedLeaveDays}/
                {payslip.workingDays} days
              </>
            }
          />
        ))}
      </ListCards>

      <TableOnly at="lg">
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
                Regular hours
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Extra hours
              </TableHead>
              <TableHead className="text-muted-foreground hidden h-11 px-4 text-xs font-medium tracking-wide uppercase xl:table-cell">
                Rates
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Base + extra pay
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Net amount
              </TableHead>
              <TableHead className="h-11 px-4">
                <span className="sr-only">Actions</span>
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
                  {formatPayrollPeriod(payslip)}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {payslip.presentDays + payslip.approvedLeaveDays} /{" "}
                  {payslip.workingDays}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {formatMinutes(payslip.regularMinutes)}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {payslip.overtimeMinutes > 0
                    ? formatMinutes(payslip.overtimeMinutes)
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden px-4 py-3 text-sm xl:table-cell">
                  {formatMoney(payslip.hourlyRate)}/hr
                  {payslip.overtimeRatePerHour
                    ? ` · ${formatMoney(payslip.overtimeRatePerHour)}/hr extra`
                    : ""}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {formatMoney(payslip.basePay)}
                  {payslip.overtimeMinutes > 0
                    ? ` + ${formatMoney(payslip.overtimePay)}`
                    : ""}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm font-medium">
                  {formatMoney(payslip.netAmount)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  {/* The payslip as a document — printable, and saved as a
                      PDF from the same dialog. */}
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link href={`${basePath}/payslips/${payslip.id}`} />
                    }
                  >
                    <FileTextIcon />
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableOnly>

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
