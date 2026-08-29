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
import { formatMoney } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getMostRentedProducts } from "@/server/reports/service";
import { ShirtIcon } from "lucide-react";

/** Doc §21's "Most rented products" — top products by booking count in
 * the window, capped to `limit` (default 10). */
export async function MostRentedReport({
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
  const rows = await getMostRentedProducts(actor, {
    fromDate,
    toDate,
    outletId,
    limit: 10,
  });

  if (rows.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShirtIcon />
          </EmptyMedia>
          <EmptyTitle>No bookings in this window</EmptyTitle>
          <EmptyDescription>
            The most-booked products for the selected range will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="border-b p-4">
        <ReportBarChart
          layout="horizontal"
          height={Math.max(160, rows.length * 40)}
          data={rows.map((row) => ({ label: row.productName, value: Number(row.revenue) }))}
        />
      </div>
      <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Product
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
          <TableRow key={row.productId}>
            <TableCell className="px-4 py-3 text-sm font-medium">
              {row.productName}
            </TableCell>
            <TableCell className="px-4 py-3 text-right text-sm">
              {row.rentalCount}
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
