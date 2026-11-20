"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, IndianRupeeIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { addMonths, type PlanCatalog } from "@/lib/plans";
import { OFFLINE_PAYMENT_METHODS } from "@/lib/validation/admin-billing";

type PlanChoice = "yearly" | "monthly" | "custom";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const selectClass =
  "border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Record a payment received outside Razorpay (UPI, bank, cash) — the
 * server adds one billing period on top of the later of today or the
 * current end date, so the preview below matches what will be saved.
 */
export function RecordPaymentDialog({
  tenantId,
  tenantName,
  plans,
  currentPlan,
  currentEndsAt,
  hasPaidBefore,
  customDeal = null,
  triggerLabel = "Record payment",
  triggerVariant = "default",
  triggerSize = "sm",
  triggerClassName,
}: {
  tenantId: string;
  tenantName: string;
  /** Live prices from `getPlans()` — the dialog pre-fills amounts from these. */
  plans: PlanCatalog;
  currentPlan: PlanChoice | null;
  currentEndsAt: string | null;
  hasPaidBefore: boolean;
  /** Last agreed custom terms (amount in paise + cycle), to pre-fill. */
  customDeal?: { amountPaise: number; cycle: "monthly" | "yearly" } | null;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary";
  triggerSize?: "sm" | "default";
  triggerClassName?: string;
}) {
  const router = useRouter();
  const initialPlan: PlanChoice = currentPlan ?? "yearly";
  const defaultAmount = (plan: PlanChoice, withSetup: boolean) =>
    plan === "custom"
      ? customDeal
        ? String(customDeal.amountPaise / 100)
        : ""
      : String(plans[plan].price + (withSetup ? plans[plan].setupFee : 0));

  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanChoice>(initialPlan);
  const [includeSetup, setIncludeSetup] = useState(!hasPaidBefore);
  const [amount, setAmount] = useState(defaultAmount(initialPlan, !hasPaidBefore));
  const [method, setMethod] = useState<(typeof OFFLINE_PAYMENT_METHODS)[number]>("UPI");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [extend, setExtend] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "yearly">(customDeal?.cycle ?? "monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const currentEnd = currentEndsAt ? new Date(currentEndsAt) : null;
  const periodStart = currentEnd && currentEnd > now ? currentEnd : now;
  const hasFutureEnd = Boolean(currentEnd && currentEnd > now);
  const previewEnd = !extend && hasFutureEnd
    ? currentEnd
    : plan === "custom"
      ? addMonths(periodStart, cycle === "yearly" ? 12 : 1)
      : addMonths(periodStart, plans[plan].periodMonths);

  function changePlan(next: PlanChoice) {
    setPlan(next);
    setAmount(defaultAmount(next, includeSetup));
  }

  function toggleSetup(next: boolean) {
    setIncludeSetup(next);
    setAmount(defaultAmount(plan, next));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/tenants/${tenantId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          plan,
          amount: Number(amount),
          setupFee: plan !== "custom" && includeSetup ? plans[plan].setupFee : 0,
          method,
          reference: reference || undefined,
          note: note || undefined,
          paidOn: paidOn || undefined,
          cycle: plan === "custom" ? cycle : undefined,
          extend: hasFutureEnd ? extend : true,
        }),
      });
      setOpen(false);
      setReference("");
      setNote("");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} className={triggerClassName} />}>
        <IndianRupeeIcon />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>
              For money {tenantName} paid you directly (UPI, bank transfer, cash). Their subscription is extended straight away.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Plan</FieldLabel>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Plan">
                  {(["yearly", "monthly", "custom"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={plan === p}
                      onClick={() => changePlan(p)}
                      className={
                        plan === p
                          ? "border-primary bg-primary/5 text-primary rounded-lg border px-2 py-2 text-sm font-medium"
                          : "hover:bg-muted rounded-lg border px-2 py-2 text-sm"
                      }
                    >
                      {p === "custom" ? "Custom" : plans[p].name}
                    </button>
                  ))}
                </div>
              </Field>

              {plan !== "custom" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    checked={includeSetup}
                    onChange={(e) => toggleSetup(e.target.checked)}
                  />
                  Include one-time setup fee (₹{plans[plan].setupFee})
                </label>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="rp-amount">Amount received (₹)</FieldLabel>
                  <Input
                    id="rp-amount"
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rp-method">Paid via</FieldLabel>
                  <select
                    id="rp-method"
                    className={selectClass}
                    value={method}
                    onChange={(e) => setMethod(e.target.value as typeof method)}
                  >
                    {OFFLINE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rp-paid-on">Paid on</FieldLabel>
                  <Input id="rp-paid-on" type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rp-ref">Reference (optional)</FieldLabel>
                  <Input id="rp-ref" placeholder="UPI / UTR number" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
                </Field>
                {plan === "custom" ? (
                  <Field className="sm:col-span-2">
                    <FieldLabel>Billed</FieldLabel>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Custom billing cycle">
                      {(["monthly", "yearly"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={cycle === c}
                          onClick={() => setCycle(c)}
                          className={
                            cycle === c
                              ? "border-primary bg-primary/5 text-primary rounded-lg border px-2 py-2 text-sm font-medium"
                              : "hover:bg-muted rounded-lg border px-2 py-2 text-sm"
                          }
                        >
                          {c === "monthly" ? "Monthly (1 month)" : "Yearly (12 months)"}
                        </button>
                      ))}
                    </div>
                    <FieldDescription>
                      Enter the agreed price above. This payment covers one {cycle === "yearly" ? "year" : "month"}
                      {customDeal ? "; pre-filled from their last custom payment" : ""}.
                    </FieldDescription>
                  </Field>
                ) : null}
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="rp-note">Note (optional)</FieldLabel>
                  <Input id="rp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
                </Field>
              </div>

              {hasFutureEnd && currentEnd ? (
                <Field>
                  <FieldLabel>Subscription date</FieldLabel>
                  <div className="flex flex-col gap-2 text-sm">
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="rp-extend"
                        className="accent-primary mt-0.5 size-4"
                        checked={extend}
                        onChange={() => setExtend(true)}
                      />
                      <span>
                        Extend the subscription by this payment
                        <span className="text-muted-foreground block text-xs">Use this for a normal renewal.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="rp-extend"
                        className="accent-primary mt-0.5 size-4"
                        checked={!extend}
                        onChange={() => setExtend(false)}
                      />
                      <span>
                        Keep the paid-until date ({new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(currentEnd)})
                        <span className="text-muted-foreground block text-xs">
                          Use this if you already set the date with “Edit plan” and only need to log the money.
                        </span>
                      </span>
                    </label>
                  </div>
                </Field>
              ) : null}

              <FieldDescription>
                {previewEnd
                  ? `Subscription will run until ${new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(previewEnd)}.`
                  : ""}
              </FieldDescription>

              {error ? (
                <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
                  <AlertCircleIcon />
                  <AlertDescription className="text-destructive font-medium">{error}</AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !amount}>
              {isSubmitting ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                "Record payment"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
