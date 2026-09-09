"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PackageCheckIcon, ShirtIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { compareMoney, ZERO_MONEY } from "@/lib/money";
import {
  bulkConfirmPickupSchema,
  type BulkConfirmPickupInput,
} from "@/lib/validation/booking-lifecycle";
import type { PaymentSummary } from "@/server/payments/service";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export type PickupEligibleItem = {
  itemId: string;
  label: string;
  barcode: string;
};

/** Hands over every remaining item of a multi-item order in one dialog —
 * each item still needs its own barcode scanned, but the balance/deposit
 * is collected once, matching the order's single shared ledger. */
export function BookingPickupAllDialog({
  bookingId,
  eligibleItems,
  summary,
  canRecordPayment,
}: {
  bookingId: string;
  eligibleItems: PickupEligibleItem[];
  summary: PaymentSummary;
  canRecordPayment: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<BulkConfirmPickupInput>({
    resolver: zodResolver(bulkConfirmPickupSchema),
    defaultValues: {
      items: eligibleItems.map((item) => ({ itemId: item.itemId, barcode: "" })),
      amountCollected: "",
      depositCollected: "",
      paymentMethod: "cash",
      paymentReference: "",
      allowPendingBalance: false,
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/bookings/${bookingId}/pickup`, {
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
          const match = fieldError.field.match(/^items\.(\d+)\.barcode$/);
          if (match) {
            form.setError(
              `items.${Number(match[1])}.barcode` as `items.${number}.barcode`,
              { message: fieldError.message },
            );
            mappedToField = true;
          } else if (fieldError.field === "paymentReference") {
            form.setError("paymentReference", { message: fieldError.message });
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
      <DialogTrigger render={<Button variant="accent" />}>
        <PackageCheckIcon />
        Confirm pickup ({eligibleItems.length} items)
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm pickup</DialogTitle>
          <DialogDescription>
            Scan each item&rsquo;s barcode to hand the whole order over the
            counter at once.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 overflow-hidden min-h-0"
          id="confirm-pickup-order-form"
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
              {eligibleItems.map((item, index) => (
                <Field
                  key={item.itemId}
                  data-invalid={!!form.formState.errors.items?.[index]?.barcode}
                >
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel
                      htmlFor={`pickup-barcode-${index}`}
                      className="flex min-w-0 items-center gap-1.5"
                    >
                      <ShirtIcon
                        className="text-muted-foreground size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </FieldLabel>
                    <button
                      type="button"
                      className="text-primary shrink-0 text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-50"
                      disabled={isSubmitting}
                      onClick={() =>
                        form.setValue(`items.${index}.barcode`, item.barcode, {
                          shouldValidate: true,
                        })
                      }
                    >
                      Autofill
                    </button>
                  </div>
                  <Input
                    id={`pickup-barcode-${index}`}
                    placeholder={item.barcode}
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.items?.[index]?.barcode}
                    {...form.register(`items.${index}.barcode`)}
                  />
                  <FieldError
                    errors={[form.formState.errors.items?.[index]?.barcode]}
                  />
                </Field>
              ))}

              {compareMoney(summary.outstanding, ZERO_MONEY) > 0 ? (
                <Alert className="border-amber-500/25 bg-amber-500/5">
                  <AlertCircleIcon className="text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-700 dark:text-amber-400">
                    {formatMoney(summary.outstanding)} is still outstanding for
                    this order. Collect it below, or defer it explicitly.
                  </AlertDescription>
                </Alert>
              ) : null}

              {canRecordPayment ? (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.amountCollected}>
                      <FieldLabel htmlFor="pickup-all-amount">
                        Balance collected (optional)
                      </FieldLabel>
                      <Input
                        id="pickup-all-amount"
                        inputMode="decimal"
                        placeholder="0.00"
                        disabled={isSubmitting}
                        {...form.register("amountCollected")}
                      />
                      <FieldError
                        errors={[form.formState.errors.amountCollected]}
                      />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.depositCollected}>
                      <FieldLabel htmlFor="pickup-all-deposit">
                        Deposit collected (optional)
                      </FieldLabel>
                      <Input
                        id="pickup-all-deposit"
                        inputMode="decimal"
                        placeholder="0.00"
                        disabled={isSubmitting}
                        {...form.register("depositCollected")}
                      />
                      <FieldError
                        errors={[form.formState.errors.depositCollected]}
                      />
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
                    </Field>
                    <Field data-invalid={!!form.formState.errors.paymentReference}>
                      <FieldLabel htmlFor="pickup-all-reference">
                        Reference (optional)
                      </FieldLabel>
                      <Input
                        id="pickup-all-reference"
                        disabled={isSubmitting}
                        {...form.register("paymentReference")}
                      />
                      <FieldError
                        errors={[form.formState.errors.paymentReference]}
                      />
                    </Field>
                  </div>
                </>
              ) : null}

              <Separator />

              <Controller
                control={form.control}
                name="allowPendingBalance"
                render={({ field }) => (
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="allow-pending-balance-all"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(!!checked)}
                      disabled={isSubmitting}
                    />
                    <div className="flex flex-col gap-0.5">
                      <Label
                        htmlFor="allow-pending-balance-all"
                        className="font-normal"
                      >
                        Let the customer take these items with an unpaid balance
                      </Label>
                      <span className="text-muted-foreground text-xs">
                        Without this, pickup is blocked while anything is
                        still outstanding.
                      </span>
                    </div>
                  </div>
                )}
              />
            </FieldGroup>
          </DialogBody>

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
              variant="accent"
              disabled={isSubmitting}
              className="min-w-36"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Confirming…
                </>
              ) : (
                `Confirm pickup (${eligibleItems.length})`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
