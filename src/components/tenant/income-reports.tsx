import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReportBarChart } from "@/components/tenant/report-bar-chart";
import { RevenueTrendChart } from "@/components/tenant/revenue-trend-chart";
import { formatDate, formatMoney } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getDailyIncome, getMonthlyIncome } from "@/server/reports/service";
import { LineChartIcon } from "lucide-react";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function IncomeEmpty() {
  return (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LineChartIcon />
        </EmptyMedia>
        <EmptyTitle>No income recorded yet</EmptyTitle>
        <EmptyDescription>
          Payments collected in this window will show up here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Doc §21's "Daily income" — every payment counted as revenue (advance,
 * balance, damage recovery), summed per calendar day. */
export async function DailyIncomeReport({
  actor,
  fromDate,
  toDate,
  outletId,
}: {
  actor: TenantSessionUser;
  fromDate?: string;
  toDate?: string;
  outletId?: string;
}) {
  const { total, rows } = await getDailyIncome(actor, { fromDate, toDate, outletId });

  if (rows.length === 0) {
    return <IncomeEmpty />;
  }

  return (
    <>
      <div className="border-b p-4">
        <RevenueTrendChart
          fromDate={fromDate}
          toDate={toDate}
          data={rows.map((row) => ({
            date: row.date,
            amount: row.amount,
            bookings: row.bookings,
          }))}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Date
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-right text-xs font-medium tracking-wide uppercase">
              Income
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.date}>
              <TableCell className="px-4 py-3 text-sm">
                {formatDate(row.date)}
              </TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-medium">
                {formatMoney(row.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t p-4 text-sm">
        <span className="text-muted-foreground">Total for this window</span>
        <span className="font-semibold">{formatMoney(total)}</span>
      </div>
    </>
  );
}

/** Doc §21's "Monthly income" — same idea, bucketed by calendar month for
 * one year. */
export async function MonthlyIncomeReport({
  actor,
  year,
  outletId,
}: {
  actor: TenantSessionUser;
  year: number;
  outletId?: string;
}) {
  const { total, rows } = await getMonthlyIncome(actor, { year, outletId });

  if (rows.length === 0) {
    return <IncomeEmpty />;
  }

  return (
    <>
      <div className="border-b p-4">
        <ReportBarChart
          data={rows.map((row) => ({
            label: `${MONTH_LABELS[Number(row.month.slice(5, 7)) - 1].slice(0, 3)} ${row.month.slice(2, 4)}`,
            value: Number(row.amount),
          }))}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Month
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-right text-xs font-medium tracking-wide uppercase">
              Income
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const monthIndex = Number(row.month.slice(5, 7)) - 1;
            return (
              <TableRow key={row.month}>
                <TableCell className="px-4 py-3 text-sm">
                  {MONTH_LABELS[monthIndex]} {row.month.slice(0, 4)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right text-sm font-medium">
                  {formatMoney(row.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t p-4 text-sm">
        <span className="text-muted-foreground">Total for {year}</span>
        <span className="font-semibold">{formatMoney(total)}</span>
      </div>
    </>
  );
}
