"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, BanknoteIcon } from "lucide-react";

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  addMoney,
  compareMoney,
  subtractMoneyNonNegative,
  ZERO_MONEY,
} from "@/lib/money";
import {
  recordPaymentSchema,
  type RecordPaymentInput,
} from "@/lib/validation/payments";
import type { PaymentSummary } from "@/server/payments/service";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  advance: "Advance",
  balance: "Balance",
  security_deposit: "Security deposit",
  refund: "Refund",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const REFERENCE_REQUIRED_METHODS = new Set(["upi", "card", "bank_transfer"]);

/** The most this booking could still have refunded — collected rent/
 * deposit minus whatever's already been returned. Mirrors the same cap
 * `recordPayment()` enforces server-side, so the hint here is never just
 * decorative: submitting more than this is guaranteed to be rejected. */
function refundableAmount(summary: PaymentSummary): string {
  const collected = addMoney(
    addMoney(summary.advancePaid, summary.balancePaid),
    summary.depositCollected,
  );
  const alreadyReturned = addMoney(summary.refunded, summary.depositReleased);
  return subtractMoneyNonNegative(collected, alreadyReturned);
}

/** A short, contextual hint next to the amount field so staff don't have
 * to go compute "how much is still owed" themselves — reads straight off
 * the already-derived `PaymentSummary`, never a separate calculation. */
function outstandingHint(
  type: RecordPaymentInput["paymentType"],
  summary: PaymentSummary,
): string | null {
  switch (type) {
    case "advance":
    case "balance":
      return compareMoney(summary.rentBalance, ZERO_MONEY) > 0
        ? `Rent balance: ${formatMoney(summary.rentBalance)}`
        : "Rent is fully paid.";
    case "security_deposit":
      return compareMoney(summary.depositBalance, ZERO_MONEY) > 0
        ? `Deposit due: ${formatMoney(summary.depositBalance)}`
        : "Deposit is fully collected.";
    case "refund": {
      const refundable = refundableAmount(summary);
      return compareMoney(refundable, ZERO_MONEY) > 0
        ? `Refundable up to ${formatMoney(refundable)}`
        : "Nothing has been collected to refund yet.";
    }
    default:
      return null;
  }
}

export function RecordPaymentDialog({
  bookingId,
  summary,
  canRefund,
}: {
  bookingId: string;
  summary: PaymentSummary;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const paymentTypeOptions = useMemo(
    () =>
      (["advance", "balance", "security_deposit", "refund"] as const).filter(
        (type) => type !== "refund" || canRefund,
      ),
    [canRefund],
  );

  const form = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: "",
      paymentType: "advance",
      paymentMethod: "cash",
      referenceNumber: "",
      note: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const paymentType = useWatch({ control: form.control, name: "paymentType" });
  const paymentMethod = useWatch({
    control: form.control,
    name: "paymentMethod",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/bookings/${bookingId}/payments`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "amount" ||
            fieldError.field === "paymentType" ||
            fieldError.field === "paymentMethod" ||
            fieldError.field === "referenceNumber" ||
            fieldError.field === "note"
          ) {
            form.setError(
              fieldError.field as
                | "amount"
                | "paymentType"
                | "paymentMethod"
                | "referenceNumber"
                | "note",
              { message: fieldError.message },
            );
            mappedToField = true;
          }
        }
        if (mappedToField) {
          return;
        }
      }

      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    }
  });

  const isSubmitting = form.formState.isSubmitting;
  const referenceRequired = REFERENCE_REQUIRED_METHODS.has(paymentMethod);
  const hint = outstandingHint(paymentType, summary);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormError(null);
          form.reset();
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <BanknoteIcon />
        Record payment
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Adds one entry to this booking&rsquo;s payment ledger.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 overflow-hidden min-h-0"
          id="record-payment-form"
        >
          <DialogBody>
          {formError ? (
            <Alert
              variant="destructive"
              className="border-destructive/25 bg-destructive/5"
            >
              <AlertCircleIcon />
              <AlertDescription className="text-destructive font-medium">
                {formError}
              </AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.paymentType}>
                <FieldLabel>Type</FieldLabel>
                <Controller
                  control={form.control}
                  name="paymentType"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a type">
                          {(value: string) =>
                            PAYMENT_TYPE_LABELS[value] ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {paymentTypeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {PAYMENT_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.paymentType]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.amount}>
                <FieldLabel htmlFor="payment-amount">Amount</FieldLabel>
                <Input
                  id="payment-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  autoFocus
                  disabled={isSubmitting}
                  aria-invalid={!!form.formState.errors.amount}
                  {...form.register("amount")}
                />
                <FieldError errors={[form.formState.errors.amount]} />
                {!form.formState.errors.amount && hint ? (
                  <p className="text-muted-foreground text-xs">{hint}</p>
                ) : null}
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.paymentMethod}>
                <FieldLabel>Method</FieldLabel>
                <Controller
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a method">
                          {(value: string) =>
                            PAYMENT_METHOD_LABELS[value] ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.paymentMethod]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.referenceNumber}>
                <FieldLabel htmlFor="payment-reference">
                  Reference{referenceRequired ? "" : " (optional)"}
                </FieldLabel>
                <Input
                  id="payment-reference"
                  placeholder="UTR / transaction id"
                  disabled={isSubmitting}
                  aria-invalid={!!form.formState.errors.referenceNumber}
                  {...form.register("referenceNumber")}
                />
                <FieldError
                  errors={[form.formState.errors.referenceNumber]}
                />
              </Field>
            </div>

            <Field data-invalid={!!form.formState.errors.note}>
              <FieldLabel htmlFor="payment-note">Note (optional)</FieldLabel>
              <Textarea
                id="payment-note"
                rows={2}
                disabled={isSubmitting}
                {...form.register("note")}
              />
              <FieldError errors={[form.formState.errors.note]} />
            </Field>
          </FieldGroup>
          </DialogBody>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="record-payment-form"
            disabled={isSubmitting}
            className="min-w-32"
          >
            {isSubmitting ? (
              <>
                <Spinner />
                Recording…
              </>
            ) : (
              "Record payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
