"use client";

import { useState } from "react";
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
import { OutletMultiSelect } from "@/components/tenant/outlet-multi-select";
import {
  createVariationSchema,
  type CreateVariationInput,
} from "@/lib/validation/variations";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { VariationRow } from "@/server/variations/service";

/**
 * Purely controlled (`open`/`onOpenChange`, no built-in trigger) — same
 * reasoning as `CategoryFormDialog`. Leaving SKU/barcode blank
 * auto-generates both server-side; they're optional overrides for matching
 * an already-printed physical label.
 */
export function AddVariationDialog({
  open,
  onOpenChange,
  productId,
  outlets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  outlets: { id: string; name: string; code: string }[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pickedOwner, setPickedOwner] = useState<PickedCustomer | null>(null);

  const form = useForm<CreateVariationInput>({
    resolver: zodResolver(createVariationSchema),
    defaultValues: {
      color: "",
      size: "",
      rentPrice: "",
      securityDeposit: "0",
      quantity: "1",
      outletIds: outlets[0] ? [outlets[0].id] : [],
      sku: "",
      barcode: "",
      image: "",
      ownershipType: "shop_owned",
      ownerName: "",
      ownerPhone: "",
      ownerCustomerId: "",
      ownerSharePercentage: "",
      ownerNotes: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const ownershipType = useWatch({ control: form.control, name: "ownershipType" });
  const outletIds = useWatch({ control: form.control, name: "outletIds" }) ?? [];
  const multipleOutlets = outletIds.length > 1;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest<VariationRow[]>(`/api/products/${productId}/variations`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      onOpenChange(false);
      form.reset({
        color: "",
        size: "",
        rentPrice: "",
        securityDeposit: "0",
        quantity: "1",
        outletIds: outlets[0] ? [outlets[0].id] : [],
        sku: "",
        barcode: "",
        image: "",
        ownershipType: "shop_owned",
        ownerName: "",
        ownerPhone: "",
        ownerCustomerId: "",
        ownerSharePercentage: "",
        ownerNotes: "",
      });
      setPickedOwner(null);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "sku" ||
            fieldError.field === "barcode" ||
            fieldError.field === "outletIds" ||
            fieldError.field === "ownerName" ||
            fieldError.field === "ownerSharePercentage"
          ) {
            form.setError(
              fieldError.field as
                | "sku"
                | "barcode"
                | "outletIds"
                | "ownerName"
                | "ownerSharePercentage",
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add item</DialogTitle>
          <DialogDescription>
            A physical, barcoded copy of this product.
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
              <FieldLabel htmlFor="image">Item photo (optional)</FieldLabel>
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
              {multipleOutlets ? (
                <p className="text-muted-foreground text-xs">
                  Each outlet&rsquo;s copy starts with this photo — swap it
                  later from that item&rsquo;s own Edit dialog.
                </p>
              ) : null}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.color}>
                <FieldLabel htmlFor="color">Color (optional)</FieldLabel>
                <Input
                  id="color"
                  disabled={isSubmitting}
                  {...form.register("color")}
                />
                <FieldError errors={[form.formState.errors.color]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.size}>
                <FieldLabel htmlFor="size">Size (optional)</FieldLabel>
                <Input
                  id="size"
                  disabled={isSubmitting}
                  {...form.register("size")}
                />
                <FieldError errors={[form.formState.errors.size]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.rentPrice}>
                <FieldLabel htmlFor="rentPrice">Rental price</FieldLabel>
                <Input
                  id="rentPrice"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={isSubmitting}
                  {...form.register("rentPrice")}
                />
                <FieldError errors={[form.formState.errors.rentPrice]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.securityDeposit}>
                <FieldLabel htmlFor="securityDeposit">
                  Security deposit
                </FieldLabel>
                <Input
                  id="securityDeposit"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={isSubmitting}
                  {...form.register("securityDeposit")}
                />
                <FieldError errors={[form.formState.errors.securityDeposit]} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.quantity}>
                <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
                <Input
                  id="quantity"
                  inputMode="numeric"
                  disabled={isSubmitting}
                  {...form.register("quantity")}
                />
                <FieldError errors={[form.formState.errors.quantity]} />
              </Field>
            </div>

            <Field data-invalid={!!form.formState.errors.outletIds}>
              <FieldLabel htmlFor="outletIds">Outlets</FieldLabel>
              <Controller
                control={form.control}
                name="outletIds"
                render={({ field }) => (
                  <OutletMultiSelect
                    id="outletIds"
                    outlets={outlets}
                    value={field.value ?? []}
                    onChange={(next) => {
                      field.onChange(next);
                      if (next.length > 1) {
                        // A manual sku/barcode only applies to one physical
                        // item — clear any leftover value the moment a
                        // second outlet is added, so a stale value can't
                        // silently fail the superRefine check at submit.
                        form.setValue("sku", "");
                        form.setValue("barcode", "");
                      }
                    }}
                    disabled={isSubmitting}
                    invalid={!!form.formState.errors.outletIds}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.outletIds]} />
              {multipleOutlets ? (
                <p className="text-muted-foreground text-xs">
                  Adding to {outletIds.length} outlets creates {outletIds.length}{" "}
                  separate barcoded items, one per outlet.
                </p>
              ) : null}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.sku}>
                <FieldLabel htmlFor="sku">SKU (optional)</FieldLabel>
                <Input
                  id="sku"
                  placeholder={
                    multipleOutlets
                      ? "Auto-generated for each outlet"
                      : "Auto-generated if left blank"
                  }
                  disabled={isSubmitting || multipleOutlets}
                  {...form.register("sku")}
                />
                <FieldError errors={[form.formState.errors.sku]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.barcode}>
                <FieldLabel htmlFor="barcode">Barcode (optional)</FieldLabel>
                <Input
                  id="barcode"
                  placeholder={
                    multipleOutlets
                      ? "Auto-generated for each outlet"
                      : "Auto-generated if left blank"
                  }
                  disabled={isSubmitting || multipleOutlets}
                  {...form.register("barcode")}
                />
                <FieldError errors={[form.formState.errors.barcode]} />
              </Field>
            </div>

            <div className="flex flex-col gap-4 border-t pt-4">
              <Field data-invalid={!!form.formState.errors.ownershipType}>
                <FieldLabel htmlFor="ownershipType">Ownership</FieldLabel>
                <Controller
                  control={form.control}
                  name="ownershipType"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="ownershipType" className="w-full">
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
                      <FieldLabel htmlFor="ownerName">Owner name</FieldLabel>
                      <Input
                        id="ownerName"
                        disabled={isSubmitting}
                        {...form.register("ownerName")}
                      />
                      <FieldError errors={[form.formState.errors.ownerName]} />
                    </Field>
                    <Field data-invalid={!!form.formState.errors.ownerPhone}>
                      <FieldLabel htmlFor="ownerPhone">
                        Owner phone (optional)
                      </FieldLabel>
                      <Input
                        id="ownerPhone"
                        disabled={isSubmitting}
                        {...form.register("ownerPhone")}
                      />
                      <FieldError errors={[form.formState.errors.ownerPhone]} />
                    </Field>
                  </div>

                  <Field data-invalid={!!form.formState.errors.ownerSharePercentage}>
                    <FieldLabel htmlFor="ownerSharePercentage">
                      Owner&rsquo;s revenue share (%)
                    </FieldLabel>
                    <Input
                      id="ownerSharePercentage"
                      inputMode="decimal"
                      placeholder="e.g. 60"
                      disabled={isSubmitting}
                      {...form.register("ownerSharePercentage")}
                    />
                    <FieldError
                      errors={[form.formState.errors.ownerSharePercentage]}
                    />
                  </Field>

                  <Field data-invalid={!!form.formState.errors.ownerNotes}>
                    <FieldLabel htmlFor="ownerNotes">Notes (optional)</FieldLabel>
                    <Textarea
                      id="ownerNotes"
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
