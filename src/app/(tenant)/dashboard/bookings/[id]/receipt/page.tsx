import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PrintReceiptButton } from "@/components/tenant/print-receipt-button";
import { outstandingBreakdown } from "@/components/tenant/booking-payments-card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate, formatMoney } from "@/lib/format";
import { getReceipt } from "@/server/payments/service";

type Params = Promise<{ id: string }>;

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

export const metadata = {
  title: "Receipt — Rentique",
};

/** One combined receipt for the whole order — every item, one payment
 * ledger, one total. */
export default async function BookingReceiptPage({
  params,
}: {
  params: Params;
}) {
  const user = await getCurrentUser();
  if (!user?.shopId) {
    return null;
  }

  if (!hasPermission(user.role, Permission.PAYMENT_VIEW)) {
    redirect(tenantPaths.dashboard);
  }

  const { id } = await params;
  const receipt = await getReceipt(user.shopId, id, user);

  if (!receipt) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`${tenantPaths.bookings}/${receipt.booking.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {receipt.booking.bookingNumber}
        </Link>
        <PrintReceiptButton />
      </div>

      <Card className="print:border-none print:shadow-none">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-lg font-semibold tracking-tight">
                {receipt.shop.name}
              </h1>
              {receipt.shop.address ? (
                <p className="text-muted-foreground text-sm">
                  {receipt.shop.address}
                </p>
              ) : null}
              {receipt.shop.phone ? (
                <p className="text-muted-foreground text-sm">
                  {receipt.shop.phone}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-muted-foreground text-xs tracking-wide uppercase">
                Receipt
              </span>
              <span className="font-mono text-sm font-medium">
                {receipt.booking.bookingNumber}
              </span>
              <span className="text-muted-foreground text-xs">
                Created {formatDate(receipt.booking.createdAt, "long")}
              </span>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-0.5 text-sm">
            <span className="text-muted-foreground text-xs">Customer</span>
            <span className="font-medium">{receipt.customer.name}</span>
            <span className="text-muted-foreground">
              {receipt.customer.phone}
            </span>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground text-xs tracking-wide uppercase">
              {receipt.items.length > 1 ? `Items (${receipt.items.length})` : "Item"}
            </span>
            <div className="flex flex-col gap-3 text-sm">
              {receipt.items.map((item) => {
                const itemLabel = [item.color, item.size]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {item.productName}
                        {itemLabel ? ` (${itemLabel})` : ""}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        SKU {item.sku} · {formatDate(item.fromDate)} →{" "}
                        {formatDate(item.toDate)}
                        {Number(item.damageCharge) > 0
                          ? ` · Damage ${formatMoney(item.damageCharge)}`
                          : ""}
                      </span>
                    </div>
                    <span className="font-medium">
                      {formatMoney(item.grossRent)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rent (all items)</span>
              <span className="font-medium">
                {formatMoney(receipt.charges.grossRentTotal)}
              </span>
            </div>
            {Number(receipt.charges.discountAmount) > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium">
                  -{formatMoney(receipt.charges.discountAmount)}
                </span>
              </div>
            ) : null}
            {Number(receipt.charges.additionalCost) > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {receipt.charges.additionalCostReason
                    ? `Additional cost — ${receipt.charges.additionalCostReason}`
                    : "Additional cost"}
                </span>
                <span className="font-medium">
                  {formatMoney(receipt.charges.additionalCost)}
                </span>
              </div>
            ) : null}
            {Number(receipt.charges.damageChargeTotal) > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Damage charge</span>
                <span className="font-medium">
                  {formatMoney(receipt.charges.damageChargeTotal)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rent payable</span>
              <span className="font-medium">
                {formatMoney(receipt.charges.totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Security deposit</span>
              <span className="font-medium">
                {formatMoney(receipt.charges.securityDeposit)}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-base">
              <span className="font-semibold">Total receivable</span>
              <span className="font-semibold">
                {formatMoney(receipt.summary.totalReceivable)}
              </span>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <span className="text-muted-foreground text-xs tracking-wide uppercase">
              Payments
            </span>
            {receipt.payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No payments recorded yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-muted-foreground h-8 px-0 text-xs font-medium tracking-wide uppercase">
                      Date
                    </TableHead>
                    <TableHead className="text-muted-foreground h-8 text-xs font-medium tracking-wide uppercase">
                      Type
                    </TableHead>
                    <TableHead className="text-muted-foreground h-8 text-xs font-medium tracking-wide uppercase">
                      Method
                    </TableHead>
                    <TableHead className="text-muted-foreground h-8 text-right text-xs font-medium tracking-wide uppercase">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipt.payments.map((payment) => {
                    const isOutflow = OUTFLOW_TYPES.has(payment.paymentType);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="text-muted-foreground px-0 py-2 text-sm whitespace-nowrap">
                          {formatDate(payment.createdAt)}
                        </TableCell>
                        <TableCell className="py-2 text-sm">
                          {PAYMENT_TYPE_LABELS[payment.paymentType] ??
                            payment.paymentType}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="font-normal">
                            {PAYMENT_METHOD_LABELS[payment.paymentMethod] ??
                              payment.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-right text-sm font-medium">
                          {isOutflow ? "-" : ""}
                          {formatMoney(payment.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {Number(receipt.summary.refunded) > 0 ||
            Number(receipt.summary.depositReleased) > 0 ? (
              <div className="flex flex-col gap-1 text-sm">
                {Number(receipt.summary.refunded) > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Refunded</span>
                    <span className="font-medium">
                      -{formatMoney(receipt.summary.refunded)}
                    </span>
                  </div>
                ) : null}
                {Number(receipt.summary.depositReleased) > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Deposit returned
                    </span>
                    <span className="font-medium">
                      -{formatMoney(receipt.summary.depositReleased)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <Separator />

            <div className="flex items-center justify-between text-base">
              <span className="font-semibold">Outstanding</span>
              <span className="font-semibold">
                {formatMoney(receipt.summary.outstanding)}
              </span>
            </div>
            {outstandingBreakdown(receipt.summary) ? (
              <p className="text-muted-foreground -mt-2 text-xs">
                {outstandingBreakdown(receipt.summary)}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
