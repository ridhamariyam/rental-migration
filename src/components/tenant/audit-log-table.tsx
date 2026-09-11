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
import { AuditActionBadge } from "@/components/tenant/audit-action-badge";
import { AuditLogDetailDialog } from "@/components/tenant/audit-log-detail-dialog";
import {
  ListCardRow,
  ListCards,
  TableOnly,
} from "@/components/tenant/list-cards";
import { formatDateTime } from "@/lib/format";
import { tenantPaths } from "@/lib/tenant-paths";
import type { AuditLogListQuery } from "@/lib/validation/audit";
import type { TenantSessionUser } from "@/server/auth/guard";
import { listAuditLogs } from "@/server/audit/service";
import { HistoryIcon } from "lucide-react";

export async function AuditLogTable({
  actor,
  query,
}: {
  actor: TenantSessionUser;
  query: AuditLogListQuery;
}) {
  const { items, total, page, totalPages } = await listAuditLogs(actor, query);

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>No activity recorded yet</EmptyTitle>
          <EmptyDescription>
            {query.action || query.entityType || query.fromDate || query.toDate
              ? "No activity matches these filters."
              : "Sensitive actions — role changes, payouts, cancellations, and more — will show up here as they happen."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  function href(nextPage: number): string {
    const params = new URLSearchParams();
    if (query.action) params.set("action", query.action);
    if (query.entityType) params.set("entityType", query.entityType);
    if (query.fromDate) params.set("fromDate", query.fromDate);
    if (query.toDate) params.set("toDate", query.toDate);
    if (nextPage > 1) params.set("page", String(nextPage));
    const search = params.toString();
    return `${tenantPaths.auditLog}${search ? `?${search}` : ""}`;
  }

  return (
    <>
      {/* The row's own detail dialog stands in for a View button — an audit
          event has no page of its own, the dialog is where the before/after
          states live. */}
      <ListCards at="lg">
        {items.map((log) => (
          <ListCardRow
            key={log.id}
            title={log.summary || "—"}
            badge={<AuditActionBadge action={log.action} />}
            meta={
              <>
                {formatDateTime(log.createdAt)} ·{" "}
                {log.userFirstName
                  ? `${log.userFirstName} ${log.userLastName}`
                  : "Platform admin"}
              </>
            }
            action={
              <AuditLogDetailDialog
                action={log.action}
                entityType={log.entityType}
                summary={log.summary}
                userName={
                  log.userFirstName
                    ? `${log.userFirstName} ${log.userLastName}`
                    : null
                }
                createdAt={log.createdAt}
                before={log.beforeState}
                after={log.afterState}
              />
            }
          />
        ))}
      </ListCards>

      <TableOnly at="lg">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                When
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Action
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Summary
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                By
              </TableHead>
              <TableHead className="w-12 px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm whitespace-nowrap">
                  {formatDateTime(log.createdAt)}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <AuditActionBadge action={log.action} />
                </TableCell>
                <TableCell className="max-w-sm truncate px-4 py-3 text-sm">
                  {log.summary || "—"}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm">
                  {log.userFirstName
                    ? `${log.userFirstName} ${log.userLastName}`
                    : "Platform admin"}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <AuditLogDetailDialog
                    action={log.action}
                    entityType={log.entityType}
                    summary={log.summary}
                    userName={
                      log.userFirstName
                        ? `${log.userFirstName} ${log.userLastName}`
                        : null
                    }
                    createdAt={log.createdAt}
                    before={log.beforeState}
                    after={log.afterState}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableOnly>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} event{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={href(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                className={
                  page <= 1 ? "pointer-events-none opacity-50" : undefined
                }
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                {page}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href={href(Math.min(totalPages, page + 1))}
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
