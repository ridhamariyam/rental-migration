import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ContactIcon,
  FileTextIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  PaperclipIcon,
  PencilIcon,
  ReceiptTextIcon,
  ShirtIcon,
  StickyNoteIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AddBookingItemButton } from "@/components/tenant/add-booking-item-dialog";
import { BookingStatusBadge } from "@/components/tenant/booking-status-badge";
import { BookingCancelAction } from "@/components/tenant/booking-cancel-action";
import { BookingPaymentsCard } from "@/components/tenant/booking-payments-card";
import { BookingPickupDialog } from "@/components/tenant/booking-pickup-dialog";
import { BookingReturnDialog } from "@/components/tenant/booking-return-dialog";
import { PaymentStatusBadge } from "@/components/tenant/payment-status-badge";
import { ReturnConditionBadge } from "@/components/tenant/return-condition-badge";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate, formatMoney } from "@/lib/format";
import { addMoney } from "@/lib/money";
import { canTransition, isEditable, isTerminal } from "@/lib/booking-state";
import { getBookingById, getBookingsInGroup } from "@/server/bookings/service";
import { listPaymentsForBooking } from "@/server/payments/service";

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

  const { payments, summary } = canViewPayments
    ? await listPaymentsForBooking(user.shopId, booking.id)
    : { payments: [], summary: null };

  const groupSiblings = await getBookingsInGroup(
    user.shopId,
    booking.bookingGroupId,
    booking.id,
    user,
  );

  const itemLabel = [booking.variationColor, booking.variationSize]
    .filter(Boolean)
    .join(", ");

  const handledByName = booking.handledByFirstName
    ? `${booking.handledByFirstName} ${booking.handledByLastName ?? ""}`.trim()
    : null;

  const fields = [
    {
      label: "Customer",
      value: `${booking.customerFirstName} ${booking.customerLastName} · ${booking.customerPhone}`,
      icon: ContactIcon,
    },
    {
      label: "Item",
      value: `${booking.productName}${itemLabel ? ` (${itemLabel})` : ""} · ${booking.variationSku}${booking.quantity > 1 ? ` × ${booking.quantity}` : ""}`,
      icon: ShirtIcon,
    },
    {
      label: "Dates",
      value: `${formatDate(booking.fromDate, "long")} \u2192 ${formatDate(booking.toDate, "long")} (${booking.totalDays} day${booking.totalDays === 1 ? "" : "s"})`,
      icon: CalendarIcon,
    },
    {
      label: "Notes",
      value: booking.notes || "—",
      icon: StickyNoteIcon,
    },
  ];

  // Every role now sees who this booking is attributed to, since staff
  // can view bookings handled by other staff (not just their own).
  if (handledByName) {
    fields.push({
      label: "Handled by",
      value: handledByName,
      icon: UserIcon,
    });
  }

  if (booking.pickedUpAt) {
    fields.push({
      label: "Picked up",
      value: formatDate(booking.pickedUpAt, "long"),
      icon: PackageCheckIcon,
    });
  }

  if (booking.returnedAt) {
    fields.push({
      label: "Returned",
      value: formatDate(booking.returnedAt, "long"),
      icon: PackageOpenIcon,
    });
  }

  const canEditBooking = canManage && isEditable(booking.status);
  const canCancelBooking = canCancel && !isTerminal(booking.status);
  const canConfirmPickup =
    canPickup &&
    booking.status !== "rented" &&
    canTransition(booking.status, "rented");
  const canReturnItem =
    canReturn &&
    booking.status !== "returned" &&
    canTransition(booking.status, "returned");

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
                ? `${count} bookings created successfully.`
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
              <h1 className="text-2xl font-semibold tracking-tight">
                {booking.bookingNumber}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <BookingStatusBadge status={booking.status} />
                <PaymentStatusBadge status={booking.paymentStatus} />
                {booking.returnCondition ? (
                  <ReturnConditionBadge condition={booking.returnCondition} />
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
            {canReturnItem && summary ? (
              <BookingReturnDialog
                bookingId={booking.id}
                expectedBarcode={booking.variationBarcode}
                summary={summary}
              />
            ) : null}
            {canConfirmPickup && summary ? (
              <BookingPickupDialog
                bookingId={booking.id}
                expectedBarcode={booking.variationBarcode}
                summary={summary}
                canRecordPayment={canRecordPayment}
              />
            ) : null}
            {canEditBooking ? (
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
            <CardTitle className="text-base">Booking details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {fields.map((field) => (
                <div
                  key={field.label}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <field.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <p className="text-muted-foreground text-sm">
                      {field.label}
                    </p>
                    <p className="truncate text-sm font-medium sm:text-right">
                      {field.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TagIcon className="size-4" aria-hidden="true" />
              Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {formatMoney(booking.rentAmount)} per item
                  {booking.quantity > 1 ? ` × ${booking.quantity}` : ""}
                </span>
                <span className="font-medium">
                  {formatMoney(booking.grossRent)}
                </span>
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
              {Number(booking.damageCharge) > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Damage charge</span>
                  <span className="font-medium">
                    {formatMoney(booking.damageCharge)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rent payable</span>
                <span className="font-medium">
                  {formatMoney(booking.totalAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Security deposit</span>
                <span className="font-medium">
                  {formatMoney(booking.securityDeposit)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base">
                <span className="font-semibold">Total due at pickup</span>
                <span className="font-semibold">
                  {formatMoney(
                    summary?.totalReceivable ??
                      addMoney(booking.totalAmount, booking.securityDeposit),
                  )}
                </span>
              </div>
            </div>

            {booking.status === "cancelled" && booking.cancellationReason ? (
              <>
                <Separator />
                <div className="text-sm">
                  <p className="text-muted-foreground">Cancellation reason</p>
                  <p className="font-medium">{booking.cancellationReason}</p>
                </div>
              </>
            ) : null}

            {booking.damageNotes ? (
              <>
                <Separator />
                <div className="text-sm">
                  <p className="text-muted-foreground">Damage notes</p>
                  <p className="font-medium">{booking.damageNotes}</p>
                </div>
              </>
            ) : null}

            {canCancelBooking ? (
              <>
                <Separator />
                <BookingCancelAction bookingId={booking.id} />
              </>
            ) : null}
          </CardContent>
        </Card>

        {booking.documents.length > 0 ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PaperclipIcon className="size-4" aria-hidden="true" />
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

        {groupSiblings.length > 0 || (canManage && isEditable(booking.status)) ? (
          <Card className="lg:col-span-3">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                Part of this order ({groupSiblings.length + 1} item
                {groupSiblings.length + 1 === 1 ? "" : "s"})
              </CardTitle>
              {canManage && isEditable(booking.status) ? (
                <AddBookingItemButton
                  bookingId={booking.id}
                  bookingNumber={booking.bookingNumber}
                />
              ) : null}
            </CardHeader>
            {groupSiblings.length > 0 ? (
              <CardContent>
              <div className="divide-y">
                {groupSiblings.map((sibling) => {
                  const siblingLabel = [
                    sibling.variationColor,
                    sibling.variationSize,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <Link
                      key={sibling.id}
                      href={`${tenantPaths.bookings}/${sibling.id}`}
                      className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {sibling.bookingNumber} · {sibling.productName}
                          {siblingLabel ? ` (${siblingLabel})` : ""}
                          {sibling.quantity > 1 ? ` × ${sibling.quantity}` : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-medium">
                          {formatMoney(sibling.totalAmount)}
                        </span>
                        <BookingStatusBadge status={sibling.status} />
                      </div>
                    </Link>
                  );
                })}
              </div>
              </CardContent>
            ) : null}
          </Card>
        ) : null}
      </div>
    </main>
  );
}
