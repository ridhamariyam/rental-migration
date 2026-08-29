"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PlusIcon, ReceiptTextIcon, ShieldCheckIcon, TagIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  CustomerPicker,
  type PickedCustomer,
} from "@/components/tenant/customer-picker";
import {
  BookingItemRow,
  type BookingItemQuote,
} from "@/components/tenant/booking-item-row";
import {
  createBookingSchema,
  MAX_TOTAL_BOOKING_UNITS,
  type CreateBookingInput,
} from "@/lib/validation/bookings";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney, toDateString } from "@/lib/format";
import { avatarGradient, initialsFor, staffAvatarSrc } from "@/lib/tenant-avatar";
import type { VariationSearchResult } from "@/server/variations/service";

const SELF = "self";

function todayIso(): string {
  return toDateString(new Date());
}

function emptyItem(canDiscount: boolean) {
  return {
    variationId: "",
    fromDate: todayIso(),
    toDate: todayIso(),
    discountAmount: canDiscount ? "0.00" : undefined,
    quantity: "1",
  };
}

/**
 * Booking creation — a customer often rents several items in one visit (an
 * outfit plus accessories for the same event), so this is a small "cart":
 * one customer, one or more item lines, each with its own item/dates/
 * discount and its own live availability + price check. Submitting posts
 * every line in a single request (`createBookingGroup`, atomic server-side)
 * and returns one `bookings` row per line, linked by a shared
 * `bookingGroupId`.
 */
export function BookingForm({
  canDiscount,
  staffOptions = [],
}: {
  canDiscount: boolean;
  /** Non-empty only for an `admin` actor (see `NewBookingPage`) — every
   * other role's bookings are always attributed to themselves, so there's
   * nothing to pick and this field never renders for them. */
  staffOptions?: { id: string; firstName: string; lastName: string }[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] =
    useState<PickedCustomer | null>(null);
  const [selectedItems, setSelectedItems] = useState<
    Record<string, VariationSearchResult | null>
  >({});
  const [quotes, setQuotes] = useState<Record<string, BookingItemQuote | null>>(
    {},
  );

  const form = useForm<CreateBookingInput>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: {
      customerId: "",
      items: [emptyItem(canDiscount)],
      notes: "",
      handledById: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Only read for its `quantity` (to scale each line's total in the
  // summary panel below) — everything else about a line still flows
  // through `selectedItems`/`quotes`, set imperatively by `BookingItemRow`.
  const watchedItems = useWatch({ control: form.control, name: "items" });

  useEffect(() => {
    form.setValue("customerId", selectedCustomer?.id ?? "", {
      shouldValidate: form.formState.isSubmitted,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer]);

  function handleSelectItem(
    key: string,
    index: number,
    item: VariationSearchResult | null,
  ) {
    setSelectedItems((prev) => ({ ...prev, [key]: item }));
    form.setValue(`items.${index}.variationId`, item?.id ?? "", {
      shouldValidate: form.formState.isSubmitted,
    });
    setFormError(null);
  }

  function handleQuoteChange(key: string, quote: BookingItemQuote | null) {
    setQuotes((prev) => ({ ...prev, [key]: quote }));
  }

  function handleAddItem() {
    append(emptyItem(canDiscount));
  }

  function handleRemoveItem(index: number, key: string) {
    remove(index);
    setSelectedItems((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setQuotes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const allItemsChosen = fields.every((field) => selectedItems[field.id]);
  const allQuotesReady = fields.every((field) => quotes[field.id]);
  const allAvailable = fields.every((field) => quotes[field.id]?.available);
  const totalUnits = fields.reduce((sum, _field, index) => {
    return sum + Math.max(1, Number(watchedItems?.[index]?.quantity) || 1);
  }, 0);
  const exceedsUnitCap = totalUnits > MAX_TOTAL_BOOKING_UNITS;
  const canSubmit =
    Boolean(selectedCustomer) &&
    fields.length > 0 &&
    allItemsChosen &&
    allQuotesReady &&
    allAvailable &&
    !exceedsUnitCap;

  // The current row(s) must be a real, available line item before another
  // empty one is added \u2014 otherwise it's easy to end up with several
  // half-filled rows and no clear signal about which one is blocking submit.
  const currentItemsComplete = allItemsChosen && allQuotesReady && allAvailable;
  const atItemLimit = fields.length >= 20;
  const canAddItem = currentItemsComplete && !atItemLimit;

  const grossRentCents = fields.reduce((sum, field, index) => {
    const quote = quotes[field.id];
    const quantity = Math.max(1, Number(watchedItems?.[index]?.quantity) || 1);
    return quote?.available
      ? sum + Math.round(Number(quote.grossRent) * 100) * quantity
      : sum;
  }, 0);

  const discountCents = fields.reduce((sum, field, index) => {
    const quote = quotes[field.id];
    const quantity = Math.max(1, Number(watchedItems?.[index]?.quantity) || 1);
    return quote?.available
      ? sum + Math.round(Number(quote.discountAmount) * 100) * quantity
      : sum;
  }, 0);

  const netRentCents = fields.reduce((sum, field, index) => {
    const quote = quotes[field.id];
    const quantity = Math.max(1, Number(watchedItems?.[index]?.quantity) || 1);
    return quote?.available
      ? sum + Math.round(Number(quote.totalAmount) * 100) * quantity
      : sum;
  }, 0);

  const securityDepositCents = fields.reduce((sum, field, index) => {
    const quote = quotes[field.id];
    const quantity = Math.max(1, Number(watchedItems?.[index]?.quantity) || 1);
    return quote?.available
      ? sum + Math.round(Number(quote.securityDeposit) * 100) * quantity
      : sum;
  }, 0);

  const grandTotalCents = netRentCents + securityDepositCents;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    if (!selectedCustomer) {
      setFormError("Choose a customer to continue.");
      return;
    }

    if (!allItemsChosen) {
      setFormError("Choose an item for every row, or remove the empty one.");
      return;
    }

    try {
      const created = await apiRequest<{ id: string }[]>("/api/bookings", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const first = created[0];
      const suffix = created.length > 1 ? `&count=${created.length}` : "";
      router.push(`${tenantPaths.bookings}/${first.id}?created=1${suffix}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        if (
          error.fieldErrors.some(
            (fieldError) => fieldError.field === "customerId",
          )
        ) {
          form.setError("customerId", {
            message: error.fieldErrors[0].message,
          });
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
  const itemErrors = form.formState.errors.items;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid grid-cols-1 gap-4 lg:grid-cols-3"
    >
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Booking details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-5">
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
              <Field data-invalid={!!form.formState.errors.customerId}>
                <FieldLabel>Customer</FieldLabel>
                <CustomerPicker
                  value={selectedCustomer}
                  onSelect={setSelectedCustomer}
                  disabled={isSubmitting}
                  invalid={!!form.formState.errors.customerId}
                />
                <FieldError errors={[form.formState.errors.customerId]} />
              </Field>

              <div className="flex flex-col gap-3">
                <FieldLabel>Items</FieldLabel>
                {fields.map((field, index) => (
                  <BookingItemRow
                    key={field.id}
                    index={index}
                    itemKey={field.id}
                    control={form.control}
                    register={form.register}
                    setValue={form.setValue}
                    trigger={form.trigger}
                    errors={itemErrors?.[index]}
                    selectedItem={selectedItems[field.id] ?? null}
                    onSelectItem={(item) =>
                      handleSelectItem(field.id, index, item)
                    }
                    canDiscount={canDiscount}
                    canRemove={fields.length > 1}
                    onRemove={() => handleRemoveItem(index, field.id)}
                    disabled={isSubmitting}
                    onQuoteChange={handleQuoteChange}
                  />
                ))}

                <Button
                  type="button"
                  variant="outline"
                  className="border-muted-foreground/25 hover:border-muted-foreground/40 hover:bg-muted/50 w-full justify-center border-dashed disabled:opacity-50"
                  disabled={isSubmitting || !canAddItem}
                  onClick={handleAddItem}
                >
                  <PlusIcon />
                  Add another item
                </Button>
                {!currentItemsComplete && !atItemLimit ? (
                  <p className="text-muted-foreground -mt-1 text-xs">
                    Choose an available item for every row above to add
                    another.
                  </p>
                ) : atItemLimit ? (
                  <p className="text-muted-foreground -mt-1 text-xs">
                    A single booking can have at most 20 items.
                  </p>
                ) : null}
                {exceedsUnitCap ? (
                  <Alert
                    variant="destructive"
                    className="border-destructive/25 bg-destructive/5"
                  >
                    <AlertCircleIcon />
                    <AlertDescription className="text-destructive font-medium">
                      This order requests {totalUnits} units in total —
                      reduce the quantities so the total is at most{" "}
                      {MAX_TOTAL_BOOKING_UNITS}.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>

              {staffOptions.length > 0 ? (
                <Field data-invalid={!!form.formState.errors.handledById}>
                  <FieldLabel htmlFor="handledById">
                    Handled by (optional)
                  </FieldLabel>
                  <Controller
                    control={form.control}
                    name="handledById"
                    render={({ field }) => (
                      <Select
                        value={field.value ? field.value : SELF}
                        onValueChange={(next) =>
                          field.onChange(next === SELF ? "" : next)
                        }
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="handledById" className="w-full">
                          <SelectValue placeholder="Assign to yourself">
                            {(value: string) => {
                              if (value === SELF || !value) {
                                return "Assign to yourself";
                              }
                              const staff = staffOptions.find(
                                (item) => item.id === value,
                              );
                              if (!staff) return "Assign to yourself";
                              const name =
                                `${staff.firstName} ${staff.lastName}`.trim();
                              return (
                                <span className="flex min-w-0 items-center gap-2">
                                  <Avatar className="size-5 shrink-0">
                                    <AvatarImage
                                      src={staffAvatarSrc(name)}
                                      alt={name}
                                    />
                                    <AvatarFallback
                                      className="!text-white text-[10px] font-semibold"
                                      style={{
                                        backgroundImage: avatarGradient(name),
                                      }}
                                    >
                                      {initialsFor(name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate">{name}</span>
                                </span>
                              );
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectItem value={SELF}>
                            Assign to yourself
                          </SelectItem>
                          {staffOptions.map((staff) => {
                            const name =
                              `${staff.firstName} ${staff.lastName}`.trim();
                            return (
                              <SelectItem key={staff.id} value={staff.id}>
                                <span className="flex min-w-0 items-center gap-2">
                                  <Avatar className="size-5 shrink-0">
                                    <AvatarImage
                                      src={staffAvatarSrc(name)}
                                      alt={name}
                                    />
                                    <AvatarFallback
                                      className="!text-white text-[10px] font-semibold"
                                      style={{
                                        backgroundImage: avatarGradient(name),
                                      }}
                                    >
                                      {initialsFor(name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate">{name}</span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.handledById]} />
                </Field>
              ) : null}

              <Field data-invalid={!!form.formState.errors.notes}>
                <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder="Anything worth remembering about this booking…"
                  disabled={isSubmitting}
                  {...form.register("notes")}
                />
                <FieldError errors={[form.formState.errors.notes]} />
              </Field>
            </FieldGroup>

            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => router.push(tenantPaths.bookings)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !canSubmit}
                className="min-w-40"
              >
                {isSubmitting ? (
                  <>
                    <Spinner />
                    Creating…
                  </>
                ) : totalUnits > 1 ? (
                  `Create ${totalUnits} bookings`
                ) : (
                  "Create booking"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="border-b border-border/60 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ReceiptTextIcon className="size-4 text-primary" aria-hidden="true" />
            Order summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Items ({fields.length})
            </span>
            {fields.map((field, index) => {
              const item = selectedItems[field.id];
              const quote = quotes[field.id];
              const quantity = Math.max(
                1,
                Number(watchedItems?.[index]?.quantity) || 1,
              );
              return (
                <div
                  key={field.id}
                  className="flex flex-col gap-1 rounded-lg bg-muted/40 p-2.5 border border-border/40 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground truncate">
                      {item ? item.productName : `Item ${index + 1}`}
                      {quantity > 1 ? ` × ${quantity}` : ""}
                    </span>
                    <span className="shrink-0 font-semibold text-foreground">
                      {quote
                        ? quote.available
                          ? formatMoney(
                              (
                                Number(quote.totalReceivable) * quantity
                              ).toFixed(2),
                            )
                          : "Unavailable"
                        : "—"}
                    </span>
                  </div>
                  {item ? (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {item.color ? item.color : ""}{item.size ? ` (${item.size})` : ""}
                        {quote ? ` · ${quote.totalDays} day${quote.totalDays > 1 ? "s" : ""}` : ""}
                      </span>
                      {quote && quote.available ? (
                        <span>
                          Rent: {formatMoney((Number(quote.totalAmount) * quantity).toFixed(2))}
                          {Number(quote.securityDeposit) > 0
                            ? ` + Dep: ${formatMoney((Number(quote.securityDeposit) * quantity).toFixed(2))}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Rental Charges</span>
              <span className="font-medium text-foreground">
                {formatMoney((grossRentCents / 100).toFixed(2))}
              </span>
            </div>

            {discountCents > 0 ? (
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="flex items-center gap-1">
                  <TagIcon className="size-3.5" />
                  Discount
                </span>
                <span>-{formatMoney((discountCents / 100).toFixed(2))}</span>
              </div>
            ) : null}

            {discountCents > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground font-medium">
                <span>Net Rent Subtotal</span>
                <span className="text-foreground">
                  {formatMoney((netRentCents / 100).toFixed(2))}
                </span>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Security Deposit
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal border-primary/30 text-primary">
                  Refundable
                </Badge>
              </span>
              <span className="font-medium text-foreground">
                {formatMoney((securityDepositCents / 100).toFixed(2))}
              </span>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between rounded-xl bg-primary/5 p-3.5 border border-primary/20">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">Total Due at Pickup</span>
              <span className="text-[11px] text-muted-foreground">Rent + Security Deposit</span>
            </div>
            <span className="text-xl font-bold text-primary">
              {formatMoney((grandTotalCents / 100).toFixed(2))}
            </span>
          </div>

          {securityDepositCents > 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Includes <strong>{formatMoney((securityDepositCents / 100).toFixed(2))}</strong> in refundable security deposit, returned after item check.
              </span>
            </div>
          ) : null}

          {totalUnits > 1 ? (
            <p className="text-muted-foreground text-xs text-center">
              {totalUnits} items will be created as separate bookings, linked together as one order.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}
