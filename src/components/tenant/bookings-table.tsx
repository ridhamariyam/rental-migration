import Link from "next/link";
import { CalendarClockIcon, EyeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  ListCardRow,
  ListCards,
  TableOnly,
} from "@/components/tenant/list-cards";
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
  viewer: Pick<TenantSessionUser, "id" | "role" | "outletId">;
}) {
  const { items, total, page, totalPages } = await listBookings(
    shopId,
    query,
    viewer,
  );
  const hasFilters = Boolean(query.q) || query.status !== "all";

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
      <ListCards at="lg">
        {items.map((booking) => {
          const customerName =
            `${booking.customerFirstName} ${booking.customerLastName}`.trim();
          const groupItems = booking.groupItems ?? [];
          const refundPending =
            booking.status === "cancelled" &&
            booking.paymentStatus !== "refunded" &&
            booking.paymentStatus !== "unpaid";

          return (
            <ListCardRow
              key={booking.id}
              media={
                <Avatar className="size-10 shadow-xs">
                  {groupItems[0]?.productImage ? (
                    <AvatarImage
                      src={groupItems[0].productImage}
                      alt={groupItems[0].productName}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback
                    className="text-[10px] font-semibold text-white uppercase"
                    style={{
                      backgroundImage: productAvatarGradient(
                        groupItems[0]?.productName ?? "",
                      ),
                    }}
                  >
                    {(groupItems[0]?.productName ?? "").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              }
              title={customerName || booking.bookingNumber}
              badge={
                <>
                  <BookingStatusBadge status={booking.status} />
                  {refundPending ? (
                    <Badge
                      variant="outline"
                      className="text-destructive border-destructive/30 shrink-0"
                    >
                      Refund pending
                    </Badge>
                  ) : null}
                </>
              }
              meta={
                <>
                  {formatMoney(booking.totalAmount)} · {booking.bookingNumber}
                  {groupItems[0]
                    ? ` · ${formatDate(groupItems[0].fromDate)} – ${formatDate(groupItems[0].toDate)}`
                    : ""}
                </>
              }
              action={
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`${tenantPaths.bookings}/${booking.id}`} />
                  }
                >
                  <EyeIcon />
                  View
                </Button>
              }
            />
          );
        })}
      </ListCards>

      <TableOnly at="lg">
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
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Handled by
              </TableHead>
              <TableHead className="text-muted-foreground h-11 px-4 text-xs font-medium tracking-wide uppercase">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((booking) => {
              const customerName =
                `${booking.customerFirstName} ${booking.customerLastName}`.trim();
              const groupItems = booking.groupItems ?? [];

              return (
                <TableRow key={booking.id}>
                  <TableCell className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <Avatar className="size-8 shrink-0 shadow-xs">
                          {groupItems[0]?.productImage ? (
                            <AvatarImage
                              src={groupItems[0].productImage}
                              alt={groupItems[0].productName}
                              className="object-cover"
                            />
                          ) : null}
                          <AvatarFallback
                            className="text-[10px] font-semibold text-white uppercase"
                            style={{
                              backgroundImage: productAvatarGradient(
                                groupItems[0]?.productName ?? "",
                              ),
                            }}
                          >
                            {(groupItems[0]?.productName ?? "").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        {groupItems.length > 1 ? (
                          <div className="ring-background bg-muted text-muted-foreground absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full text-[9px] font-semibold ring-2">
                            +{groupItems.length - 1}
                          </div>
                        ) : null}
                      </div>

                      <Link
                        href={`${tenantPaths.bookings}/${booking.id}`}
                        className="text-foreground font-semibold hover:underline"
                      >
                        {booking.bookingNumber}
                      </Link>
                    </div>
                  </TableCell>

                  <TableCell className="px-4 py-3 text-sm font-medium">
                    {customerName}
                  </TableCell>

                  <TableCell className="text-muted-foreground px-4 py-3 text-sm">
                    {groupItems[0]?.productName ?? "—"}
                    {groupItems[0]?.variationColor ||
                    groupItems[0]?.variationSize
                      ? ` (${[groupItems[0]?.variationColor, groupItems[0]?.variationSize].filter(Boolean).join(", ")})`
                      : ""}
                    {groupItems[0] && groupItems[0].quantity > 1
                      ? ` × ${groupItems[0].quantity}`
                      : ""}
                    {groupItems.length > 1
                      ? ` (+${groupItems.length - 1} more)`
                      : ""}
                  </TableCell>

                  <TableCell className="text-muted-foreground px-4 py-3 text-sm whitespace-nowrap">
                    {groupItems[0]
                      ? `${formatDate(groupItems[0].fromDate)} – ${formatDate(groupItems[0].toDate)}`
                      : "—"}
                  </TableCell>

                  <TableCell className="px-4 py-3 text-sm font-medium">
                    {formatMoney(booking.totalAmount)}
                    {/* A cancelled order recomputes to ₹0.00, which used to
                     * be the only thing this column said about a booking
                     * the shop had already been paid for and then
                     * cancelled. The payment status now reads "Refunded"
                     * once the money is settled; flag the case where it is
                     * still outstanding so the list is not the last place
                     * to find out (RQ-08). */}
                    {booking.status === "cancelled" &&
                    booking.paymentStatus !== "refunded" &&
                    booking.paymentStatus !== "unpaid" ? (
                      <span className="text-destructive mt-0.5 block text-xs font-medium">
                        Refund pending
                      </span>
                    ) : null}
                  </TableCell>

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
                                className="text-[9px] font-semibold !text-white"
                                style={{
                                  backgroundImage:
                                    avatarGradient(handledByName),
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

                  <TableCell className="px-4 py-3">
                    <BookingStatusBadge status={booking.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableOnly>

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
