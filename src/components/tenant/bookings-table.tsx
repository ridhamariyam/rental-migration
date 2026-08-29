import Link from "next/link";
import { CalendarClockIcon } from "lucide-react";
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
import { BookingStatusBadge } from "@/components/tenant/booking-status-badge";
import { tenantPaths } from "@/lib/tenant-paths";
import { paginationRange } from "@/lib/pagination-range";
import { formatDate, formatMoney } from "@/lib/format";
import {
  avatarGradient,
  initialsFor,
  productAvatarGradient,
  staffAvatarSrc,
} from "@/lib/tenant-avatar";
import type { BookingListQuery } from "@/lib/validation/bookings";
import { listBookings } from "@/server/bookings/service";
import type { TenantSessionUser } from "@/server/auth/guard";

function bookingsHref(query: BookingListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "all") params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `${tenantPaths.bookings}${search ? `?${search}` : ""}`;
}

export async function BookingsTable({
  shopId,
  query,
  viewer,
}: {
  shopId: string;
  query: BookingListQuery;
  viewer: Pick<TenantSessionUser, "id" | "role">;
}) {
  const { items, total, page, totalPages } = await listBookings(
    shopId,
    query,
    viewer,
  );
  const hasFilters = Boolean(query.q) || query.status !== "all";
  // Only a non-staff viewer (admin/manager/super_admin) sees who handled
  // each booking — a plain staff account already only ever sees their own
  // bookings (`listBookings`' own scoping), so the column would be a
  // no-op repeat of their own name on every row.
  const showHandledBy = viewer.role !== "staff";

  if (items.length === 0) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarClockIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No bookings match your filters" : "No bookings yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try a different search term or clear the status filter."
              : "Create your first booking to start renting out your catalogue."}
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
            {showHandledBy ? (
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Handled by
              </TableHead>
            ) : null}
            <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((booking) => {
            const customerName = `${booking.customerFirstName} ${booking.customerLastName}`.trim();
            const groupItems = booking.groupItems ?? [];

            return (
              <TableRow key={booking.id}>
                <TableCell className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-3">
                    {groupItems.length > 1 ? (
                      <div className="flex items-center -space-x-2.5 shrink-0 overflow-hidden">
                        {groupItems.slice(0, 3).map((item, index) => {
                          const zClass =
                            index === 0 ? "z-30" : index === 1 ? "z-20" : "z-10";
                          return (
                            <Avatar
                              key={index}
                              className={`size-8 shrink-0 ring-2 ring-background ${zClass} shadow-xs`}
                            >
                              {item.productImage ? (
                                <AvatarImage
                                  src={item.productImage}
                                  alt={item.productName}
                                  className="object-cover"
                                />
                              ) : null}
                              <AvatarFallback
                                className="text-white text-[10px] font-semibold uppercase"
                                style={{
                                  backgroundImage: productAvatarGradient(
                                    item.productName,
                                  ),
                                }}
                              >
                                {item.productName.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                          );
                        })}
                        {groupItems.length > 3 ? (
                          <div className="size-8 shrink-0 ring-2 ring-background z-0 flex items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shadow-xs">
                            +{groupItems.length - 3}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Avatar className="size-8 shrink-0 shadow-xs">
                        {booking.productImage ? (
                          <AvatarImage
                            src={booking.productImage}
                            alt={booking.productName}
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback
                          className="text-white text-[10px] font-semibold uppercase"
                          style={{
                            backgroundImage: productAvatarGradient(
                              booking.productName,
                            ),
                          }}
                        >
                          {booking.productName.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <Link
                      href={`${tenantPaths.bookings}/${booking.id}`}
                      className="hover:underline font-semibold text-foreground"
                    >
                      {booking.bookingNumber}
                    </Link>
                  </div>
                </TableCell>

                <TableCell className="px-4 py-3 text-sm font-medium">
                  {customerName}
                </TableCell>

                <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                  {booking.productName}
                  {booking.variationColor || booking.variationSize
                    ? ` (${[booking.variationColor, booking.variationSize].filter(Boolean).join(", ")})`
                    : ""}
                  {groupItems.length > 1
                    ? ` (+${groupItems.length - 1} more)`
                    : ""}
                </TableCell>

                <TableCell className="text-muted-foreground px-4 py-3 text-sm whitespace-nowrap">
                  {formatDate(booking.fromDate)} – {formatDate(booking.toDate)}
                </TableCell>

                <TableCell className="px-4 py-3 text-sm font-medium">
                  {formatMoney(booking.totalAmount)}
                </TableCell>

                {showHandledBy ? (
                  <TableCell className="px-4 py-3 text-sm">
                    {booking.handledByFirstName ? (
                      (() => {
                        const handledByName =
                          `${booking.handledByFirstName} ${booking.handledByLastName ?? ""}`.trim();
                        return (
                          <div className="flex items-center gap-2">
                            <Avatar className="size-6 shrink-0">
                              <AvatarImage
                                src={staffAvatarSrc(handledByName)}
                                alt={handledByName}
                              />
                              <AvatarFallback
                                className="!text-white text-[9px] font-semibold"
                                style={{
                                  backgroundImage: avatarGradient(handledByName),
                                }}
                              >
                                {initialsFor(handledByName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-foreground font-medium">
                              {handledByName}
                            </span>
                          </div>
                        );
                      })()
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}

                <TableCell className="px-4 py-3">
                  <BookingStatusBadge status={booking.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <p className="text-muted-foreground text-sm">
          {total} booking{total === 1 ? "" : "s"} · page {page} of {totalPages}
        </p>

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={bookingsHref(query, Math.max(1, page - 1))}
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
                    href={bookingsHref(query, item)}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={bookingsHref(query, Math.min(totalPages, page + 1))}
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
