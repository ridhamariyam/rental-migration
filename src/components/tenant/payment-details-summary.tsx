import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import {
  compareMoney,
  nonNegativeMoney,
  subtractMoney,
  ZERO_MONEY,
} from "@/lib/money";
import type { PaymentSummary } from "@/server/payments/service";

export type PaymentState = {
  /** Everything the customer owes on this order — rent, assessed damage
   * and the security deposit. */
  totalAmount: string;
  /** What has actually been received against it so far, net of anything
   * paid back. Derived as total − balance so the three figures on screen
   * always add up, rather than summing payment rows a second time. */
  amountPaid: string;
  /** `totalAmount − amountPaid`, never negative — an over-collection shows
   * as the credit tile on the payments card, not as a negative balance. */
  balanceAmount: string;
  label: "PAID IN FULL" | "PARTIALLY PAID" | "PAYMENT PENDING";
  tone: "paid" | "partial" | "pending";
};

/**
 * The counter-facing reading of a booking's money: total, paid, balance,
 * and which of the three states that puts it in.
 *
 * Deliberately derived from `summary.outstanding` rather than re-summing
 * the ledger: `outstanding` is what already nets off refunds, returned
 * deposit and deposit kept against damage, so "total − paid = balance"
 * holds on screen in the awkward cases too (a cancelled-then-refunded
 * item, a deposit partly applied to damage) instead of only the simple
 * ones.
 */
export function paymentState(summary: PaymentSummary): PaymentState {
  const totalAmount = summary.totalReceivable;
  const balanceAmount = nonNegativeMoney(summary.outstanding);
  const amountPaid = nonNegativeMoney(
    subtractMoney(totalAmount, balanceAmount),
  );

  const hasBalance = compareMoney(balanceAmount, ZERO_MONEY) > 0;
  const hasPaid = compareMoney(amountPaid, ZERO_MONEY) > 0;

  if (!hasBalance) {
    return {
      totalAmount,
      amountPaid,
      balanceAmount,
      label: "PAID IN FULL",
      tone: "paid",
    };
  }

  return {
    totalAmount,
    amountPaid,
    balanceAmount,
    label: hasPaid ? "PARTIALLY PAID" : "PAYMENT PENDING",
    tone: hasPaid ? "partial" : "pending",
  };
}

const TONE_CLASSES: Record<PaymentState["tone"], string> = {
  paid: "bg-primary/10 text-primary",
  partial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  pending: "bg-destructive/10 text-destructive",
};

/**
 * Total / paid / balance / status, in that reading order — the four
 * numbers a counter is asked for on the phone ("how much is left on that
 * booking?"), pulled out of the fuller rent-vs-deposit breakdown below it
 * so the answer is one glance rather than a subtraction.
 */
export function PaymentDetailsSummary({
  summary,
  className,
}: {
  summary: PaymentSummary;
  className?: string;
}) {
  const state = paymentState(summary);

  const rows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Total amount", value: formatMoney(state.totalAmount) },
    { label: "Advance paid", value: formatMoney(state.amountPaid) },
    {
      label: "Balance amount",
      value: formatMoney(state.balanceAmount),
      emphasis: true,
    },
  ];

  return (
    <div
      className={
        className ?? "bg-muted/40 border-border/60 rounded-lg border p-4"
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">{row.label}</dt>
            <dd
              className={
                row.emphasis
                  ? state.tone === "paid"
                    ? "text-base font-semibold"
                    : "text-destructive text-base font-semibold"
                  : "text-base font-medium"
              }
            >
              {row.value}
            </dd>
          </div>
        ))}

        <div className="flex flex-col items-start gap-1">
          <dt className="text-muted-foreground text-xs">Payment status</dt>
          <dd>
            <Badge
              variant="secondary"
              className={`${TONE_CLASSES[state.tone]} font-semibold tracking-wide`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {state.label}
            </Badge>
          </dd>
        </div>
      </dl>
    </div>
  );
}
