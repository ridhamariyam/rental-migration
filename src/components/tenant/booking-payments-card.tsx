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
import { RecordPaymentDialog } from "@/components/tenant/record-payment-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import { compareMoney, nonNegativeMoney, ZERO_MONEY } from "@/lib/money";
import type { PaymentRow, PaymentSummary } from "@/server/payments/service";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  advance: "Advance",
  balance: "Balance",
  security_deposit: "Security deposit",
  damage_charge: "Damage charge",
  refund: "Refund",
  deposit_release: "Deposit release",
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

export function BookingPaymentsCard({
  bookingId,
  bookingStatus,
  payments,
  summary,
  canRecord,
  canRefund,
}: {
  bookingId: string;
  bookingStatus: string;
  payments: PaymentRow[];
  summary: PaymentSummary;
  canRecord: boolean;
  canRefund: boolean;
}) {
  const canRecordAnything = (canRecord || canRefund) && bookingStatus !== "cancelled";

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BanknoteIcon className="size-4" aria-hidden="true" />
          Payments
          <PaymentStatusBadge status={summary.status} />
        </CardTitle>
        {canRecordAnything ? (
          <RecordPaymentDialog
            bookingId={bookingId}
            summary={summary}
            canRefund={canRefund}
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
        </div>

        {outstandingBreakdown(summary) ? (
          <p className="text-muted-foreground -mt-2 text-xs">
            {outstandingBreakdown(summary)}
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
                    <TableCell className="py-2.5 text-right text-sm font-medium">
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
