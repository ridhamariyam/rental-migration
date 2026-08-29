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
import { CategoryDonutChart } from "@/components/tenant/category-donut-chart";
import { formatMoney } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getRevenueByOutlet } from "@/server/reports/service";
import { Building2Icon } from "lucide-react";

/** Doc §21's "Revenue by outlet" — every active outlet appears, even with
 * zero bookings in the window. */
export async function RevenueByOutletReport({
  actor,
  fromDate,
  toDate,
}: {
  actor: TenantSessionUser;
  fromDate?: string;
  toDate?: string;
}) {
  const rows = await getRevenueByOutlet(actor, { fromDate, toDate });

  if (rows.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>No outlets yet</EmptyTitle>
          <EmptyDescription>
            Add an outlet to start tracking revenue by branch.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="border-b p-4">
        <CategoryDonutChart
          data={rows.map((row) => ({
            name: row.outletName,
            value: row.bookingCount,
            revenue: row.revenue,
          }))}
        />
      </div>
      <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Outlet
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-right text-xs font-medium tracking-wide uppercase">
            Bookings
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-right text-xs font-medium tracking-wide uppercase">
            Revenue
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.outletId}>
            <TableCell className="px-4 py-3 text-sm font-medium">
              {row.outletName}
            </TableCell>
            <TableCell className="px-4 py-3 text-right text-sm">
              {row.bookingCount}
            </TableCell>
            <TableCell className="px-4 py-3 text-right text-sm">
              {formatMoney(row.revenue)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </>
  );
}
