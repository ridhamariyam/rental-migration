"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, ReceiptTextIcon, ShieldCheckIcon, TagIcon } from "lucide-react";

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
  type CreateBookingInput,
} from "@/lib/validation/bookings";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney, toDateString } from "@/lib/format";
import { avatarGradient, initialsFor, resolveAvatarSrc } from "@/lib/tenant-avatar";
import type { VariationSearchResult } from "@/server/variations/service";

const SELF = "self";
// `BookingItemRow` reports its quote up through a keyed callback (a
// leftover from when a booking could hold several lines) — there's only
// ever one row now, so this key never varies.
const ITEM_KEY = "item-0";

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
 * Booking creation — one customer, one item, any quantity of it (see
 * `bookings.quantity`'s doc comment): its own dates/discount and a live
 * availability + price check. Submitting posts the single line
 * (`createBookingGroup`, still array-shaped server-side) and returns one
 * `bookings` row.
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
  const [selectedItem, setSelectedItem] =
    useState<VariationSearchResult | null>(null);
  const [quote, setQuote] = useState<BookingItemQuote | null>(null);

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

  // Only read for its `quantity` (to scale the total in the summary panel
  // below) — everything else about the item still flows through
  // `selectedItem`/`quote`, set imperatively by `BookingItemRow`.
  const watchedItem = useWatch({ control: form.control, name: "items.0" });

  useEffect(() => {
    form.setValue("customerId", selectedCustomer?.id ?? "", {
      shouldValidate: form.formState.isSubmitted,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer]);

  function handleSelectItem(item: VariationSearchResult | null) {
    setSelectedItem(item);
    form.setValue("items.0.variationId", item?.id ?? "", {
      shouldValidate: form.formState.isSubmitted,
    });
    setFormError(null);
  }

  function handleQuoteChange(_key: string, nextQuote: BookingItemQuote | null) {
    setQuote(nextQuote);
  }

  const quantity = Math.max(1, Number(watchedItem?.quantity) || 1);
  const itemChosen = Boolean(selectedItem);
  const canSubmit =
    Boolean(selectedCustomer) && itemChosen && Boolean(quote) && quote?.available === true;

  // The quote already reflects the item's own `quantity` (the server
  // prices `rentPrice/securityDeposit × totalDays × quantity` in one go —
  // see `quoteRental`), so these are plain reads, never a second multiply.
  const grossRentCents = quote?.available
    ? Math.round(Number(quote.grossRent) * 100)
    : 0;
  const discountCents = quote?.available
    ? Math.round(Number(quote.discountAmount) * 100)
    : 0;
  const netRentCents = quote?.available
    ? Math.round(Number(quote.totalAmount) * 100)
    : 0;
  const securityDepositCents = quote?.available
    ? Math.round(Number(quote.securityDeposit) * 100)
    : 0;

  const grandTotalCents = netRentCents + securityDepositCents;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    if (!selectedCustomer) {
      setFormError("Choose a customer to continue.");
      return;
    }

    if (!itemChosen) {
      setFormError("Choose an item to continue.");
      return;
    }

    try {
      const created = await apiRequest<{ id: string }[]>("/api/bookings", {
        method: "POST",
        body: JSON.stringify(values),
      });
      router.push(`${tenantPaths.bookings}/${created[0].id}?created=1`);
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
  const itemErrors = form.formState.errors.items?.[0];

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
                <FieldLabel>Item</FieldLabel>
                <BookingItemRow
                  index={0}
                  itemKey={ITEM_KEY}
                  control={form.control}
                  register={form.register}
                  setValue={form.setValue}
                  trigger={form.trigger}
                  errors={itemErrors}
                  selectedItem={selectedItem}
                  onSelectItem={handleSelectItem}
                  canDiscount={canDiscount}
                  canRemove={false}
                  onRemove={() => {}}
                  disabled={isSubmitting}
                  onQuoteChange={handleQuoteChange}
                />
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
              Item
            </span>
            <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-2.5 border border-border/40 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground truncate">
                  {selectedItem ? selectedItem.productName : "No item selected"}
                  {quantity > 1 ? ` × ${quantity}` : ""}
                </span>
                <span className="shrink-0 font-semibold text-foreground">
                  {quote
                    ? quote.available
                      ? formatMoney(quote.totalReceivable)
                      : "Unavailable"
                    : "—"}
                </span>
              </div>
              {selectedItem ? (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {selectedItem.color ? selectedItem.color : ""}
                    {selectedItem.size ? ` (${selectedItem.size})` : ""}
                    {quote ? ` · ${quote.totalDays} day${quote.totalDays > 1 ? "s" : ""}` : ""}
                  </span>
                  {quote && quote.available ? (
                    <span>
                      Rent: {formatMoney(quote.totalAmount)}
                      {Number(quote.securityDeposit) > 0
                        ? ` + Dep: ${formatMoney(quote.securityDeposit)}`
                        : ""}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
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
        </CardContent>
      </Card>

    </form>
  );
}
