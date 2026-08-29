"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PackageOpenIcon } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { compareMoney, ZERO_MONEY } from "@/lib/money";
import {
  returnBookingSchema,
  type ReturnBookingInput,
} from "@/lib/validation/booking-lifecycle";
import type { PaymentSummary } from "@/server/payments/service";

const RETURN_CONDITION_LABELS: Record<string, string> = {
  good: "Good",
  minor_damage: "Minor damage",
  major_damage: "Major damage",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export function BookingReturnDialog({
  bookingId,
  expectedBarcode,
  summary,
}: {
  bookingId: string;
  expectedBarcode: string;
  summary: PaymentSummary;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ReturnBookingInput>({
    resolver: zodResolver(returnBookingSchema),
    defaultValues: {
      barcode: "",
      returnCondition: "good",
      damageCharge: "",
      damageNotes: "",
      cleaningRequired: true,
      maintenanceRequired: false,
      refundMethod: "cash",
      refundReference: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const returnCondition = useWatch({
    control: form.control,
    name: "returnCondition",
  });
  const isDamaged = returnCondition !== "good";

  useEffect(() => {
    if (returnCondition === "major_damage") {
      form.setValue("maintenanceRequired", true);
    }
    if (returnCondition === "good") {
      form.setValue("damageCharge", "");
      form.setValue("damageNotes", "");
    }
  }, [returnCondition, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/bookings/${bookingId}/return`, {
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
            fieldError.field === "barcode" ||
            fieldError.field === "damageCharge" ||
            fieldError.field === "refundReference"
          ) {
            form.setError(
              fieldError.field as "barcode" | "damageCharge" | "refundReference",
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
  const depositHeld = compareMoney(summary.depositHeld, ZERO_MONEY) > 0;

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
      <DialogTrigger render={<Button variant="outline" />}>
        <PackageOpenIcon />
        Return item
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return item</DialogTitle>
          <DialogDescription>
            Inspect the item and settle its security deposit.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 overflow-hidden min-h-0"
          id="return-booking-form"
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
              <Field data-invalid={!!form.formState.errors.barcode}>
                <FieldLabel htmlFor="return-barcode">
                  Scan barcode (optional)
                </FieldLabel>
                <Input
                  id="return-barcode"
                  autoFocus
                  placeholder={expectedBarcode}
                  disabled={isSubmitting}
                  aria-invalid={!!form.formState.errors.barcode}
                  {...form.register("barcode")}
                />
                <FieldError errors={[form.formState.errors.barcode]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.returnCondition}>
                <FieldLabel>Condition</FieldLabel>
                <Controller
                  control={form.control}
                  name="returnCondition"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a condition">
                          {(value: string) =>
                            RETURN_CONDITION_LABELS[value] ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RETURN_CONDITION_LABELS).map(
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

              {isDamaged ? (
                <>
                  <Field data-invalid={!!form.formState.errors.damageCharge}>
                    <FieldLabel htmlFor="damage-charge">
                      Damage charge
                    </FieldLabel>
                    <Input
                      id="damage-charge"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={isSubmitting}
                      aria-invalid={!!form.formState.errors.damageCharge}
                      {...form.register("damageCharge")}
                    />
                    <FieldError errors={[form.formState.errors.damageCharge]} />
                    {depositHeld ? (
                      <p className="text-muted-foreground text-xs">
                        Deposit held: {formatMoney(summary.depositHeld)} —
                        damage is deducted from this first.
                      </p>
                    ) : null}
                  </Field>

                  <Field data-invalid={!!form.formState.errors.damageNotes}>
                    <FieldLabel htmlFor="damage-notes">
                      Damage notes
                    </FieldLabel>
                    <Textarea
                      id="damage-notes"
                      rows={2}
                      disabled={isSubmitting}
                      {...form.register("damageNotes")}
                    />
                    <FieldError errors={[form.formState.errors.damageNotes]} />
                  </Field>
                </>
              ) : null}

              <Separator />

              <div className="flex flex-col gap-3">
                <Controller
                  control={form.control}
                  name="cleaningRequired"
                  render={({ field }) => (
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id="cleaning-required"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(!!checked)}
                        disabled={isSubmitting}
                      />
                      <Label htmlFor="cleaning-required" className="font-normal">
                        Needs cleaning before it&rsquo;s available again
                      </Label>
                    </div>
                  )}
                />
                <Controller
                  control={form.control}
                  name="maintenanceRequired"
                  render={({ field }) => (
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id="maintenance-required"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(!!checked)}
                        disabled={isSubmitting || returnCondition === "major_damage"}
                      />
                      <Label
                        htmlFor="maintenance-required"
                        className="font-normal"
                      >
                        Needs repair/maintenance
                        {returnCondition === "major_damage"
                          ? " (required for major damage)"
                          : ""}
                      </Label>
                    </div>
                  )}
                />
              </div>

              {depositHeld ? (
                <>
                  <Separator />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!form.formState.errors.refundMethod}>
                      <FieldLabel>Refund method</FieldLabel>
                      <Controller
                        control={form.control}
                        name="refundMethod"
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
                    <Field data-invalid={!!form.formState.errors.refundReference}>
                      <FieldLabel htmlFor="refund-reference">
                        Reference (optional)
                      </FieldLabel>
                      <Input
                        id="refund-reference"
                        disabled={isSubmitting}
                        {...form.register("refundReference")}
                      />
                      <FieldError
                        errors={[form.formState.errors.refundReference]}
                      />
                    </Field>
                  </div>
                </>
              ) : null}
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
              disabled={isSubmitting}
              className="min-w-36"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Returning…
                </>
              ) : (
                "Confirm return"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
