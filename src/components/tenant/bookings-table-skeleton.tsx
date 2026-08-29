import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function BookingsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Booking
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Customer
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Item
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Dates
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Amount
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Status
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }).map((_, index) => (
          <TableRow key={index}>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-4 w-28" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-4 w-36" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-5 w-20 rounded-full" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
