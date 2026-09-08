import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ContactIcon,
  FileTextIcon,
  PencilIcon,
  ReceiptTextIcon,
  ShirtIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddBookingItemButton } from "@/components/tenant/add-booking-item-dialog";
import { BookingStatusBadge } from "@/components/tenant/booking-status-badge";
import { BookingCancelAction } from "@/components/tenant/booking-cancel-action";
import { BookingPaymentsCard } from "@/components/tenant/booking-payments-card";
import { BookingPickupDialog } from "@/components/tenant/booking-pickup-dialog";
import { BookingPickupAllDialog } from "@/components/tenant/booking-pickup-all-dialog";
import { BookingReturnDialog } from "@/components/tenant/booking-return-dialog";
import { PaymentStatusBadge } from "@/components/tenant/payment-status-badge";
import { ReturnConditionBadge } from "@/components/tenant/return-condition-badge";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate, formatMoney } from "@/lib/format";
import { canTransition, isEditable, isTerminal } from "@/lib/booking-state";
import {
  getBookingById,
  getBookingItems,
  type BookingItemDetail,
} from "@/server/bookings/service";
import { listPaymentsForBooking, type PaymentSummary } from "@/server/payments/service";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const booking = user?.shopId ? await getBookingById(user.shopId, id, user) : null;

  return {
    title: booking
      ? `${booking.bookingNumber} — Rentique`
      : "Booking not found — Rentique",
  };
}

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.BOOKING_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const canManage = hasPermission(user.role, Permission.BOOKING_MANAGE);
  const canCancel = hasPermission(user.role, Permission.BOOKING_CANCEL);
  const canPickup = hasPermission(user.role, Permission.BOOKING_PICKUP);
  const canReturn = hasPermission(user.role, Permission.BOOKING_RETURN);
  const canViewPayments = hasPermission(user.role, Permission.PAYMENT_VIEW);
  const canRecordPayment = hasPermission(user.role, Permission.PAYMENT_RECORD);
  const canRefund = hasPermission(user.role, Permission.PAYMENT_REFUND);
  const { id } = await params;
  const { created, count } = await searchParams;
  const booking = await getBookingById(user.shopId, id, user);

  if (!booking) {
    notFound();
  }

  const items = await getBookingItems(user.shopId, booking.id, user);
  const hasMultipleItems = items.length > 1;

  const { payments, summary } = canViewPayments
    ? await listPaymentsForBooking(user.shopId, booking.id)
    : { payments: [], summary: null };

  const canEditOrder = canManage && isEditable(booking.status);
  const canCancelOrder = canCancel && !isTerminal(booking.status);
  // Adding another item just needs the order itself to still be open —
  // there's no "anchor item" concept anymore now that the order is its
  // own row.
  const canAddItem = canManage && booking.status !== "cancelled";

  // Bulk pickup only makes sense once there are at least two items still
  // waiting for the counter — a single eligible item already has its own
  // "Confirm pickup" button on that item's own row.
  const pickupEligibleItems = canPickup
    ? items
        .filter(
          (item) =>
            item.status !== "rented" && canTransition(item.status, "rented"),
        )
        .map((item) => ({
          itemId: item.id,
          barcode: item.variationBarcode,
          label: [
            item.productName,
            [item.variationColor, item.variationSize].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" — "),
        }))
    : [];

  return (
    <main className="flex flex-1 flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <Link
          href={tenantPaths.bookings}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Bookings
        </Link>

        {created === "1" ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">
              {Number(count) > 1
                ? `Order created with ${count} items.`
                : "Booking created successfully."}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <span className="bg-primary/10 text-primary flex size-16 shrink-0 items-center justify-center rounded-2xl shadow-md">
              <CalendarClockIcon className="size-6" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {booking.bookingNumber}
                </h1>
                <BookingStatusBadge status={booking.status} />
                {canViewPayments && summary ? (
                  <PaymentStatusBadge status={summary.status} />
                ) : null}
                {hasMultipleItems ? (
                  <Badge variant="outline" className="font-normal">
                    {items.length} items
                  </Badge>
                ) : null}
              </div>
              <span className="text-muted-foreground text-xs">
                Created {formatDate(booking.createdAt, "long")}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canViewPayments ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link href={`${tenantPaths.bookings}/${booking.id}/receipt`} />
                }
              >
                <ReceiptTextIcon />
                Receipt
              </Button>
            ) : null}
            {canAddItem ? (
              <AddBookingItemButton
                bookingId={booking.id}
                bookingNumber={booking.bookingNumber}
              />
            ) : null}
            {pickupEligibleItems.length > 1 && summary ? (
              <BookingPickupAllDialog
                bookingId={booking.id}
                eligibleItems={pickupEligibleItems}
                summary={summary}
                canRecordPayment={canRecordPayment}
              />
            ) : null}
            {canEditOrder ? (
              <Button
                variant="accent"
                nativeButton={false}
                render={
                  <Link href={`${tenantPaths.bookings}/${booking.id}/edit`} />
                }
              >
                <PencilIcon />
                Edit
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {hasMultipleItems ? `Items in this order (${items.length})` : "Item"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {items.map((item, index) => (
                <BookingItemRow
                  key={item.id}
                  bookingId={booking.id}
                  item={item}
                  hasMultipleItems={hasMultipleItems}
                  index={index}
                  canManage={canManage}
                  canCancel={canCancel}
                  canPickup={canPickup}
                  canReturn={canReturn}
                  canViewPayments={canViewPayments}
                  canRecordPayment={canRecordPayment}
                  summary={summary}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ContactIcon className="size-4" aria-hidden="true" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href={`${tenantPaths.customers}/${booking.customerId}`}
                className="group flex items-center gap-3"
              >
                <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {booking.customerFirstName.charAt(0).toUpperCase()}
                  {booking.customerLastName.charAt(0).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="group-hover:text-primary truncate text-sm font-medium transition-colors">
                    {booking.customerFirstName} {booking.customerLastName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {booking.customerPhone}
                  </span>
                </span>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="font-medium">{items.length}</span>
              </div>
              {Number(booking.discountAmount) > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium">
                    -{formatMoney(booking.discountAmount)}
                  </span>
                </div>
              ) : null}
              {Number(booking.additionalCost) > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Additional cost
                    {booking.additionalCostReason ? (
                      <span className="text-muted-foreground/70">
                        {" "}
                        — {booking.additionalCostReason}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-medium">
                    {formatMoney(booking.additionalCost)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Security deposit</span>
                <span className="font-medium">
                  {formatMoney(booking.securityDeposit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total due at pickup</span>
                <span className="font-semibold">
                  {formatMoney(
                    summary?.totalReceivable ??
                      String(Number(booking.totalAmount) + Number(booking.securityDeposit)),
                  )}
                </span>
              </div>
              {booking.notes ? (
                <div className="border-border/60 mt-1 border-t pt-2.5">
                  <p className="text-muted-foreground text-xs">Notes</p>
                  <p className="text-sm">{booking.notes}</p>
                </div>
              ) : null}
              {booking.status === "cancelled" && booking.cancellationReason ? (
                <div className="border-border/60 mt-1 border-t pt-2.5">
                  <p className="text-muted-foreground text-xs">
                    Cancellation reason
                  </p>
                  <p className="text-sm font-medium">
                    {booking.cancellationReason}
                  </p>
                </div>
              ) : null}
              {canCancelOrder ? (
                <div className="border-border/60 mt-1 border-t pt-2.5">
                  <BookingCancelAction
                    bookingId={booking.id}
                    title="Cancel the whole order?"
                    description="Every item in this order is released back to the availability calendar. This cannot be undone."
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {booking.documents.length > 0 ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileTextIcon className="size-4" aria-hidden="true" />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {booking.documents.map((document, index) => (
                  <li
                    key={`${document.url}-${index}`}
                    className="border-border/60 bg-muted/30 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <FileTextIcon
                      className="text-muted-foreground size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <a
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {document.name}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {canViewPayments && summary ? (
          <BookingPaymentsCard
            bookingId={booking.id}
            bookingStatus={booking.status}
            payments={payments}
            summary={summary}
            canRecord={canRecordPayment}
            canRefund={canRefund}
          />
        ) : null}
      </div>
    </main>
  );
}

function BookingItemRow({
  bookingId,
  item,
  hasMultipleItems,
  index,
  canManage,
  canCancel,
  canPickup,
  canReturn,
  canViewPayments,
  canRecordPayment,
  summary,
}: {
  bookingId: string;
  item: BookingItemDetail;
  hasMultipleItems: boolean;
  index: number;
  canManage: boolean;
  canCancel: boolean;
  canPickup: boolean;
  canReturn: boolean;
  canViewPayments: boolean;
  canRecordPayment: boolean;
  summary: PaymentSummary | null;
}) {
  const itemLabel = [item.variationColor, item.variationSize]
    .filter(Boolean)
    .join(", ");

  const canEditItem = canManage && isEditable(item.status);
  // A picked-up item (rented/return_pending/overdue) can never legally
  // move straight to `cancelled` (see `canTransition`) — it has to come
  // back through Return instead, so the button shouldn't offer a cancel
  // that would just fail with a 409.
  const canCancelItem =
    canCancel &&
    item.status !== "cancelled" &&
    canTransition(item.status, "cancelled");
  const canConfirmPickup =
    canPickup && item.status !== "rented" && canTransition(item.status, "rented");
  const canReturnItem =
    canReturn &&
    item.status !== "returned" &&
    canTransition(item.status, "returned");

  const detailParts = [
    `${formatDate(item.fromDate, "long")} \u2192 ${formatDate(item.toDate, "long")} (${item.totalDays} day${item.totalDays === 1 ? "" : "s"})`,
  ];
  if (item.pickedUpAt) detailParts.push(`Picked up ${formatDate(item.pickedUpAt)}`);
  if (item.returnedAt) detailParts.push(`Returned ${formatDate(item.returnedAt)}`);

  // Charges are shown as a compact ledger of only the lines that actually
  // apply to this item — a flat "±" sentence reads fine for one item but
  // stops scaling once damage charges stack up alongside the base rent.
  const chargeLines: { label: string; value: string; sign?: "+" }[] = [
    {
      label:
        item.quantity > 1
          ? `Rent (${formatMoney(item.rentAmount)} × ${item.quantity})`
          : "Rent",
      value: formatMoney(item.grossRent),
    },
  ];
  if (Number(item.damageCharge) > 0) {
    chargeLines.push({
      label: "Damage charge",
      value: formatMoney(item.damageCharge),
      sign: "+",
    });
  }

  return (
    <div className="border-border/60 bg-card/40 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
              <ShirtIcon className="text-muted-foreground size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium">
              {hasMultipleItems ? `Item ${index + 1} · ` : ""}
              {item.productName}
              {itemLabel ? ` (${itemLabel})` : ""}
              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
            </span>
            <BookingStatusBadge status={item.status} />
            {item.returnCondition ? (
              <ReturnConditionBadge condition={item.returnCondition} />
            ) : null}
          </div>
          <p className="text-muted-foreground pl-11 text-xs">
            {item.variationSku} · {detailParts.join(" · ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canReturnItem && summary ? (
            <BookingReturnDialog
              bookingId={bookingId}
              itemId={item.id}
              expectedBarcode={item.variationBarcode}
              summary={summary}
            />
          ) : null}
          {canConfirmPickup && summary ? (
            <BookingPickupDialog
              bookingId={bookingId}
              itemId={item.id}
              expectedBarcode={item.variationBarcode}
              summary={summary}
              canRecordPayment={canRecordPayment}
            />
          ) : null}
          {canEditItem ? (
            <Button
              variant="accent"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  href={`${tenantPaths.bookings}/${bookingId}/items/${item.id}/edit`}
                />
              }
            >
              <PencilIcon />
              Edit
            </Button>
          ) : null}
          {canCancelItem ? (
            <BookingCancelAction
              bookingId={bookingId}
              endpoint={`/api/bookings/${bookingId}/items/${item.id}/cancel`}
              title="Cancel this item?"
              description="This item is released back to the availability calendar for these dates. This cannot be undone."
            />
          ) : null}
        </div>
      </div>

      {canViewPayments ? (
        <div className="border-border/60 bg-muted/20 flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-xs sm:pl-11">
          {chargeLines.map((line) => (
            <div key={line.label} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{line.label}</span>
              <span>
                {line.sign ?? ""}
                {line.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {item.status === "cancelled" && item.cancellationReason ? (
        <p className="text-xs sm:pl-11">
          <span className="text-muted-foreground">Cancellation reason: </span>
          <span className="font-medium">{item.cancellationReason}</span>
        </p>
      ) : null}

      {item.damageNotes ? (
        <p className="text-xs sm:pl-11">
          <span className="text-muted-foreground">Damage notes: </span>
          <span className="font-medium">{item.damageNotes}</span>
        </p>
      ) : null}
    </div>
  );
}
