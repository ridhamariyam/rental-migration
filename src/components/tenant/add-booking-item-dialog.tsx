"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, CheckCircle2Icon, PlusIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ItemPicker } from "@/components/tenant/item-picker";
import { bookingItemSchema, type BookingItemInput } from "@/lib/validation/bookings";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney, toDateString } from "@/lib/format";
import { tenantPaths } from "@/lib/tenant-paths";
import type { VariationSearchResult } from "@/server/variations/service";

type ItemQuote = {
  totalDays: number;
  grossRent: string;
  securityDeposit: string;
  totalAmount: string;
  totalReceivable: string;
  available: boolean;
  reason: string | null;
  conflicts: string[];
};

const QUOTE_DEBOUNCE_MS = 400;

function startOfToday(): Date {
  return new Date(`${toDateString(new Date())}T00:00:00`);
}

function emptyValues(defaultFromDate?: string, defaultToDate?: string) {
  const today = toDateString(new Date());
  return {
    variationId: "",
    fromDate: defaultFromDate ?? today,
    toDate: defaultToDate ?? today,
    quantity: "1",
  };
}

/**
 * Adds one more line to an already-created order (e.g. the customer also
 * wants jewelry to go with the outfit they already booked) — a scaled-
 * down version of the create form's per-item card, since the order-level
 * discount/deposit/additional cost already agreed for this order aren't
 * re-asked here (see `addItemToBookingGroup`'s doc comment).
 */
export function AddBookingItemButton({
  bookingId,
  bookingNumber,
  defaultFromDate,
  defaultToDate,
}: {
  bookingId: string;
  bookingNumber: string;
  /** Pre-fill the new item's dates from the order's most recently added
   * item, so adding a matching accessory/second unit doesn't require
   * re-picking the same pickup/return dates by hand. Falls back to today
   * when the order has no items yet (or the caller doesn't have them
   * loaded, e.g. the edit page). */
  defaultFromDate?: string;
  defaultToDate?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon />
        Add another item
      </Button>
      <AddBookingItemDialog
        open={open}
        onOpenChange={setOpen}
        bookingId={bookingId}
        bookingNumber={bookingNumber}
        defaultFromDate={defaultFromDate}
        defaultToDate={defaultToDate}
      />
    </>
  );
}

function AddBookingItemDialog({
  open,
  onOpenChange,
  bookingId,
  bookingNumber,
  defaultFromDate,
  defaultToDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  bookingNumber: string;
  defaultFromDate?: string;
  defaultToDate?: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<VariationSearchResult | null>(null);
  const [quote, setQuote] = useState<ItemQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const form = useForm<BookingItemInput>({
    resolver: zodResolver(bookingItemSchema),
    defaultValues: emptyValues(defaultFromDate, defaultToDate),
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const fromDate = useWatch({ control: form.control, name: "fromDate" });
  const toDate = useWatch({ control: form.control, name: "toDate" });
  const quantity = useWatch({ control: form.control, name: "quantity" });
  const selectedItemId = selectedItem?.id;

  useEffect(() => {
    const timeout = setTimeout(async () => {
      const parsedQuantity = Number(quantity);
      const quantityValid =
        Number.isInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= 20;

      if (!selectedItemId || !fromDate || !toDate || !quantityValid) {
        setQuote(null);
        setQuoteError(null);
        return;
      }

      setQuoteLoading(true);
      try {
        const result = await apiRequest<ItemQuote>("/api/bookings/quote", {
          method: "POST",
          body: JSON.stringify({
            variationId: selectedItemId,
            fromDate,
            toDate,
            quantity: quantity || "1",
          }),
        });
        setQuote(result);
        setQuoteError(null);
      } catch (error) {
        setQuote(null);
        setQuoteError(
          error instanceof ApiClientError ? error.message : "Could not price this item.",
        );
      } finally {
        setQuoteLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [selectedItemId, fromDate, toDate, quantity]);

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/bookings/${bookingId}/items`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      onOpenChange(false);
      router.push(`${tenantPaths.bookings}/${bookingId}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        if (error.fieldErrors.some((fieldError) => fieldError.field === "barcode")) {
          form.setError("barcode", { message: error.fieldErrors[0].message });
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setFormError(null);
          setSelectedItem(null);
          setQuote(null);
          form.reset(emptyValues(defaultFromDate, defaultToDate));
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add another item</DialogTitle>
          <DialogDescription>
            Adds a new line to order {bookingNumber}, priced and checked for
            availability the same way a fresh booking would be.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-col flex-1 overflow-hidden min-h-0">
          <DialogBody>
            {formError ? (
              <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
                <AlertCircleIcon />
                <AlertDescription className="text-destructive font-medium">
                  {formError}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-4">
              <Field data-invalid={!!form.formState.errors.barcode}>
                <ItemPicker
                  value={selectedItem}
                  onSelect={(item) => {
                    setSelectedItem(item);
                    form.setValue("variationId", item?.id ?? "", {
                      shouldValidate: form.formState.isSubmitted,
                    });
                  }}
                  disabled={isSubmitting}
                  invalid={!!form.formState.errors.barcode}
                  autoFocus
                />
                <FieldError errors={[form.formState.errors.barcode]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.quantity}>
                <FieldLabel htmlFor="add-item-quantity">
                  Quantity
                  {selectedItem ? (
                    <span className="text-muted-foreground ml-1 font-normal">
                      ({selectedItem.quantity} in stock)
                    </span>
                  ) : null}
                </FieldLabel>
                <Input
                  id="add-item-quantity"
                  inputMode="numeric"
                  disabled={isSubmitting}
                  className="max-w-32"
                  aria-invalid={!!form.formState.errors.quantity}
                  {...form.register("quantity")}
                />
                <FieldError errors={[form.formState.errors.quantity]} />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        disabledMatcher={{ before: startOfToday() }}
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
                          fromDate ? { before: new Date(`${fromDate}T00:00:00`) } : undefined
                        }
                      />
                    )}
                  />
                  <FieldError errors={[form.formState.errors.toDate]} />
                </Field>
              </div>

              {selectedItem ? (
                <>
                  <Separator />
                  {quoteLoading ? (
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Spinner className="size-3.5" />
                      Checking…
                    </div>
                  ) : quoteError ? (
                    <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
                      <AlertCircleIcon />
                      <AlertDescription className="text-destructive font-medium">
                        {quoteError}
                      </AlertDescription>
                    </Alert>
                  ) : quote ? (
                    quote.available ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="secondary" className="bg-primary/10 text-primary w-fit">
                            <CheckCircle2Icon className="size-3.5" />
                            Available
                          </Badge>
                          <span className="text-sm font-medium">
                            {formatMoney(quote.totalReceivable)}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          Rent {formatMoney(quote.totalAmount)}
                          {Number(quote.securityDeposit) > 0
                            ? ` + ${formatMoney(quote.securityDeposit)} deposit`
                            : ""}
                          {" · "}
                          {quote.totalDays} day{quote.totalDays === 1 ? "" : "s"}
                        </p>
                      </div>
                    ) : (
                      <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
                        <AlertCircleIcon />
                        <AlertDescription className="text-destructive font-medium">
                          {quote.reason}
                          {quote.conflicts.length > 0
                            ? ` (conflicts with ${quote.conflicts.join(", ")})`
                            : ""}
                        </AlertDescription>
                      </Alert>
                    )
                  ) : null}
                </>
              ) : null}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedItem || !(quote && quote.available)}
              className="min-w-28"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Adding…
                </>
              ) : (
                "Add item"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
