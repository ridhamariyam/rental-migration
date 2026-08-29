import Link from "next/link";
import { WrenchIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaintenanceTaskStatusBadge } from "@/components/tenant/maintenance-task-status-badge";
import { MaintenanceTaskTypeBadge } from "@/components/tenant/maintenance-task-type-badge";
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import { formatDate } from "@/lib/format";
import type { MaintenanceListQuery } from "@/lib/validation/maintenance";
import { listMaintenanceTasks } from "@/server/maintenance/service";

function maintenanceHref(query: MaintenanceListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (query.taskType !== "all") params.set("taskType", query.taskType);
  if (query.outletId) params.set("outletId", query.outletId);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.maintenance}${search ? `?${search}` : ""}`;
}

export async function MaintenanceTasksTable({
  shopId,
  query,
}: {
  shopId: string;
  query: MaintenanceListQuery;
}) {
  const { items, total, page, totalPages } = await listMaintenanceTasks(
    shopId,
    query,
  );
  const hasFilters =
    Boolean(query.q) ||
    query.status !== "all" ||
    query.taskType !== "all" ||
    Boolean(query.outletId);

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WrenchIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No tasks match your filters" : "Nothing to clean or repair"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term or clear a filter."
              : "Tasks appear here automatically when an item is returned needing cleaning or repair."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Item
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Type
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Outlet
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Assigned to
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Opened
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((task) => (
            <TableRow key={task.id}>
              <TableCell className="px-4 py-3 font-medium">
                <Link
                  href={`${tenantPaths.maintenance}/${task.id}`}
                  className="hover:underline"
                >
                  {task.productName}
                </Link>
                <p className="text-muted-foreground text-xs font-normal">
                  SKU {task.sku}
                </p>
              </TableCell>
              <TableCell className="px-4 py-3">
                <MaintenanceTaskTypeBadge taskType={task.taskType} />
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {task.outletName ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                {task.assignedToName ?? "Unassigned"}
              </TableCell>
              <TableCell className="text-muted-foreground px-4 py-3 text-sm whitespace-nowrap">
                {formatDate(task.createdAt)}
              </TableCell>
              <TableCell className="px-4 py-3">
                <MaintenanceTaskStatusBadge status={task.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} task{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={maintenanceHref(query, Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                className={
                  page <= 1 ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
            {paginationRange(page, totalPages).map((item, index) =>
              item === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href={maintenanceHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={maintenanceHref(query, Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
                className={
                  page >= totalPages
                    ? "pointer-events-none opacity-50"
                    : undefined
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  );
}
