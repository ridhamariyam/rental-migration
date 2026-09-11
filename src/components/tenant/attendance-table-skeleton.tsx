import { Skeleton } from "@/components/ui/skeleton";
import { ListCardsSkeleton, TableOnly } from "@/components/tenant/list-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AttendanceTableSkeleton({
  showStaffColumn = true,
}: {
  showStaffColumn?: boolean;
}) {
  return (
    <>
      <ListCardsSkeleton at="lg" />

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
                Date
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Check in
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Check out
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={index}>
                {showStaffColumn ? (
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                ) : null}
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-16" />
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
      </TableOnly>
    </>
  );
}
