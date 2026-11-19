import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  formatPaise,
  PLANS,
  subscriptionState,
  type SubscriptionState,
} from "@/lib/plans";

/**
 * Small presentational pieces shared by the super admin's dashboard,
 * dues, payments and tenant pages, so a subscription or payment reads the
 * same everywhere. No client state — safe in Server Components.
 */

const STATE_STYLES: Record<SubscriptionState, { label: string; className: string }> = {
  active: { label: "Paid up", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  expiring: { label: "Expiring soon", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  grace: { label: "Overdue · grace", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
  locked: { label: "Locked", className: "bg-destructive/10 text-destructive" },
  none: { label: "No plan", className: "bg-muted text-muted-foreground" },
};

export function SubscriptionBadge({
  endsAt,
  state,
  className,
}: {
  endsAt?: Date | null;
  state?: SubscriptionState;
  className?: string;
}) {
  const resolved = state ?? subscriptionState(endsAt ?? null);
  const style = STATE_STYLES[resolved];
  return (
    <Badge variant="secondary" className={cn(style.className, className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {style.label}
    </Badge>
  );
}

export function planLabel(plan: "yearly" | "monthly" | "custom" | null): string {
  if (!plan) return "—";
  if (plan === "custom") return "Custom";
  return PLANS[plan].name;
}

/** "Ends 12 Mar 2027 · 41 days left" / "Ended 2 Nov 2026 · 17 days ago". */
export function subscriptionSummary(endsAt: Date | null, now = new Date()): string {
  if (!endsAt) return "No end date — never locks";
  const days = Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000);
  if (days > 0) return `Ends ${formatDate(endsAt)} · ${days} day${days === 1 ? "" : "s"} left`;
  if (days === 0) return `Ends today`;
  return `Ended ${formatDate(endsAt)} · ${-days} day${days === -1 ? "" : "s"} ago`;
}

const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  created: { label: "Checkout started", className: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

export function PaymentStatusBadge({
  status,
  needsAttention,
}: {
  status: string;
  needsAttention?: boolean;
}) {
  const style = PAYMENT_STATUS[status] ?? PAYMENT_STATUS.created;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="secondary" className={style.className}>
        {style.label}
      </Badge>
      {needsAttention ? (
        <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
          Needs attention
        </Badge>
      ) : null}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "primary" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    danger: "bg-destructive/10 text-destructive",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  }[tone];

  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="flex items-start gap-3">
        <span className={cn("hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex", toneClass)}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground text-xs leading-tight font-medium tracking-wide uppercase">
            {label}
          </span>
          <span className="truncate text-lg font-semibold tracking-tight tabular-nums">{value}</span>
          {hint ? <span className="text-muted-foreground text-xs leading-snug">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export { formatPaise };

/** wa.me link to a tenant's phone with a prefilled renewal reminder. */
export function renewalReminderLink(params: {
  phone: string | null;
  businessName: string;
  ownerName?: string | null;
  endsAt: Date | null;
  amountPaise?: number | null;
}): string | null {
  if (!params.phone) return null;
  let digits = params.phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return null;

  const greeting = params.ownerName ? `Hi ${params.ownerName.split(" ")[0]}` : "Hi";
  const now = Date.now();
  const when = params.endsAt
    ? params.endsAt.getTime() >= now
      ? `ends on ${formatDate(params.endsAt)}`
      : `ended on ${formatDate(params.endsAt)}`
    : "needs renewing";
  const amount = params.amountPaise ? ` The renewal is ${formatPaise(params.amountPaise)}.` : "";
  const message = `${greeting}, your Rentque subscription for ${params.businessName} ${when}.${amount} You can renew from Settings → Subscription in your dashboard, or reply here to pay by UPI. Thank you!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
