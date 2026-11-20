"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  MessageCircleIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  addMonths,
  formatRupees,
  PLAN_IDS,
  renewalBlockedReason,
  whatsappLink,
  type PlanCatalog,
  type PlanId,
} from "@/lib/plans";
import {
  CheckoutDismissedError,
  openRazorpayCheckout,
  type CheckoutSessionPayload,
} from "@/lib/razorpay-checkout";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "long" });

/**
 * Owner-facing renewal: pick Yearly or Monthly, pay with Razorpay, and the
 * subscription is extended as soon as the payment is verified. The price
 * shown is the live one, but the amount charged is always set by the
 * server (`startRenewal`), never sent from here. Renewal opens in the reminder
 * window (`renewalBlockedReason`); the new period stacks on the time left.
 */
export function SubscriptionRenew({
  plans,
  currentPlan,
  endsAt,
  businessName,
  razorpayEnabled,
}: {
  plans: PlanCatalog;
  currentPlan: PlanId | "custom" | null;
  endsAt: string | null;
  businessName: string;
  razorpayEnabled: boolean;
}) {
  const router = useRouter();
  const now = new Date();
  const currentEnd = endsAt ? new Date(endsAt) : null;
  const blockedReason = (id: PlanId) =>
    renewalBlockedReason(id, { plan: currentPlan, endsAt: currentEnd }, now);
  const [selected, setSelected] = useState<PlanId>(
    currentPlan === "monthly" && !blockedReason("monthly") ? "monthly" : "yearly",
  );
  const [stage, setStage] = useState<"idle" | "starting" | "paying" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const plan = plans[selected];
  const monthlyBlocked = blockedReason("monthly");
  // Already paid well ahead: nothing to buy yet, so no plans or pay buttons.
  const paidAhead = PLAN_IDS.every((id) => blockedReason(id) !== null);
  const newEnd = addMonths(currentEnd && currentEnd > now ? currentEnd : now, plan.periodMonths);
  const busy = stage !== "idle";

  async function renew() {
    setError(null);
    setSuccess(null);
    setStage("starting");
    try {
      const session = await apiRequest<CheckoutSessionPayload>("/api/billing/renew", {
        method: "POST",
        body: JSON.stringify({ plan: selected }),
      });
      setStage("paying");
      const result = await openRazorpayCheckout(session);
      setStage("verifying");
      await apiRequest("/api/billing/renew/verify", {
        method: "POST",
        body: JSON.stringify(result),
      });
      setSuccess(`Payment received. Your subscription now runs until ${dateFormat.format(newEnd)}.`);
      router.refresh();
    } catch (renewError) {
      if (renewError instanceof CheckoutDismissedError) {
        setError("Payment was cancelled. Nothing was charged.");
      } else if (renewError instanceof ApiClientError) {
        setError(renewError.message);
      } else if (renewError instanceof Error && renewError.message) {
        setError(renewError.message);
      } else {
        setError("Something went wrong. If money was taken, contact us on WhatsApp and we'll sort it out.");
      }
    } finally {
      setStage("idle");
    }
  }

  const whatsappHref = whatsappLink(
    `Hi, I'd like to renew the Rentque ${plan.name} plan for ${businessName}.`,
  );

  if (paidAhead) {
    return (
      <div className="flex flex-col gap-3">
        {success ? (
          <Alert className="border-primary/25 bg-primary/5">
            <CheckCircle2Icon className="text-primary" />
            <AlertDescription className="text-primary font-medium">{success}</AlertDescription>
          </Alert>
        ) : null}
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2Icon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {blockedReason(selected)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Choose a plan">
        {PLAN_IDS.map((id) => {
          const option = plans[id];
          const active = id === selected;
          const locked = blockedReason(id) !== null;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={locked || undefined}
              disabled={busy || locked}
              title={blockedReason(id) ?? undefined}
              onClick={() => setSelected(id)}
              className={cn(
                "relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors",
                active ? "border-primary bg-primary/5 ring-primary/30 ring-2" : "hover:bg-muted/60",
                locked && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              {active ? (
                <span className="bg-primary text-primary-foreground absolute top-3 right-3 flex size-5 items-center justify-center rounded-full">
                  <CheckIcon className="size-3" aria-hidden="true" />
                </span>
              ) : null}
              <span className="flex items-center gap-1.5 font-semibold">
                {option.name}
                {id === currentPlan ? (
                  <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[11px] font-medium">
                    Current
                  </span>
                ) : currentPlan === "monthly" && id === "yearly" ? (
                  <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[11px] font-medium">
                    Upgrade
                  </span>
                ) : null}
              </span>
              <span className="text-xl font-semibold tracking-tight tabular-nums">
                {formatRupees(option.price)}
                <span className="text-muted-foreground text-sm font-normal"> / {option.periodLabel}</span>
              </span>
              <span className="text-muted-foreground text-xs">{option.tagline}</span>
            </button>
          );
        })}
      </div>

      {monthlyBlocked ? (
        <p className="text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 text-sm">{monthlyBlocked}</p>
      ) : null}

      <p className="text-muted-foreground text-sm">
        You pay <span className="text-foreground font-medium">{formatRupees(plan.price)}</span> (no setup fee on
        renewals). Your subscription will run until{" "}
        <span className="text-foreground font-medium">{dateFormat.format(newEnd)}</span>.
      </p>

      {success ? (
        <Alert className="border-primary/25 bg-primary/5">
          <CheckCircle2Icon className="text-primary" />
          <AlertDescription className="text-primary font-medium">{success}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
          <AlertCircleIcon />
          <AlertDescription className="text-destructive font-medium">{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {razorpayEnabled ? (
          <Button size="lg" disabled={busy} onClick={renew} className="sm:min-w-56">
            {busy ? <Spinner /> : null}
            {stage === "starting"
              ? "Preparing payment…"
              : stage === "paying"
                ? "Complete payment in the window…"
                : stage === "verifying"
                  ? "Confirming payment…"
                  : `Pay ${formatRupees(plan.price)} & renew`}
          </Button>
        ) : null}
        <Button
          size="lg"
          variant={razorpayEnabled ? "outline" : "default"}
          nativeButton={false}
          render={<a href={whatsappHref} target="_blank" rel="noopener noreferrer" />}
        >
          <MessageCircleIcon />
          {razorpayEnabled ? "Pay by UPI on WhatsApp instead" : "Renew on WhatsApp"}
        </Button>
      </div>
    </div>
  );
}
