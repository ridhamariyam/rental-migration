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
import { StaffPerformanceChart } from "@/components/tenant/staff-performance-chart";
import { formatMoney } from "@/lib/format";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getStaffPerformance } from "@/server/reports/service";
import { UsersIcon } from "lucide-react";

/** Doc §21's "Staff performance" — attributed by `handledById`, frozen at
 * booking creation, so reassigning a customer's staff later never
 * rewrites past attribution. */
export async function StaffPerformanceReport({
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
  const rows = await getStaffPerformance(actor, { fromDate, toDate, outletId });

  if (rows.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No bookings handled in this window</EmptyTitle>
          <EmptyDescription>
            Each staff member&rsquo;s booking count and revenue will appear
            here once they handle a booking.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="border-b p-4">
        <StaffPerformanceChart
          data={rows.map((row) => ({
            staffName: row.staffName,
            revenue: row.revenue,
            bookingCount: row.bookingCount,
          }))}
        />
      </div>
      <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Staff
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
          <TableRow key={row.staffId}>
            <TableCell className="px-4 py-3 text-sm font-medium">
              {row.staffName}
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
