"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  updateBookingSchema,
  type UpdateBookingInput,
} from "@/lib/validation/bookings";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { divideMoneyByInteger } from "@/lib/money";
import type { BookingListItem } from "@/server/bookings/service";

type QuoteResponse = {
  totalDays: number;
  grossRent: string;
  discountAmount: string;
  additionalCost: string;
  totalAmount: string;
  securityDeposit: string;
  totalReceivable: string;
  available: boolean;
  reason: string | null;
  conflicts: string[];
};

const QUOTE_DEBOUNCE_MS = 400;

export function BookingEditForm({
  booking,
}: {
  booking: BookingListItem;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const form = useForm<UpdateBookingInput>({
    resolver: zodResolver(updateBookingSchema),
    defaultValues: {
      fromDate: booking.fromDate,
      toDate: booking.toDate,
      quantity: String(booking.quantity),
      additionalCost: booking.additionalCost,
      additionalCostReason: booking.additionalCostReason ?? "",
      notes: booking.notes ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const fromDate = form.watch("fromDate");
  const toDate = form.watch("toDate");
  const quantity = form.watch("quantity");
  const additionalCost = form.watch("additionalCost");
  const extraCharged = Number(additionalCost || "0") > 0;

  useEffect(() => {
    if (!fromDate || !toDate) return;

    const parsedQuantity = Number(quantity);
    const quantityValid =
      Number.isInteger(parsedQuantity) &&
      parsedQuantity >= 1 &&
      parsedQuantity <= booking.quantity;
    if (!quantityValid) {
      setQuote(null);
      return;
    }

    setQuoteLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const result = await apiRequest<QuoteResponse>("/api/bookings/quote", {
          method: "POST",
          body: JSON.stringify({
            variationId: booking.variationId,
            fromDate,
            toDate,
            // The discount is frozen from creation — always re-quote with
            // the booking's own existing value (the server itself clamps
            // it down if a smaller quantity here would leave it exceeding
            // the new, smaller rent). Quantity and additional cost reflect
            // whatever this form currently has, so the preview matches
            // what submitting will actually save.
            discountAmount: booking.discountAmount,
            quantity,
            additionalCost: additionalCost || "0",
            securityDeposit: divideMoneyByInteger(
              booking.securityDeposit,
              Math.max(1, booking.quantity),
            ),
            excludeBookingId: booking.id,
          }),
        });
        setQuote(result);
        setQuoteError(null);
      } catch (error) {
        setQuote(null);
        setQuoteError(
          error instanceof ApiClientError
            ? error.message
            : "Could not price this rental. Please try again.",
        );
      } finally {
        setQuoteLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [
    fromDate,
    toDate,
    quantity,
    additionalCost,
    booking.discountAmount,
    booking.securityDeposit,
    booking.quantity,
    booking.id,
    booking.variationId,
  ]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      router.push(`${tenantPaths.bookings}/${booking.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "fromDate" ||
            fieldError.field === "toDate" ||
            fieldError.field === "quantity" ||
            fieldError.field === "additionalCost" ||
            fieldError.field === "additionalCostReason"
          ) {
            form.setError(
              fieldError.field as
                | "fromDate"
                | "toDate"
                | "quantity"
                | "additionalCost"
                | "additionalCostReason",
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

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.fromDate}>
            <FieldLabel>Pickup date</FieldLabel>
            <Controller
              control={form.control}
              name="fromDate"
              render={({ field }) => (
                <DatePicker
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    if (value && toDate && value > toDate) {
                      form.setValue("toDate", value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      });
                    }
                    void form.trigger(["fromDate", "toDate"]);
                  }}
                  disabled={isSubmitting}
                  invalid={!!form.formState.errors.fromDate}
                />
              )}
            />
            <FieldError errors={[form.formState.errors.fromDate]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.toDate}>
            <FieldLabel>Return date</FieldLabel>
            <Controller
              control={form.control}
              name="toDate"
              render={({ field }) => (
                <DatePicker
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    void form.trigger(["fromDate", "toDate"]);
                  }}
                  disabled={isSubmitting}
                  invalid={!!form.formState.errors.toDate}
                  disabledMatcher={
                    fromDate
                      ? { before: new Date(`${fromDate}T00:00:00`) }
                      : undefined
                  }
                />
              )}
            />
            <FieldError errors={[form.formState.errors.toDate]} />
          </Field>
        </div>

        {booking.discountAmount &&
        Number(booking.discountAmount) > 0 ? (
          <p className="text-muted-foreground text-xs">
            Discount of {formatMoney(booking.discountAmount)} was applied when
            this booking was created and can&rsquo;t be changed here.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.quantity}>
            <FieldLabel htmlFor="quantity">
              Quantity
              <span className="text-muted-foreground ml-1 font-normal">
                ({booking.quantity} booked)
              </span>
            </FieldLabel>
            <Input
              id="quantity"
              inputMode="numeric"
              disabled={isSubmitting}
              aria-invalid={!!form.formState.errors.quantity}
              {...form.register("quantity")}
            />
            <FieldError errors={[form.formState.errors.quantity]} />
            <p className="text-muted-foreground text-xs">
              Can only be reduced here — cancel this item instead to remove
              it entirely.
            </p>
          </Field>

          <Field data-invalid={!!form.formState.errors.additionalCost}>
            <FieldLabel htmlFor="additionalCost">
              Additional cost (optional)
            </FieldLabel>
            <Input
              id="additionalCost"
              inputMode="decimal"
              placeholder="0.00"
              disabled={isSubmitting}
              aria-invalid={!!form.formState.errors.additionalCost}
              {...form.register("additionalCost")}
            />
            <FieldError errors={[form.formState.errors.additionalCost]} />
          </Field>
        </div>

        <Field data-invalid={!!form.formState.errors.additionalCostReason}>
          <FieldLabel htmlFor="additionalCostReason">
            Reason{extraCharged ? "" : " (optional)"}
          </FieldLabel>
          <Input
            id="additionalCostReason"
            placeholder="Alteration, delivery, late fee…"
            disabled={isSubmitting}
            aria-invalid={!!form.formState.errors.additionalCostReason}
            {...form.register("additionalCostReason")}
          />
          <FieldError errors={[form.formState.errors.additionalCostReason]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.notes}>
          <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
          <Textarea
            id="notes"
            rows={3}
            disabled={isSubmitting}
            {...form.register("notes")}
          />
          <FieldError errors={[form.formState.errors.notes]} />
        </Field>
      </FieldGroup>

      {quoteLoading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-3.5" />
          Re-checking availability & price…
        </p>
      ) : quoteError ? (
        <Alert
          variant="destructive"
          className="border-destructive/25 bg-destructive/5"
        >
          <AlertCircleIcon />
          <AlertDescription className="text-destructive font-medium">
            {quoteError}
          </AlertDescription>
        </Alert>
      ) : quote && !quote.available ? (
        <Alert
          variant="destructive"
          className="border-destructive/25 bg-destructive/5"
        >
          <AlertCircleIcon />
          <AlertDescription className="text-destructive font-medium">
            {quote.reason}
            {quote.conflicts.length > 0
              ? ` (conflicts with ${quote.conflicts.join(", ")})`
              : ""}
          </AlertDescription>
        </Alert>
      ) : quote ? (
        <p className="text-muted-foreground text-sm">
          New total:{" "}
          <span className="text-foreground font-medium">
            {formatMoney(quote.totalAmount)}
          </span>{" "}
          rent + {formatMoney(quote.securityDeposit)} deposit ={" "}
          <span className="text-foreground font-medium">
            {formatMoney(quote.totalReceivable)}
          </span>
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push(`${tenantPaths.bookings}/${booking.id}`)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || Boolean(quote && !quote.available)}
          className="min-w-32"
        >
          {isSubmitting ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
