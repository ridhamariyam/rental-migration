"use client";

import { useEffect, useState } from "react";
import {
  Controller,
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormTrigger,
} from "react-hook-form";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  PackageIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmActionButton } from "@/components/tenant/confirm-action-button";
import { ItemPicker } from "@/components/tenant/item-picker";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatDate, formatMoney, toDateString } from "@/lib/format";
import type { CreateBookingInput } from "@/lib/validation/bookings";
import type { VariationSearchResult } from "@/server/variations/service";

/** Midnight today, in the browser's local calendar — a fresh booking's
 * pickup date can never be backdated (mirrors `pickupNotInPastRefinement`
 * in the create-booking/quote schemas). */
function startOfToday(): Date {
  return new Date(`${toDateString(new Date())}T00:00:00`);
}

export type BookingItemQuote = {
  totalDays: number;
  quantity: number;
  rentAmount: string;
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

/**
 * One "cart line" in the booking form — its own item, dates, quantity
 * and deposit, with a live availability/price preview. Discount/additional
 * cost/advance are order-level now (see `BookingForm`), not per line.
 * Quote state is reported up to `BookingForm` (via `onQuoteChange`, keyed
 * by the field-array row's own stable id) so the order summary panel can
 * add every line into one reviewable total instead of showing a separate
 * price card per row.
 *
 * A line renders in one of two states: open, which is the fields; or, once
 * it has an item and a price, collapsed to a one-line summary with Edit
 * and Remove. Only one line is open at a time — a cart of four items was
 * otherwise four identical open forms stacked inside two nested boxes.
 */
export function BookingItemRow({
  index,
  itemKey,
  control,
  register,
  setValue,
  trigger,
  errors,
  selectedItem,
  onSelectItem,
  canRemove,
  onRemove,
  disabled,
  onQuoteChange,
  expanded,
  onEdit,
}: {
  index: number;
  itemKey: string;
  control: Control<CreateBookingInput>;
  register: UseFormRegister<CreateBookingInput>;
  setValue?: UseFormSetValue<CreateBookingInput>;
  trigger: UseFormTrigger<CreateBookingInput>;
  errors?: {
    barcode?: { message?: string };
    fromDate?: { message?: string };
    toDate?: { message?: string };
    quantity?: { message?: string };
  };
  selectedItem: VariationSearchResult | null;
  onSelectItem: (item: VariationSearchResult | null) => void;
  canRemove: boolean;
  onRemove: () => void;
  disabled?: boolean;
  onQuoteChange: (key: string, quote: BookingItemQuote | null) => void;
  /** Whether this line is the one being edited. A line that is done
   * collapses to a summary so the form is a list of what has been added,
   * not a stack of identical open forms. */
  expanded: boolean;
  onEdit: () => void;
}) {
  const [quote, setQuote] = useState<BookingItemQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const fromDate = useWatch({ control, name: `items.${index}.fromDate` });
  const toDate = useWatch({ control, name: `items.${index}.toDate` });
  const quantity = useWatch({ control, name: `items.${index}.quantity` });
  const selectedItemId = selectedItem?.id;

  useEffect(() => {
    const timeout = setTimeout(async () => {
      const parsedQuantity = Number(quantity);
      const quantityValid =
        Number.isInteger(parsedQuantity) &&
        parsedQuantity >= 1 &&
        parsedQuantity <= 20;

      // An out-of-range quantity already has its own inline field error
      // (`errors?.quantity`, from `bookingQuantitySchema`) — skip firing
      // the quote request at all rather than also surfacing a second,
      // less specific "Validation failed" alert from the API's own 422.
      if (!selectedItemId || !fromDate || !toDate || !quantityValid) {
        setQuote(null);
        setQuoteError(null);
        onQuoteChange(itemKey, null);
        return;
      }

      setQuoteLoading(true);
      try {
        const result = await apiRequest<BookingItemQuote>(
          "/api/bookings/quote",
          {
            method: "POST",
            body: JSON.stringify({
              variationId: selectedItemId,
              fromDate,
              toDate,
              quantity: quantity || "1",
            }),
          },
        );
        setQuote(result);
        setQuoteError(null);
        onQuoteChange(itemKey, result);
      } catch (error) {
        setQuote(null);
        onQuoteChange(itemKey, null);
        setQuoteError(
          error instanceof ApiClientError
            ? error.message
            : "Could not price this item.",
        );
      } finally {
        setQuoteLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId, fromDate, toDate, quantity, itemKey]);

  // Collapsed: what was added, in one line. No border of its own — the
  // Items panel around it is the only box this needs.
  if (!expanded && selectedItem) {
    return (
      <div className="flex items-center gap-3 py-3">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <PackageIcon className="size-4" aria-hidden="true" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-medium">
            {selectedItem.productName}
            {selectedItem.color || selectedItem.size ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                —{" "}
                {[selectedItem.color, selectedItem.size]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            ) : null}
          </p>
          {/* Price first: the line truncates on a phone, and the amount is
              what someone is checking when they glance back at the cart. */}
          <p className="text-muted-foreground truncate text-xs">
            {quote ? `${formatMoney(quote.totalReceivable)} · ` : ""}
            {quantity && Number(quantity) > 1 ? `${quantity} × · ` : ""}
            {fromDate ? formatDate(fromDate) : "—"} →{" "}
            {toDate ? formatDate(toDate) : "—"}
          </p>
          {quote && !quote.available ? (
            <p className="text-destructive text-xs font-medium">
              {quote.reason}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onEdit}
          >
            <PencilIcon className="size-3.5" />
            Edit
          </Button>
          {canRemove ? (
            <ConfirmActionButton
              ariaLabel={`Remove ${selectedItem.productName}`}
              title="Remove this item from the booking?"
              description={`${selectedItem.productName} and its dates come off this order. Nothing has been saved yet, so it is only this line that goes.`}
              onConfirm={onRemove}
              disabled={disabled}
              icon={<Trash2Icon className="text-muted-foreground size-3.5" />}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Item {index + 1}
        </span>
        {canRemove ? (
          selectedItem ? (
            <ConfirmActionButton
              ariaLabel={`Remove item ${index + 1}`}
              title="Remove this item from the booking?"
              description={`${selectedItem.productName} and its dates come off this order.`}
              onConfirm={onRemove}
              disabled={disabled}
              icon={<Trash2Icon className="text-muted-foreground size-3.5" />}
            />
          ) : (
            /* An empty line has nothing to lose — asking would be noise. */
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove item ${index + 1}`}
              disabled={disabled}
              onClick={onRemove}
            >
              <Trash2Icon className="text-muted-foreground size-3.5" />
            </Button>
          )
        ) : null}
      </div>

      <Field data-invalid={!!errors?.barcode}>
        <ItemPicker
          value={selectedItem}
          onSelect={onSelectItem}
          disabled={disabled}
          invalid={!!errors?.barcode}
        />
        <FieldError errors={[errors?.barcode]} />
      </Field>

      <Field data-invalid={!!errors?.quantity}>
        <FieldLabel htmlFor={`quantity-item-${index}`}>
          Quantity
          {selectedItem ? (
            <span className="text-muted-foreground ml-1 font-normal">
              ({selectedItem.quantity} in stock)
            </span>
          ) : null}
        </FieldLabel>
        <Input
          id={`quantity-item-${index}`}
          inputMode="numeric"
          disabled={disabled}
          aria-invalid={!!errors?.quantity}
          {...register(`items.${index}.quantity`)}
        />
        <FieldError errors={[errors?.quantity]} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors?.fromDate}>
          <FieldLabel>Pickup date</FieldLabel>
          <Controller
            control={control}
            name={`items.${index}.fromDate`}
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  if (value && toDate && value > toDate && setValue) {
                    setValue(`items.${index}.toDate`, value, {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }
                  void trigger([
                    `items.${index}.fromDate`,
                    `items.${index}.toDate`,
                  ]);
                }}
                disabled={disabled}
                invalid={!!errors?.fromDate}
                disabledMatcher={{ before: startOfToday() }}
              />
            )}
          />
          <FieldError errors={[errors?.fromDate]} />
        </Field>

        <Field data-invalid={!!errors?.toDate}>
          <FieldLabel>Return date</FieldLabel>
          <Controller
            control={control}
            name={`items.${index}.toDate`}
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={(value) => {
                  field.onChange(value);
                  void trigger([
                    `items.${index}.fromDate`,
                    `items.${index}.toDate`,
                  ]);
                }}
                disabled={disabled}
                invalid={!!errors?.toDate}
                disabledMatcher={
                  fromDate
                    ? { before: new Date(`${fromDate}T00:00:00`) }
                    : undefined
                }
              />
            )}
          />
          <FieldError errors={[errors?.toDate]} />
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
            <Alert
              variant="destructive"
              className="border-destructive/25 bg-destructive/5"
            >
              <AlertCircleIcon />
              <AlertDescription className="text-destructive font-medium">
                {quoteError}
              </AlertDescription>
            </Alert>
          ) : quote ? (
            quote.available ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-primary w-fit"
                  >
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
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
