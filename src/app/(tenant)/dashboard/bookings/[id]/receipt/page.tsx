import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon, ShirtIcon } from "lucide-react";
import { PrintReceiptButton } from "@/components/tenant/print-receipt-button";
import { paymentState } from "@/components/tenant/payment-details-summary";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, Permission } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { compareMoney, ZERO_MONEY } from "@/lib/money";
import { getReceipt } from "@/server/payments/service";

type Params = Promise<{ id: string }>;

export const metadata = {
  title: "Invoice — Rentique",
};

/**
 * What the shop hands (or sends) the customer: a printable invoice for the
 * whole order.
 *
 * Laid out as a document rather than as dashboard cards — banner, who it
 * is from, who it is for, the lines, the booking dates, the money, the
 * terms — because that is what it has to look like once it is a PDF in a
 * WhatsApp thread, with no app around it to give the numbers context.
 *
 * The internal rent/deposit breakdown deliberately does **not** appear
 * here: a customer is owed four figures (what the goods cost, what is
 * payable, what they have paid, what is left), and the booking detail page
 * is where staff go for the ledger behind them.
 */
const TERMS = [
  "No refund will be given after booking cancellation.",
  "Products should be returned on the exact return date, without any damages.",
  "Any damages must be paid by the customer.",
  "Confirm your pickup and return dates before booking.",
  "Make sure all your needs are clear before booking.",
  "Security deposit (if applicable) will be refunded after return.",
];

export default async function BookingInvoicePage({
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

  const state = paymentState(receipt.summary);
  const billedItems = receipt.items.filter(
    (item) => item.status !== "cancelled",
  );

  // The order's own pickup/return window: the earliest date anything goes
  // out and the latest anything is due back, which is what the customer
  // has to remember — per-line dates stay on the lines.
  const pickupDate = billedItems.reduce<string | null>(
    (earliest, item) =>
      !earliest || item.fromDate < earliest ? item.fromDate : earliest,
    null,
  );
  const returnDate = billedItems.reduce<string | null>(
    (latest, item) => (!latest || item.toDate > latest ? item.toDate : latest),
    null,
  );

  const hasDeposit =
    compareMoney(receipt.charges.securityDeposit, ZERO_MONEY) > 0;
  const hasDiscount =
    compareMoney(receipt.charges.discountAmount, ZERO_MONEY) > 0;
  const hasExtra = compareMoney(receipt.charges.additionalCost, ZERO_MONEY) > 0;
  const hasDamage =
    compareMoney(receipt.charges.damageChargeTotal, ZERO_MONEY) > 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-6">
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

      {/* The document itself. Its own background and border rather than a
          Card, so print keeps the banner and drops the app chrome. */}
      <article className="print-document bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1">
        <header className="bg-primary text-primary-foreground flex items-center justify-end px-6 py-4 sm:px-8">
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase sm:text-3xl">
            Invoice
          </h1>
        </header>

        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
            <div className="flex items-start gap-3">
              {receipt.shop.logoUrl ? (
                <Image
                  src={receipt.shop.logoUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="size-14 rounded-md object-cover"
                  unoptimized
                />
              ) : null}
              <div className="flex flex-col gap-0.5">
                <p className="text-primary text-base font-bold tracking-wide uppercase">
                  {receipt.shop.name}
                </p>
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
                {receipt.shop.email ? (
                  <p className="text-muted-foreground text-sm">
                    {receipt.shop.email}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-start gap-0.5 sm:items-end sm:text-right">
              <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                Bill to
              </p>
              <p className="text-base font-semibold">{receipt.customer.name}</p>
              <p className="text-muted-foreground text-sm">
                {receipt.customer.phone}
              </p>
              {receipt.customer.location ? (
                <p className="text-muted-foreground text-sm">
                  {receipt.customer.location}
                </p>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm sm:max-w-sm">
            <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Invoice ID
            </dt>
            <dd className="font-mono font-medium">
              {receipt.booking.bookingNumber}
            </dd>
            <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Date
            </dt>
            <dd className="font-medium">
              {formatDateTime(receipt.booking.createdAt)}
            </dd>
          </dl>

          {/* Items. A table on every width — it is a document, so the
              columns stay put; only the padding and type tighten on a
              phone. */}
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/50">
                <tr className="text-muted-foreground text-left text-xs font-semibold tracking-wide uppercase">
                  <th className="hidden w-10 px-2 py-2 sm:table-cell sm:px-3">
                    No
                  </th>
                  <th className="px-2 py-2 sm:px-3">Item</th>
                  <th className="w-10 px-2 py-2 text-right sm:w-12 sm:px-3">
                    Qty
                  </th>
                  <th className="w-24 px-2 py-2 text-right whitespace-nowrap sm:px-3">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {billedItems.map((item, index) => (
                  <tr key={item.id} className="border-t">
                    <td className="text-muted-foreground hidden px-2 py-2.5 align-top sm:table-cell sm:px-3">
                      {index + 1}
                    </td>
                    <td className="px-2 py-2.5 sm:px-3">
                      <div className="flex items-start gap-2.5">
                        <span className="bg-muted hidden size-9 shrink-0 items-center justify-center overflow-hidden rounded border sm:flex">
                          {item.image ? (
                            <Image
                              src={item.image}
                              alt=""
                              width={36}
                              height={36}
                              className="size-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <ShirtIcon className="text-muted-foreground size-4" />
                          )}
                        </span>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">
                            {item.productName}
                            {item.color || item.size
                              ? ` (${[item.color, item.size].filter(Boolean).join(", ")})`
                              : ""}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {item.categoryName
                              ? `Category: ${item.categoryName} · `
                              : ""}
                            {item.totalDays} day
                            {item.totalDays === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right align-top sm:px-3">
                      {item.quantity}
                    </td>
                    <td className="px-2 py-2.5 text-right align-top font-medium whitespace-nowrap sm:px-3">
                      {formatMoney(item.grossRent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Booking info — the two dates the customer is being asked to
                keep to, which is what most of the phone calls are about. */}
            <div className="flex flex-col gap-1">
              <p className="text-primary text-xs font-semibold tracking-wide uppercase">
                Booking info
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Pickup: </span>
                {pickupDate ? formatDate(pickupDate, "long") : "—"}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Return: </span>
                {returnDate ? formatDate(returnDate, "long") : "—"}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t pt-4 text-sm sm:border-t-0 sm:pt-0">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Product cost
                </span>
                <span className="font-medium">
                  {formatMoney(receipt.charges.grossRentTotal)}
                </span>
              </div>
              {hasDiscount ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium">
                    -{formatMoney(receipt.charges.discountAmount)}
                  </span>
                </div>
              ) : null}
              {hasExtra ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {receipt.charges.additionalCostReason || "Extra charge"}
                  </span>
                  <span className="font-medium">
                    {formatMoney(receipt.charges.additionalCost)}
                  </span>
                </div>
              ) : null}
              {hasDamage ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Damage charge</span>
                  <span className="font-medium">
                    {formatMoney(receipt.charges.damageChargeTotal)}
                  </span>
                </div>
              ) : null}
              {hasDeposit ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Security deposit
                  </span>
                  <span className="font-medium">
                    {formatMoney(receipt.charges.securityDeposit)}
                  </span>
                </div>
              ) : null}

              <div className="border-t pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-primary text-base font-bold tracking-wide uppercase">
                    Total payable
                  </span>
                  <span className="text-primary text-base font-bold">
                    {formatMoney(state.totalAmount)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold tracking-wide uppercase">
                  Paid amount
                </span>
                <span className="font-semibold">
                  {formatMoney(state.amountPaid)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={
                    state.tone === "paid"
                      ? "font-semibold tracking-wide uppercase"
                      : "text-destructive font-semibold tracking-wide uppercase"
                  }
                >
                  Balance due
                </span>
                <span
                  className={
                    state.tone === "paid"
                      ? "font-semibold"
                      : "text-destructive font-semibold"
                  }
                >
                  {formatMoney(state.balanceAmount)}
                </span>
              </div>
              <p className="text-muted-foreground text-right text-xs font-semibold tracking-wide">
                {state.label}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t pt-4">
            <p className="text-xs font-semibold tracking-wide uppercase">
              Terms and <span className="text-primary">conditions</span>
            </p>
            <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
              {TERMS.map((term) => (
                <li key={term}>- {term}</li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="bg-primary h-6" />
      </article>
    </main>
  );
}
