import type { TenantSessionUser } from "@/server/auth/guard";
import Link from "next/link";
import { EyeIcon, UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ListCardRow,
  ListCards,
  TableOnly,
} from "@/components/tenant/list-cards";
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
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import {
  avatarGradient,
  initialsFor,
  resolveAvatarSrc,
} from "@/lib/tenant-avatar";
import type { StaffListQuery } from "@/lib/validation/staff";
import { listStaff } from "@/server/staff/service";

function staffHref(query: StaffListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.role !== "all") params.set("role", query.role);
  if (query.status !== "all") params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.staff}${search ? `?${search}` : ""}`;
}

/**
 * Async Server Component: fetches straight from `listStaff`, scoped to the
 * signed-in tenant. Same pattern as `OutletsTable`/`TenantsTable`.
 */
export async function StaffTable({
  actor,
  query,
}: {
  actor: TenantSessionUser;
  query: StaffListQuery;
}) {
  const { items, total, page, totalPages } = await listStaff(actor, query);
  const hasFilters =
    Boolean(query.q) || query.role !== "all" || query.status !== "all";

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No staff match your filters" : "No staff yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term or clear the role/status filters."
              : "Add a manager or staff account to start assigning them to an outlet."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <ListCards at="md">
        {items.map((member) => {
          const name = `${member.firstName} ${member.lastName}`;
          return (
            <ListCardRow
              key={member.id}
              media={
                <Avatar className="size-10">
                  <AvatarImage
                    src={resolveAvatarSrc(member.avatarUrl, name)}
                    alt={name}
                  />
                  <AvatarFallback
                    className="text-xs font-semibold text-white"
                    style={{ backgroundImage: avatarGradient(name) }}
                  >
                    {initialsFor(name)}
                  </AvatarFallback>
                </Avatar>
              }
              title={name}
              badge={
                <>
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {member.role}
                  </Badge>
                  {member.isActive ? null : (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground shrink-0"
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      Inactive
                    </Badge>
                  )}
                </>
              }
              meta={
                <>
                  {member.outletName ?? "Unassigned"} · {member.email}
                </>
              }
              action={
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`${tenantPaths.staff}/${member.id}`} />}
                >
                  <EyeIcon />
                  View
                </Button>
              }
            />
          );
        })}
      </ListCards>

      <TableOnly at="md">
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
            {items.map((member) => {
              const name = `${member.firstName} ${member.lastName}`;
              return (
                <TableRow key={member.id}>
                  <TableCell className="px-4 py-3 font-medium">
                    <Link
                      href={`${tenantPaths.staff}/${member.id}`}
                      className="group flex items-center gap-3"
                    >
                      <Avatar>
                        <AvatarImage
                          src={resolveAvatarSrc(member.avatarUrl, name)}
                          alt={name}
                        />
                        <AvatarFallback
                          className="text-xs font-semibold text-white"
                          style={{ backgroundImage: avatarGradient(name) }}
                        >
                          {initialsFor(name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="group-hover:underline">{name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                    <div className="flex flex-col">
                      <span>{member.email}</span>
                      <span>{member.phone ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                    {member.outletName ?? "Unassigned"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {member.isActive ? (
                      <Badge
                        variant="secondary"
                        className="bg-primary/10 text-primary"
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableOnly>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} member{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={staffHref(query, Math.max(1, page - 1))}
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
                    href={staffHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={staffHref(query, Math.min(totalPages, page + 1))}
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
