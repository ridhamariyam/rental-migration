"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPicker, type PickedCustomer } from "@/components/tenant/customer-picker";
import { ImageUploadField } from "@/components/tenant/image-upload-field";
import {
  updateVariationSchema,
  type UpdateVariationInput,
} from "@/lib/validation/variations";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { VariationRow } from "@/server/variations/service";

/**
 * Excludes SKU/barcode, same reasoning as `updateVariationSchema` — those
 * are allocated once at creation and printed onto a physical label.
 */
export function EditVariationDialog({
  open,
  onOpenChange,
  variation,
  outlets,
  canViewCost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variation?: VariationRow;
  outlets: { id: string; name: string; code: string }[];
  /** Gates the "Buying price" field — admin-only
   * (`Permission.PRODUCT_COST_VIEW`), unlike selling/rental price which
   * any `PRODUCT_MANAGE` role can see and set. */
  canViewCost: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pickedOwner, setPickedOwner] = useState<PickedCustomer | null>(null);

  const form = useForm<UpdateVariationInput>({
    resolver: zodResolver(updateVariationSchema),
    defaultValues: {
      color: variation?.color ?? "",
      size: variation?.size ?? "",
      rentPrice: variation?.rentPrice ?? "",
      buyingPrice: variation?.buyingPrice ?? "",
      securityDeposit: variation?.securityDeposit ?? "",
      sellingPrice: variation?.sellingPrice ?? "",
      quantity: variation ? String(variation.quantity) : "1",
      outletId: variation?.outletId ?? outlets[0]?.id ?? "",
      image: variation?.image ?? "",
      ownershipType: variation?.ownershipType ?? "shop_owned",
      ownerName: variation?.ownerName ?? "",
      ownerPhone: variation?.ownerPhone ?? "",
      ownerCustomerId: variation?.ownerCustomerId ?? "",
      ownerShareAmount: variation?.ownerShareAmount ?? "",
      ownerNotes: variation?.ownerNotes ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const ownershipType = useWatch({ control: form.control, name: "ownershipType" });

  useEffect(() => {
    if (open && variation) {
      form.reset({
        color: variation.color ?? "",
        size: variation.size ?? "",
        rentPrice: variation.rentPrice,
        buyingPrice: variation.buyingPrice ?? "",
        securityDeposit: variation.securityDeposit ?? "",
        sellingPrice: variation.sellingPrice ?? "",
        quantity: String(variation.quantity),
        outletId: variation.outletId ?? outlets[0]?.id ?? "",
        image: variation.image ?? "",
        ownershipType: variation.ownershipType,
        ownerName: variation.ownerName ?? "",
        ownerPhone: variation.ownerPhone ?? "",
        ownerCustomerId: variation.ownerCustomerId ?? "",
        ownerShareAmount: variation.ownerShareAmount,
        ownerNotes: variation.ownerNotes ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variation?.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!variation) return;
    setFormError(null);

    try {
      await apiRequest(`/api/variations/${variation.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "outletId" ||
            fieldError.field === "ownerName" ||
            fieldError.field === "ownerShareAmount"
          ) {
            form.setError(
              fieldError.field as "outletId" | "ownerName" | "ownerShareAmount",
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setFormError(null);
        setPickedOwner(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
          <DialogDescription>
            {variation ? `${variation.sku} — ${variation.barcode}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-col flex-1 overflow-hidden min-h-0">
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
              <Field>
                <FieldLabel htmlFor="edit-image">Item photo (optional)</FieldLabel>
                <Controller
                  control={form.control}
                  name="image"
                  render={({ field }) => (
                    <ImageUploadField
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.color}>
                  <FieldLabel htmlFor="edit-color">Color (optional)</FieldLabel>
                  <Input
                    id="edit-color"
                    disabled={isSubmitting}
                    {...form.register("color")}
                  />
                  <FieldError errors={[form.formState.errors.color]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.size}>
                  <FieldLabel htmlFor="edit-size">Size (optional)</FieldLabel>
                  <Input
                    id="edit-size"
                    disabled={isSubmitting}
                    {...form.register("size")}
                  />
                  <FieldError errors={[form.formState.errors.size]} />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.rentPrice}>
                  <FieldLabel htmlFor="edit-rentPrice">Rental price</FieldLabel>
                  <Input
                    id="edit-rentPrice"
                    inputMode="decimal"
                    disabled={isSubmitting}
                    {...form.register("rentPrice")}
                  />
                  <FieldError errors={[form.formState.errors.rentPrice]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.sellingPrice}>
                  <FieldLabel htmlFor="edit-sellingPrice">
                    Selling price (optional)
                  </FieldLabel>
                  <Input
                    id="edit-sellingPrice"
                    inputMode="decimal"
                    disabled={isSubmitting}
                    {...form.register("sellingPrice")}
                  />
                  <FieldError errors={[form.formState.errors.sellingPrice]} />
                </Field>
              </div>

              {canViewCost ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!form.formState.errors.buyingPrice}>
                    <FieldLabel htmlFor="edit-buyingPrice">
                      Buying price (optional)
                    </FieldLabel>
                    <Input
                      id="edit-buyingPrice"
                      inputMode="decimal"
                      disabled={isSubmitting}
                      {...form.register("buyingPrice")}
                    />
                    <FieldError errors={[form.formState.errors.buyingPrice]} />
                  </Field>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.quantity}>
                  <FieldLabel htmlFor="edit-quantity">Quantity</FieldLabel>
                  <Input
                    id="edit-quantity"
                    inputMode="numeric"
                    disabled={isSubmitting}
                    {...form.register("quantity")}
                  />
                  <FieldError errors={[form.formState.errors.quantity]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.outletId}>
                  <FieldLabel htmlFor="edit-outletId">Outlet</FieldLabel>
                  <Controller
                    control={form.control}
                    name="outletId"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="edit-outletId" className="w-full">
                          <SelectValue placeholder="Choose an outlet">
                            {(value: string) => {
                              const outlet = outlets.find(
                                (item) => item.id === value,
                              );
                              return outlet
                                ? `${outlet.name} (${outlet.code})`
                                : "Choose an outlet";
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          {outlets.map((outlet) => (
                            <SelectItem key={outlet.id} value={outlet.id}>
                              {outlet.name} ({outlet.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.outletId]} />
                </Field>
              </div>

              <div className="flex flex-col gap-4 border-t pt-4">
                <Field data-invalid={!!form.formState.errors.ownershipType}>
                  <FieldLabel htmlFor="edit-ownershipType">Ownership</FieldLabel>
                  <Controller
                    control={form.control}
                    name="ownershipType"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="edit-ownershipType" className="w-full">
                          <SelectValue placeholder="Ownership">
                            {(value: string) =>
                              value === "customer_owned"
                                ? "Customer-owned (revenue share)"
                                : "Shop-owned"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectItem value="shop_owned">Shop-owned</SelectItem>
                          <SelectItem value="customer_owned">
                            Customer-owned (revenue share)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.ownershipType]} />
                </Field>

                {ownershipType === "customer_owned" ? (
                  <>
                    <Field>
                      <FieldLabel>Link to an existing customer (optional)</FieldLabel>
                      <CustomerPicker
                        value={pickedOwner}
                        disabled={isSubmitting}
                        onSelect={(customer) => {
                          setPickedOwner(customer);
                          form.setValue("ownerCustomerId", customer?.id ?? "");
                          if (customer) {
                            form.setValue(
                              "ownerName",
                              `${customer.firstName} ${customer.lastName}`,
                            );
                            form.setValue("ownerPhone", customer.phone);
                          }
                        }}
                      />
                    </Field>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field data-invalid={!!form.formState.errors.ownerName}>
                        <FieldLabel htmlFor="edit-ownerName">Owner name</FieldLabel>
                        <Input
                          id="edit-ownerName"
                          disabled={isSubmitting}
                          {...form.register("ownerName")}
                        />
                        <FieldError errors={[form.formState.errors.ownerName]} />
                      </Field>
                      <Field data-invalid={!!form.formState.errors.ownerPhone}>
                        <FieldLabel htmlFor="edit-ownerPhone">
                          Owner phone (optional)
                        </FieldLabel>
                        <Input
                          id="edit-ownerPhone"
                          disabled={isSubmitting}
                          {...form.register("ownerPhone")}
                        />
                        <FieldError errors={[form.formState.errors.ownerPhone]} />
                      </Field>
                    </div>

                    <Field data-invalid={!!form.formState.errors.ownerShareAmount}>
                      <FieldLabel htmlFor="edit-ownerShareAmount">
                        Owner&rsquo;s revenue share
                      </FieldLabel>
                      <Input
                        id="edit-ownerShareAmount"
                        inputMode="decimal"
                        placeholder="e.g. 500.00"
                        disabled={isSubmitting}
                        {...form.register("ownerShareAmount")}
                      />
                      <FieldError
                        errors={[form.formState.errors.ownerShareAmount]}
                      />
                    </Field>

                    <Field data-invalid={!!form.formState.errors.ownerNotes}>
                      <FieldLabel htmlFor="edit-ownerNotes">Notes (optional)</FieldLabel>
                      <Textarea
                        id="edit-ownerNotes"
                        rows={2}
                        disabled={isSubmitting}
                        {...form.register("ownerNotes")}
                      />
                      <FieldError errors={[form.formState.errors.ownerNotes]} />
                    </Field>
                  </>
                ) : null}
              </div>
            </FieldGroup>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-28">
              {isSubmitting ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
