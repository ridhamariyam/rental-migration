"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  PlusIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
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
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { addMoney, ZERO_MONEY } from "@/lib/money";
import { formatMoney, toDateString } from "@/lib/format";
import { avatarGradient, initialsFor, resolveAvatarSrc } from "@/lib/tenant-avatar";
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

function emptyItem(canDiscount: boolean) {
  return {
    variationId: "",
    fromDate: todayIso(),
    toDate: todayIso(),
    discountAmount: canDiscount ? "0.00" : undefined,
    additionalCost: "",
    additionalCostReason: "",
    securityDeposit: "",
    quantity: "1",
  };
}

/**
 * Booking creation — one customer, any number of *different* items (each
 * with its own dates, quantity, discount, extra charge and deposit) and a
 * live availability + price check per line. Submitting posts every line at
 * once (`createBookingGroup`), which returns one `bookings` row per line
 * sharing a `bookingGroupId`.
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
  staffOptions?: { id: string; firstName: string; lastName: string; avatarUrl: string | null }[];
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

  function handleAddItem() {
    append(emptyItem(canDiscount));
    setFormError(null);
  }

  function handleRemoveItem(index: number, key: string) {
    remove(index);
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

  const everyLineReady = lines.every(
    (line) => line.item && line.quote?.available === true,
  );
  const canSubmit =
    Boolean(selectedCustomer) &&
    lines.length > 0 &&
    everyLineReady &&
    !overUnitCap;

  // Every figure below is added straight off the server's own quotes (which
  // already account for quantity, discount, extras and the deposit) — the
  // summary never re-derives a price of its own, so what staff review here
  // is exactly what gets frozen onto the booking.
  const priced = lines.filter((line) => line.quote?.available);
  const totals = priced.reduce(
    (acc, line) => ({
      grossRent: addMoney(acc.grossRent, line.quote!.grossRent),
      discount: addMoney(acc.discount, line.quote!.discountAmount),
      additionalCost: addMoney(acc.additionalCost, line.quote!.additionalCost),
      netRent: addMoney(acc.netRent, line.quote!.totalAmount),
      deposit: addMoney(acc.deposit, line.quote!.securityDeposit),
      grandTotal: addMoney(acc.grandTotal, line.quote!.totalReceivable),
    }),
    {
      grossRent: ZERO_MONEY,
      discount: ZERO_MONEY,
      additionalCost: ZERO_MONEY,
      netRent: ZERO_MONEY,
      deposit: ZERO_MONEY,
      grandTotal: ZERO_MONEY,
    },
  );

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
      const created = await apiRequest<{ id: string }[]>("/api/bookings", {
        method: "POST",
        body: JSON.stringify(values),
      });
      const query =
        created.length > 1 ? `?created=1&count=${created.length}` : "?created=1";
      router.push(`${tenantPaths.bookings}/${created[0].id}${query}`);
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
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>
                    Items
                    {lines.length > 1 ? (
                      <span className="text-muted-foreground ml-1 font-normal">
                        ({lines.length} lines · {totalUnits} units)
                      </span>
                    ) : null}
                  </FieldLabel>
                  {lines.length < MAX_ITEM_LINES ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={handleAddItem}
                    >
                      <PlusIcon />
                      Add another item
                    </Button>
                  ) : null}
                </div>

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
                    canDiscount={canDiscount}
                    canRemove={lines.length > 1}
                    onRemove={() => handleRemoveItem(line.index, line.key)}
                    disabled={isSubmitting}
                    onQuoteChange={handleQuoteChange}
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
                                      src={resolveAvatarSrc(staff.avatarUrl, name)}
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
                                      src={resolveAvatarSrc(staff.avatarUrl, name)}
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
              {lines.length > 1 ? `Items (${lines.length})` : "Item"}
            </span>
            <div className="flex flex-col gap-1.5">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className="flex flex-col gap-1 rounded-lg bg-muted/40 p-2.5 border border-border/40 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground truncate">
                      {line.item ? line.item.productName : "No item selected"}
                      {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    </span>
                    <span className="shrink-0 font-semibold text-foreground">
                      {line.quote
                        ? line.quote.available
                          ? formatMoney(line.quote.totalReceivable)
                          : "Unavailable"
                        : "—"}
                    </span>
                  </div>
                  {line.item ? (
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
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
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Rental Charges</span>
              <span className="font-medium text-foreground">
                {formatMoney(totals.grossRent)}
              </span>
            </div>

            {Number(totals.discount) > 0 ? (
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="flex items-center gap-1">
                  <TagIcon className="size-3.5" />
                  Discount
                </span>
                <span>-{formatMoney(totals.discount)}</span>
              </div>
            ) : null}

            {Number(totals.additionalCost) > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Additional charges</span>
                <span className="font-medium text-foreground">
                  {formatMoney(totals.additionalCost)}
                </span>
              </div>
            ) : null}

            {Number(totals.discount) > 0 || Number(totals.additionalCost) > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground font-medium">
                <span>Net Rent Subtotal</span>
                <span className="text-foreground">
                  {formatMoney(totals.netRent)}
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
                {formatMoney(totals.deposit)}
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
              {formatMoney(totals.grandTotal)}
            </span>
          </div>

          {Number(totals.deposit) > 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                Includes <strong>{formatMoney(totals.deposit)}</strong> in refundable security deposit, returned after item check.
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

    </form>
  );
}
