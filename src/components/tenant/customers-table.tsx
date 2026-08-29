import Link from "next/link";
import { ContactIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import {
  avatarGradient,
  customerGlassAvatarStyle,
  initialsFor,
  staffAvatarSrc,
} from "@/lib/tenant-avatar";
import type { CustomerListQuery } from "@/lib/validation/customers";
import { listCustomers } from "@/server/customers/service";

function customersHref(query: CustomerListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.customers}${search ? `?${search}` : ""}`;
}

export async function CustomersTable({
  shopId,
  query,
}: {
  shopId: string;
  query: CustomerListQuery;
}) {
  const { items, total, page, totalPages } = await listCustomers(shopId, query);
  const hasFilters = Boolean(query.q) || query.status !== "all";

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ContactIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters
              ? "No customers match your filters"
              : "No customers yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term or clear the status filter."
              : "Add your first customer to start recording bookings for them."}
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
              Customer
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Phone
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Assigned staff
            </TableHead>
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((customer) => {
            const name = `${customer.firstName} ${customer.lastName}`;
            return (
              <TableRow key={customer.id}>
                <TableCell className="px-4 py-3 font-medium">
                  <Link
                    href={`${tenantPaths.customers}/${customer.id}`}
                    className="group flex items-center gap-3"
                  >
                    <Avatar className="size-9 shrink-0 shadow-xs">
                      <AvatarFallback
                        className="text-xs font-semibold"
                        style={customerGlassAvatarStyle(name)}
                      >
                        {initialsFor(name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="group-hover:underline">{name}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {customer.phone}
                </TableCell>
                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {customer.primaryStaffName ? (
                    <span className="flex items-center gap-2">
                      <Avatar className="size-5 shrink-0">
                        <AvatarImage
                          src={staffAvatarSrc(customer.primaryStaffName)}
                          alt={customer.primaryStaffName}
                        />
                        <AvatarFallback
                          className="!text-white text-[10px] font-semibold"
                          style={{
                            backgroundImage: avatarGradient(customer.primaryStaffName),
                          }}
                        >
                          {initialsFor(customer.primaryStaffName)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{customer.primaryStaffName}</span>
                    </span>
                  ) : (
                    "Unassigned"
                  )}
                </TableCell>
                <TableCell className="px-4 py-3">
                  {customer.isActive ? (
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-current" />
                      Archived
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} customer{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={customersHref(query, Math.max(1, page - 1))}
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
                    href={customersHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={customersHref(query, Math.min(totalPages, page + 1))}
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
