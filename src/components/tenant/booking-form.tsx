"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  PackageIcon,
  PlusIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  TagIcon,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
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
import { BookingDocumentsField } from "@/components/tenant/booking-documents-field";
import {
  createBookingSchema,
  MAX_TOTAL_BOOKING_UNITS,
  type CreateBookingInput,
} from "@/lib/validation/bookings";
import { PAYMENT_METHOD_VALUES } from "@/lib/validation/payments";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { addMoney, subtractMoneyNonNegative, ZERO_MONEY } from "@/lib/money";
import { formatMoney, toDateString } from "@/lib/format";
import {
  avatarGradient,
  initialsFor,
  resolveAvatarSrc,
} from "@/lib/tenant-avatar";
import type { VariationSearchResult } from "@/server/variations/service";

const SELF = "self";

/** How many separate item lines one order may hold — mirrors
 * `createBookingSchema`'s own `.max(20)` so the "Add another item" button
 * disappears at the cap instead of letting someone discover it from a
 * failed submit. */
const MAX_ITEM_LINES = 20;

function todayIso(): string {
  return toDateString(new Date());
}

function emptyItem(defaultFromDate?: string, defaultToDate?: string) {
  return {
    variationId: "",
    fromDate: defaultFromDate ?? todayIso(),
    toDate: defaultToDate ?? todayIso(),
    securityDeposit: "",
    quantity: "1",
  };
}

/**
 * Booking creation — one customer, any number of *different* items (each
 * with its own dates, quantity and deposit) and a live availability +
 * price check per line, plus one shared discount/additional cost/advance
 * for the whole order (not per line — see `BookingItemRow`'s doc comment).
 * Submitting posts every line at once (`createBookingGroup`), which
 * returns one `bookings` row per line sharing a `bookingGroupId`.
 *
 * Per-line state that isn't a form field — the picked item and its latest
 * quote — is keyed by the field array's own stable row id, not by index,
 * so removing line 2 of 3 never re-points line 3's item at line 2's quote.
 */
export function BookingForm({
  canDiscount,
  staffOptions = [],
}: {
  canDiscount: boolean;
  /** Non-empty only for an `admin` actor (see `NewBookingPage`) — every
   * other role's bookings are always attributed to themselves, so there's
   * nothing to pick and this field never renders for them. */
  staffOptions?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  }[];
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
      items: [emptyItem()],
      discountAmount: canDiscount ? "0.00" : undefined,
      securityDeposit: "",
      additionalCost: "",
      additionalCostReason: "",
      advanceAmount: "",
      advancePaymentMethod: "cash",
      notes: "",
      documents: [],
      handledById: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({ control: form.control, name: "items" });

  useEffect(() => {
    form.setValue("customerId", selectedCustomer?.id ?? "", {
      shouldValidate: form.formState.isSubmitted,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer]);

  function handleSelectItem(
    index: number,
    key: string,
    item: VariationSearchResult | null,
  ) {
    setSelectedItems((current) => ({ ...current, [key]: item }));
    form.setValue(`items.${index}.variationId`, item?.id ?? "", {
      shouldValidate: form.formState.isSubmitted,
    });
    setFormError(null);
  }

  function handleQuoteChange(key: string, nextQuote: BookingItemQuote | null) {
    setQuotes((current) => ({ ...current, [key]: nextQuote }));
  }

  /**
   * Exactly one line is open at a time. Adding an item collapses whatever
   * was open into its summary and opens the new line — which is what makes
   * the cart read as a list of what has been added rather than a stack of
   * identical forms. `null` means "the newest line", so a fresh form opens
   * on its only line without having to know its generated key yet.
   */
  const [editingKey, setEditingKey] = useState<string | null>(null);

  function handleAddItem() {
    const lastItem = watchedItems?.[watchedItems.length - 1];
    append(emptyItem(lastItem?.fromDate, lastItem?.toDate));
    setEditingKey(null);
    setFormError(null);
  }

  function handleRemoveItem(index: number, key: string) {
    remove(index);
    // Removing the open line leaves nothing open; fall back to the newest.
    setEditingKey((current) => (current === key ? null : current));
    setSelectedItems((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setQuotes((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
  }

  const totalUnits = (watchedItems ?? []).reduce(
    (sum, item) => sum + Math.max(1, Number(item?.quantity) || 1),
    0,
  );
  const overUnitCap = totalUnits > MAX_TOTAL_BOOKING_UNITS;

  const lines = fields.map((field, index) => ({
    key: field.id,
    index,
    item: selectedItems[field.id] ?? null,
    quote: quotes[field.id] ?? null,
    quantity: Math.max(1, Number(watchedItems?.[index]?.quantity) || 1),
  }));

  // `null` tracks the newest line so a just-added row is the open one.
  const openKey = editingKey ?? fields[fields.length - 1]?.id ?? null;

  const everyLineReady = lines.every(
    (line) => line.item && line.quote?.available === true,
  );

  // Every line's own rent/deposit is added straight off the server's own
  // per-line quotes — the summary never re-derives a *price* of its own.
  // The discount/additional cost/advance below are this order's own shared
  // adjustment (see `BookingItemRow`'s doc comment for why they moved off
  // each line), applied here only for a live preview; `createBookingGroup`
  // re-validates and re-applies all of this server-side before anything
  // is frozen onto a booking.
  const priced = lines.filter((line) => line.quote?.available);
  const watchedDiscount = useWatch({
    control: form.control,
    name: "discountAmount",
  });
  const watchedDeposit = useWatch({
    control: form.control,
    name: "securityDeposit",
  });
  const watchedAdditionalCost = useWatch({
    control: form.control,
    name: "additionalCost",
  });
  const watchedAdvance = useWatch({
    control: form.control,
    name: "advanceAmount",
  });
  const extraCharged = Number(watchedAdditionalCost || "0") > 0;

  const grossRentTotal = priced.reduce(
    (sum, line) => addMoney(sum, line.quote!.grossRent),
    ZERO_MONEY,
  );
  // A line's own quote already carries its item's default deposit — an
  // order-level override replaces that summed default entirely, rather
  // than adding to it.
  const defaultDepositTotal = priced.reduce(
    (sum, line) => addMoney(sum, line.quote!.securityDeposit),
    ZERO_MONEY,
  );
  const depositTotal = watchedDeposit || defaultDepositTotal;
  const discount = watchedDiscount || ZERO_MONEY;
  const additionalCost = watchedAdditionalCost || ZERO_MONEY;
  const netRentTotal = addMoney(
    subtractMoneyNonNegative(grossRentTotal, discount),
    additionalCost,
  );
  const grandTotal = addMoney(netRentTotal, depositTotal);
  const advance = watchedAdvance || ZERO_MONEY;
  const dueAtPickup = subtractMoneyNonNegative(grandTotal, advance);

  const totals = {
    grossRent: grossRentTotal,
    discount,
    additionalCost,
    netRent: netRentTotal,
    deposit: depositTotal,
    grandTotal,
    advance,
    dueAtPickup,
  };

  const discountExceedsGross =
    Number(discount) > 0 && Number(discount) > Number(grossRentTotal);
  const advanceExceedsTotal =
    Number(advance) > 0 && Number(advance) > Number(grandTotal);

  const canSubmit =
    Boolean(selectedCustomer) &&
    lines.length > 0 &&
    everyLineReady &&
    !overUnitCap &&
    !discountExceedsGross &&
    !advanceExceedsTotal;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    if (!selectedCustomer) {
      setFormError("Choose a customer to continue.");
      return;
    }

    if (!everyLineReady) {
      setFormError("Every item needs to be chosen and available to continue.");
      return;
    }

    try {
      const created = await apiRequest<{
        booking: { id: string };
        items: { id: string }[];
      }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const query =
        created.items.length > 1
          ? `?created=1&count=${created.items.length}`
          : "?created=1";
      router.push(`${tenantPaths.bookings}/${created.booking.id}${query}`);
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

        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "discountAmount" ||
            fieldError.field === "securityDeposit" ||
            fieldError.field === "additionalCost" ||
            fieldError.field === "additionalCostReason" ||
            fieldError.field === "advanceAmount"
          ) {
            form.setError(
              fieldError.field as
                | "discountAmount"
                | "securityDeposit"
                | "additionalCost"
                | "additionalCostReason"
                | "advanceAmount",
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

              <div className="border-border/70 bg-card flex flex-col gap-3 overflow-hidden rounded-xl border">
                <div className="border-border/60 bg-muted/30 flex items-center justify-between gap-3 border-b px-4 py-3">
                  <FieldLabel className="text-foreground/90 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                    <PackageIcon
                      className="text-primary size-3.5"
                      aria-hidden="true"
                    />
                    Items
                    {lines.length > 1 ? (
                      <span className="text-muted-foreground font-normal tracking-normal normal-case">
                        ({lines.length} lines · {totalUnits} units)
                      </span>
                    ) : null}
                  </FieldLabel>
                </div>

                <div className="divide-border/50 flex flex-col divide-y px-4 pb-4">
                  {lines.map((line) => (
                    <BookingItemRow
                      key={line.key}
                      index={line.index}
                      itemKey={line.key}
                      control={form.control}
                      register={form.register}
                      setValue={form.setValue}
                      trigger={form.trigger}
                      errors={form.formState.errors.items?.[line.index]}
                      selectedItem={line.item}
                      onSelectItem={(item) =>
                        handleSelectItem(line.index, line.key, item)
                      }
                      canRemove={lines.length > 1}
                      onRemove={() => handleRemoveItem(line.index, line.key)}
                      disabled={isSubmitting}
                      onQuoteChange={handleQuoteChange}
                      expanded={line.key === openKey}
                      onEdit={() => setEditingKey(line.key)}
                    />
                  ))}

                  {overUnitCap ? (
                    <Alert
                      variant="destructive"
                      className="border-destructive/25 bg-destructive/5"
                    >
                      <AlertCircleIcon />
                      <AlertDescription className="text-destructive font-medium">
                        One order can request at most {MAX_TOTAL_BOOKING_UNITS}{" "}
                        units in total — this one asks for {totalUnits}.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {lines.length < MAX_ITEM_LINES ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={handleAddItem}
                      className="self-end"
                    >
                      <PlusIcon />
                      Add another item
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="border-border/70 bg-muted/20 flex flex-col gap-4 rounded-xl border border-dashed p-4">
                <FieldLabel className="text-foreground/90 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                  <SlidersHorizontalIcon
                    className="text-primary size-3.5"
                    aria-hidden="true"
                  />
                  Order adjustments
                </FieldLabel>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {canDiscount ? (
                    <Field
                      data-invalid={!!form.formState.errors.discountAmount}
                    >
                      <FieldLabel htmlFor="order-discount">
                        Discount (optional)
                      </FieldLabel>
                      <Input
                        id="order-discount"
                        inputMode="decimal"
                        placeholder="0.00"
                        disabled={isSubmitting}
                        aria-invalid={!!form.formState.errors.discountAmount}
                        {...form.register("discountAmount")}
                      />
                      <FieldError
                        errors={[form.formState.errors.discountAmount]}
                      />
                      {discountExceedsGross ? (
                        <p className="text-destructive text-xs">
                          Discount cannot exceed the{" "}
                          {formatMoney(grossRentTotal)} rental amount.
                        </p>
                      ) : null}
                    </Field>
                  ) : null}

                  <Field data-invalid={!!form.formState.errors.additionalCost}>
                    <FieldLabel htmlFor="order-additional-cost">
                      Additional cost (optional)
                    </FieldLabel>
                    <Input
                      id="order-additional-cost"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={isSubmitting}
                      aria-invalid={!!form.formState.errors.additionalCost}
                      {...form.register("additionalCost")}
                    />
                    <FieldError
                      errors={[form.formState.errors.additionalCost]}
                    />
                  </Field>
                </div>

                <Field data-invalid={!!form.formState.errors.securityDeposit}>
                  <FieldLabel htmlFor="order-deposit">
                    Security deposit (optional)
                  </FieldLabel>
                  <Input
                    id="order-deposit"
                    inputMode="decimal"
                    placeholder={`${formatMoney(defaultDepositTotal)} by default`}
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.securityDeposit}
                    {...form.register("securityDeposit")}
                  />
                  <FieldError
                    errors={[form.formState.errors.securityDeposit]}
                  />
                  <p className="text-muted-foreground text-xs">
                    For the whole order. Leave blank to hold each item&rsquo;s
                    own default deposit.
                  </p>
                </Field>

                <Field
                  data-invalid={!!form.formState.errors.additionalCostReason}
                >
                  <FieldLabel htmlFor="order-additional-reason">
                    Reason{extraCharged ? "" : " (optional)"}
                  </FieldLabel>
                  <Input
                    id="order-additional-reason"
                    placeholder="Alteration, delivery, late fee…"
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.additionalCostReason}
                    {...form.register("additionalCostReason")}
                  />
                  <FieldError
                    errors={[form.formState.errors.additionalCostReason]}
                  />
                </Field>

                <Separator />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!form.formState.errors.advanceAmount}>
                    <FieldLabel htmlFor="order-advance">
                      Advance payment (optional)
                    </FieldLabel>
                    <Input
                      id="order-advance"
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={isSubmitting}
                      aria-invalid={!!form.formState.errors.advanceAmount}
                      {...form.register("advanceAmount")}
                    />
                    <FieldError
                      errors={[form.formState.errors.advanceAmount]}
                    />
                    {advanceExceedsTotal ? (
                      <p className="text-destructive text-xs">
                        Advance cannot exceed the {formatMoney(grandTotal)} due.
                      </p>
                    ) : null}
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="order-advance-method">
                      Payment method
                    </FieldLabel>
                    <Controller
                      control={form.control}
                      name="advancePaymentMethod"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? "cash"}
                          onValueChange={field.onChange}
                          disabled={
                            isSubmitting || Number(watchedAdvance || "0") <= 0
                          }
                        >
                          <SelectTrigger
                            id="order-advance-method"
                            className="w-full"
                          >
                            <SelectValue placeholder="Cash" />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            {PAYMENT_METHOD_VALUES.map((method) => (
                              <SelectItem key={method} value={method}>
                                {method.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                </div>
              </div>

              <Field>
                <FieldLabel>Documents (optional)</FieldLabel>
                <Controller
                  control={form.control}
                  name="documents"
                  render={({ field }) => (
                    <BookingDocumentsField
                      value={field.value ?? []}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
              </Field>

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
                                      src={resolveAvatarSrc(
                                        staff.avatarUrl,
                                        name,
                                      )}
                                      alt={name}
                                    />
                                    <AvatarFallback
                                      className="text-[10px] font-semibold !text-white"
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
                                      src={resolveAvatarSrc(
                                        staff.avatarUrl,
                                        name,
                                      )}
                                      alt={name}
                                    />
                                    <AvatarFallback
                                      className="text-[10px] font-semibold !text-white"
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

            {/* Mobile submit lives in the sticky bar below instead, next to
             * the running total — this row only needs to show on the
             * two-column desktop layout, where the total is already
             * visible beside the form without scrolling. */}
            <div className="hidden items-center justify-end gap-3 lg:flex">
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
                ) : (
                  "Create booking"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="border-border/60 border-b px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ReceiptTextIcon
              className="text-primary size-4"
              aria-hidden="true"
            />
            Order summary
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-2.5">
            <span className="text-muted-foreground/80 text-[11px] font-semibold tracking-wider uppercase">
              {lines.length > 1 ? `Items (${lines.length})` : "Item"}
            </span>
            <div className="flex flex-col gap-1.5">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="bg-muted/40 border-border/40 flex flex-col gap-1 rounded-lg border p-2.5 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground truncate font-semibold">
                      {line.item ? line.item.productName : "No item selected"}
                      {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    </span>
                    <span className="text-foreground shrink-0 font-semibold">
                      {line.quote
                        ? line.quote.available
                          ? formatMoney(line.quote.totalReceivable)
                          : "Unavailable"
                        : "—"}
                    </span>
                  </div>
                  {line.item ? (
                    <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        {line.item.color ? line.item.color : ""}
                        {line.item.size ? ` (${line.item.size})` : ""}
                        {line.quote
                          ? ` · ${line.quote.totalDays} day${line.quote.totalDays > 1 ? "s" : ""}`
                          : ""}
                      </span>
                      {line.quote && line.quote.available ? (
                        <span className="shrink-0">
                          Rent: {formatMoney(line.quote.totalAmount)}
                          {Number(line.quote.securityDeposit) > 0
                            ? ` + Dep: ${formatMoney(line.quote.securityDeposit)}`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2 text-sm">
            <div className="text-muted-foreground flex items-center justify-between">
              <span>Rental Charges</span>
              <span className="text-foreground font-medium">
                {formatMoney(totals.grossRent)}
              </span>
            </div>

            {Number(totals.discount) > 0 ? (
              <div className="flex items-center justify-between font-medium text-emerald-600 dark:text-emerald-400">
                <span className="flex items-center gap-1">
                  <TagIcon className="size-3.5" />
                  Discount
                </span>
                <span>-{formatMoney(totals.discount)}</span>
              </div>
            ) : null}

            {Number(totals.additionalCost) > 0 ? (
              <div className="text-muted-foreground flex items-center justify-between">
                <span>Additional charges</span>
                <span className="text-foreground font-medium">
                  {formatMoney(totals.additionalCost)}
                </span>
              </div>
            ) : null}

            {Number(totals.discount) > 0 ||
            Number(totals.additionalCost) > 0 ? (
              <div className="text-muted-foreground flex items-center justify-between font-medium">
                <span>Net Rent Subtotal</span>
                <span className="text-foreground">
                  {formatMoney(totals.netRent)}
                </span>
              </div>
            ) : null}

            <div className="text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                Security Deposit
                <Badge
                  variant="outline"
                  className="border-primary/30 text-primary px-1.5 py-0 text-[10px] font-normal"
                >
                  Refundable
                </Badge>
              </span>
              <span className="text-foreground font-medium">
                {formatMoney(totals.deposit)}
              </span>
            </div>
          </div>

          <Separator />

          <div className="bg-primary/5 border-primary/20 flex items-center justify-between rounded-xl border p-3.5">
            <div className="flex flex-col">
              <span className="text-foreground text-sm font-bold">
                {Number(totals.advance) > 0
                  ? "Due at Pickup"
                  : "Total Due at Pickup"}
              </span>
              <span className="text-muted-foreground text-[11px]">
                Rent + Security Deposit
              </span>
            </div>
            <span className="text-primary text-xl font-bold">
              {formatMoney(totals.dueAtPickup)}
            </span>
          </div>

          {Number(totals.advance) > 0 ? (
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>Advance ({formatMoney(totals.grandTotal)} total)</span>
              <span className="text-foreground font-medium">
                -{formatMoney(totals.advance)}
              </span>
            </div>
          ) : null}

          {Number(totals.deposit) > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Includes <strong>{formatMoney(totals.deposit)}</strong> in
                refundable security deposit, returned after item check.
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Mobile-only: keeps the running total and submit reachable without
       * scrolling past the whole form, mirroring what desktop already gets
       * for free from the two-column layout. */}
      <div className="border-border/60 bg-background/95 fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm lg:hidden">
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground text-[11px]">
            {Number(totals.advance) > 0
              ? "Due at pickup"
              : "Total due at pickup"}
          </span>
          <span className="text-primary truncate text-lg font-bold">
            {formatMoney(totals.dueAtPickup)}
          </span>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className="min-w-36"
        >
          {isSubmitting ? (
            <>
              <Spinner />
              Creating…
            </>
          ) : (
            "Create booking"
          )}
        </Button>
      </div>
    </form>
  );
}
