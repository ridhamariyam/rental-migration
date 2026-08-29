import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

/** One reusable skeleton for every report table's `Suspense` fallback —
 * these tables vary in column count/labels, but the loading shimmer looks
 * the same either way, so one configurable component covers all of them
 * instead of a bespoke skeleton per report. */
export function ReportTableSkeleton({
  columns = 3,
  rows = 6,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <Table>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex} className="px-4 py-3">
                <Skeleton className="h-4 w-full max-w-32" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
