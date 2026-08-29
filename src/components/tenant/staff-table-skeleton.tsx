import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function StaffTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Name
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Contact
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Role
          </TableHead>
          <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
            Outlet
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
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-4 w-40" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="px-4 py-3">
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
