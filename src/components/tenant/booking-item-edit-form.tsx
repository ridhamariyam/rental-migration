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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  updateBookingItemSchema,
  type UpdateBookingItemInput,
} from "@/lib/validation/bookings";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { BookingItemDetail } from "@/server/bookings/service";

type QuoteResponse = {
  totalDays: number;
  grossRent: string;
  totalAmount: string;
  available: boolean;
  reason: string | null;
  conflicts: string[];
};

const QUOTE_DEBOUNCE_MS = 400;

/** Editing one item's dates/quantity — the customer, item/variation,
 * discount and order-level adjustments are all fixed once created (see
 * `booking-edit-form.tsx` for the order's own additionalCost/notes
 * fields, edited separately). */
export function BookingItemEditForm({
  bookingId,
  item,
}: {
  bookingId: string;
  item: BookingItemDetail;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const form = useForm<UpdateBookingItemInput>({
    resolver: zodResolver(updateBookingItemSchema),
    defaultValues: {
      fromDate: item.fromDate,
      toDate: item.toDate,
      quantity: String(item.quantity),
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const fromDate = form.watch("fromDate");
  const toDate = form.watch("toDate");
  const quantity = form.watch("quantity");

  useEffect(() => {
    if (!fromDate || !toDate) return;

    const parsedQuantity = Number(quantity);
    const quantityValid =
      Number.isInteger(parsedQuantity) &&
      parsedQuantity >= 1 &&
      parsedQuantity <= item.quantity;
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
            variationId: item.variationId,
            fromDate,
            toDate,
            quantity,
            excludeBookingId: item.id,
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
  }, [fromDate, toDate, quantity, item.quantity, item.id, item.variationId]);

  // The schema's own `bookingQuantitySchema` only knows a static 1..20
  // range — "can't exceed what's currently booked" depends on this
  // specific item's `item.quantity`, a runtime value, so it's enforced
  // here instead of in the zod schema (server still re-checks this on
  // submit regardless).
  useEffect(() => {
    const parsedQuantity = Number(quantity);
    if (Number.isInteger(parsedQuantity) && parsedQuantity > item.quantity) {
      form.setError("quantity", {
        type: "max",
        message: `Can only be reduced — ${item.quantity} currently booked`,
      });
    } else if (form.formState.errors.quantity?.type === "max") {
      form.clearErrors("quantity");
    }
  }, [quantity, item.quantity, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/bookings/${bookingId}/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      router.push(`${tenantPaths.bookings}/${bookingId}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "fromDate" ||
            fieldError.field === "toDate" ||
            fieldError.field === "quantity"
          ) {
            form.setError(
              fieldError.field as "fromDate" | "toDate" | "quantity",
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

        <Field data-invalid={!!form.formState.errors.quantity}>
          <FieldLabel htmlFor="quantity">
            Quantity
            <span className="text-muted-foreground ml-1 font-normal">
              ({item.quantity} booked)
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
            Can only be reduced here — cancel this item instead to remove it
            entirely.
          </p>
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
          New rent:{" "}
          <span className="text-foreground font-medium">
            {formatMoney(quote.grossRent)}
          </span>
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push(`${tenantPaths.bookings}/${bookingId}`)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            Boolean(quote && !quote.available) ||
            !!form.formState.errors.quantity
          }
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
