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
import { Badge } from "@/components/ui/badge";
import type { TenantSessionUser } from "@/server/auth/guard";
import { getNotRentedProducts } from "@/server/reports/service";
import { PackageXIcon, SparklesIcon } from "lucide-react";

/** The inverse of `MostRentedReport` — active products with zero bookings
 * in the window, the shop's idle/dead stock worth discounting, promoting,
 * or no longer restocking. */
export async function NotRentedReport({
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
  const rows = await getNotRentedProducts(actor, {
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
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>Every product has been rented</EmptyTitle>
          <EmptyDescription>
            Nothing in the catalogue is sitting idle for the selected range.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Product
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Category
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-right text-xs font-medium tracking-wide uppercase">
            Variations
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.productId}>
            <TableCell className="px-4 py-3 text-sm font-medium">
              {row.productName}
            </TableCell>
            <TableCell className="px-4 py-3 text-sm text-muted-foreground">
              {row.categoryName ?? "—"}
            </TableCell>
            <TableCell className="px-4 py-3 text-right text-sm">
              <Badge variant="outline" className="gap-1 font-normal">
                <PackageXIcon className="size-3" />
                {row.variationCount}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
