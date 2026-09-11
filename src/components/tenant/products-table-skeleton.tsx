import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ProductsTableSkeleton() {
  return (
    <>
      {/* Mirrors `ProductsTable`'s responsive split — stacked rows on a
          phone, the table from `sm` up — so the loading state never flashes
          a layout the loaded list doesn't use. */}
      <ul className="divide-border/40 divide-y sm:hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 p-4">
            <Skeleton className="size-11 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-7 w-16 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Product
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Category
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Items
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
              <TableHead className="h-11 px-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 shrink-0 rounded-lg" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-8" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="ml-auto h-7 w-16 rounded-lg" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
