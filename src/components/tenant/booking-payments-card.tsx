import { BanknoteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentStatusBadge } from "@/components/tenant/payment-status-badge";
import {
  RecordPaymentDialog,
  type RecordPaymentItemOption,
} from "@/components/tenant/record-payment-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import { compareMoney, nonNegativeMoney, subtractMoney, ZERO_MONEY } from "@/lib/money";
import type { PaymentRow, PaymentSummary } from "@/server/payments/service";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  advance: "Advance",
  balance: "Balance",
  security_deposit: "Security deposit",
  damage_charge: "Damage charge",
  refund: "Refund",
  deposit_release: "Deposit refund",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const OUTFLOW_TYPES = new Set(["refund", "deposit_release"]);

/**
 * "Outstanding" is a sum of two independent balances (rent vs. deposit) —
 * spelling out which part it's made of avoids exactly the confusion a
 * bare total invites (e.g. rent fully collected but the deposit still
 * outstanding reads as "something's unpaid" with no clue what).
 */
export function outstandingBreakdown(summary: PaymentSummary): string | null {
  if (compareMoney(summary.outstanding, ZERO_MONEY) <= 0) {
    return null;
  }

  const rentDue = nonNegativeMoney(summary.rentBalance);
  const depositDue = nonNegativeMoney(summary.depositBalance);

  const parts: string[] = [];
  if (compareMoney(rentDue, ZERO_MONEY) > 0) {
    parts.push(`${formatMoney(rentDue)} rent balance`);
  }
  if (compareMoney(depositDue, ZERO_MONEY) > 0) {
    parts.push(`${formatMoney(depositDue)} deposit not yet collected`);
  }
  return parts.length > 0 ? parts.join(" + ") : null;
}

/**
 * The flip side of `outstandingBreakdown`: what's already been collected
 * that now exceeds what's payable (e.g. cancelling an already-paid item),
 * so staff know a refund is owed instead of the ledger just quietly
 * reading "Paid".
 */
export function creditBreakdown(summary: PaymentSummary): string | null {
  if (compareMoney(summary.creditBalance, ZERO_MONEY) <= 0) {
    return null;
  }

  const rentCredit = nonNegativeMoney(subtractMoney(ZERO_MONEY, summary.rentBalance));
  const depositCredit = nonNegativeMoney(subtractMoney(ZERO_MONEY, summary.depositBalance));

  const parts: string[] = [];
  if (compareMoney(rentCredit, ZERO_MONEY) > 0) {
    parts.push(`${formatMoney(rentCredit)} rent`);
  }
  if (compareMoney(depositCredit, ZERO_MONEY) > 0) {
    parts.push(`${formatMoney(depositCredit)} deposit`);
  }
  return parts.length > 0 ? `Collected ${parts.join(" + ")} more than is now payable` : null;
}

export function BookingPaymentsCard({
  bookingId,
  bookingStatus,
  payments,
  summary,
  canRecord,
  canRefund,
  title = "Payments",
  itemLabelsByBookingId,
  items,
}: {
  bookingId: string;
  bookingStatus: string;
  payments: PaymentRow[];
  summary: PaymentSummary;
  canRecord: boolean;
  canRefund: boolean;
  title?: string;
  /** Set on a whole-order rollup, where `payments` spans more than one
   * booking and each ledger row needs to say which item it belongs to. */
  itemLabelsByBookingId?: Record<string, string>;
  /** Same rollup case — lets "Record payment" offer a picker for which
   * line item the entry lands on instead of always using `bookingId`. */
  items?: RecordPaymentItemOption[];
}) {
  const canRecordAnything = (canRecord || canRefund) && bookingStatus !== "cancelled";

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BanknoteIcon className="size-4" aria-hidden="true" />
          {title}
          <PaymentStatusBadge status={summary.status} />
        </CardTitle>
        {canRecordAnything ? (
          <RecordPaymentDialog
            bookingId={bookingId}
            summary={summary}
            canRefund={canRefund}
            items={items}
          />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">
              Total receivable
            </span>
            <span className="font-medium">
              {formatMoney(summary.totalReceivable)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">
              Rent collected
            </span>
            <span className="font-medium">
              {formatMoney(summary.rentCollected)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">
              Deposit collected
            </span>
            <span className="font-medium">
              {formatMoney(summary.depositCollected)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Outstanding</span>
            <span
              className={
                compareMoney(summary.outstanding, ZERO_MONEY) > 0
                  ? "text-destructive font-semibold"
                  : "font-semibold"
              }
            >
              {formatMoney(summary.outstanding)}
            </span>
          </div>

          {/* Money that has gone back out only earns a tile once there is
              some — an always-visible "Refunded ₹0.00" on the many bookings
              that never see one is noise, but a refund that happened has to
              be visible here and not only as a row in the ledger below. */}
          {compareMoney(summary.refunded, ZERO_MONEY) > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">Refunded</span>
              <span className="text-destructive font-medium">
                -{formatMoney(summary.refunded)}
              </span>
            </div>
          ) : null}

          {compareMoney(summary.depositReleased, ZERO_MONEY) > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">
                Deposit returned
              </span>
              <span className="text-destructive font-medium">
                -{formatMoney(summary.depositReleased)}
              </span>
            </div>
          ) : null}

          {compareMoney(summary.depositHeld, ZERO_MONEY) > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">
                Deposit held
              </span>
              <span className="font-medium">
                {formatMoney(summary.depositHeld)}
              </span>
            </div>
          ) : null}

          {compareMoney(summary.creditBalance, ZERO_MONEY) > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-amber-600 text-xs dark:text-amber-400">
                Credit — refund owed
              </span>
              <span className="text-amber-600 font-semibold dark:text-amber-400">
                {formatMoney(summary.creditBalance)}
              </span>
            </div>
          ) : null}
        </div>

        {outstandingBreakdown(summary) ? (
          <p className="text-muted-foreground -mt-2 text-xs">
            {outstandingBreakdown(summary)}
          </p>
        ) : null}

        {creditBreakdown(summary) ? (
          <p className="-mt-2 text-xs text-amber-600 dark:text-amber-400">
            {creditBreakdown(summary)} — record a refund to settle it.
          </p>
        ) : null}

        <Separator />

        {payments.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BanknoteIcon />
              </EmptyMedia>
              <EmptyTitle>No payments recorded yet</EmptyTitle>
              <EmptyDescription>
                {canRecordAnything
                  ? "Record the advance or full payment to confirm this booking."
                  : "Nothing has been collected for this booking yet."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground h-9 px-0 text-xs font-medium tracking-wide uppercase">
                  Date
                </TableHead>
                {itemLabelsByBookingId ? (
                  <TableHead className="text-muted-foreground h-9 text-xs font-medium tracking-wide uppercase">
                    Item
                  </TableHead>
                ) : null}
                <TableHead className="text-muted-foreground h-9 text-xs font-medium tracking-wide uppercase">
                  Type
                </TableHead>
                <TableHead className="text-muted-foreground h-9 text-xs font-medium tracking-wide uppercase">
                  Method
                </TableHead>
                <TableHead className="text-muted-foreground h-9 text-xs font-medium tracking-wide uppercase">
                  Reference
                </TableHead>
                <TableHead className="text-muted-foreground h-9 text-right text-xs font-medium tracking-wide uppercase">
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const isOutflow = OUTFLOW_TYPES.has(payment.paymentType);
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="text-muted-foreground px-0 py-2.5 text-sm whitespace-nowrap">
                      {formatDate(payment.createdAt)}
                    </TableCell>
                    {itemLabelsByBookingId ? (
                      <TableCell className="text-muted-foreground py-2.5 text-sm whitespace-nowrap">
                        {itemLabelsByBookingId[payment.bookingId] ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="py-2.5 text-sm">
                      {PAYMENT_TYPE_LABELS[payment.paymentType] ??
                        payment.paymentType}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className="font-normal">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod] ??
                          payment.paymentMethod}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground py-2.5 text-sm">
                      {payment.referenceNumber || "—"}
                    </TableCell>
                    <TableCell
                      className={
                        isOutflow
                          ? "text-destructive py-2.5 text-right text-sm font-medium"
                          : "py-2.5 text-right text-sm font-medium"
                      }
                    >
                      {isOutflow ? "-" : ""}
                      {formatMoney(payment.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
