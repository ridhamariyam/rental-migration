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

export function SettlementsTableSkeleton({
  canManage,
}: {
  canManage: boolean;
}) {
  return (
    <>
      <ListCardsSkeleton at="lg" />

      <TableOnly at="lg">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Item
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Owner
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Gross / share
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Owner amount
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
              {canManage ? (
                <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                  Actions
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-40" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Skeleton className="h-5 w-20 rounded-full" />
                </TableCell>
                {canManage ? (
                  <TableCell className="px-4 py-3">
                    <Skeleton className="h-8 w-24" />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableOnly>
    </>
  );
}
