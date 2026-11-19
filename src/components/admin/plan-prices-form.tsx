"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, CheckCircle2Icon, RotateCcwIcon } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatRupees, PLAN_IDS, type PlanCatalog, type PlanId } from "@/lib/plans";

type Draft = Record<PlanId, { price: string; setupFee: string }>;

function toDraft(plans: PlanCatalog): Draft {
  return {
    yearly: { price: String(plans.yearly.price), setupFee: String(plans.yearly.setupFee) },
    monthly: { price: String(plans.monthly.price), setupFee: String(plans.monthly.setupFee) },
  };
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 7);

/**
 * Edits the live prices. Saving goes through a confirmation that spells
 * out the change, because it immediately alters what new customers are
 * charged on the website.
 */
export function PlanPricesForm({ plans }: { plans: PlanCatalog }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(plans));
  const [confirming, setConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changes = PLAN_IDS.flatMap((id) => {
    const lines: string[] = [];
    const price = Number(draft[id].price);
    const setupFee = Number(draft[id].setupFee);
    if (price !== plans[id].price) {
      lines.push(`${plans[id].name} price: ${formatRupees(plans[id].price)} → ${formatRupees(price)}`);
    }
    if (setupFee !== plans[id].setupFee) {
      lines.push(`${plans[id].name} setup fee: ${formatRupees(plans[id].setupFee)} → ${formatRupees(setupFee)}`);
    }
    return lines;
  });
  const invalid = PLAN_IDS.some((id) => !draft[id].price || Number(draft[id].price) < 1 || draft[id].setupFee === "");

  function update(id: PlanId, field: "price" | "setupFee", value: string) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [field]: digitsOnly(value) } }));
  }

  async function save() {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest("/api/admin/plans", {
        method: "PUT",
        body: JSON.stringify({
          yearly: { price: Number(draft.yearly.price), setupFee: Number(draft.yearly.setupFee) },
          monthly: { price: Number(draft.monthly.price), setupFee: Number(draft.monthly.setupFee) },
        }),
      });
      setConfirming(false);
      setSaved(true);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError ? submitError.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (changes.length > 0 && !invalid) setConfirming(true);
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PLAN_IDS.map((id) => {
          const price = Number(draft[id].price) || 0;
          const setupFee = Number(draft[id].setupFee) || 0;
          return (
            <div key={id} className="flex flex-col gap-4 rounded-xl border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{plans[id].name}</h3>
                <span className="text-muted-foreground text-xs">Billed every {plans[id].periodLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor={`${id}-price`}>Price (₹ / {plans[id].periodLabel})</FieldLabel>
                  <Input
                    id={`${id}-price`}
                    inputMode="numeric"
                    required
                    value={draft[id].price}
                    onChange={(e) => update(id, "price", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-setup`}>Setup fee (₹, once)</FieldLabel>
                  <Input
                    id={`${id}-setup`}
                    inputMode="numeric"
                    required
                    value={draft[id].setupFee}
                    onChange={(e) => update(id, "setupFee", e.target.value)}
                  />
                </Field>
              </div>
              <FieldDescription>
                New customers pay {formatRupees(price + setupFee)} today, then {formatRupees(price)} each {plans[id].periodLabel}.
                {id === "yearly" && price > 0 ? ` That's about ${formatRupees(Math.round(price / 12))} a month.` : ""}
              </FieldDescription>
            </div>
          );
        })}
      </div>

      {saved ? (
        <Alert className="border-primary/25 bg-primary/5">
          <CheckCircle2Icon className="text-primary" />
          <AlertDescription className="text-primary font-medium">
            Prices saved. The website and new checkouts use them now.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={changes.length === 0 || invalid}>
          Save prices
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={changes.length === 0}
          onClick={() => {
            setDraft(toDraft(plans));
            setSaved(false);
          }}
        >
          <RotateCcwIcon />
          Undo changes
        </Button>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          setConfirming(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change prices?</DialogTitle>
            <DialogDescription>
              The website and every checkout started from now on use the new prices. Payments already made keep the
              amount that was charged, so no tenant&apos;s payment history changes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="bg-muted/50 flex flex-col gap-1 rounded-lg border p-3 text-sm">
              {changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {error ? (
              <Alert variant="destructive" className="border-destructive/25 bg-destructive/5 mt-3">
                <AlertCircleIcon />
                <AlertDescription className="text-destructive font-medium">{error}</AlertDescription>
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isSubmitting} onClick={save}>
              {isSubmitting ? <Spinner /> : null}
              Change prices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
