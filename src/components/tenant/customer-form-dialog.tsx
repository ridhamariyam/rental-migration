"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, MapPinIcon, UserIcon } from "lucide-react";

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
import { PhoneInput } from "@/components/admin/phone-input";
import { Spinner } from "@/components/ui/spinner";
import {
  customerFormSchema,
  type CustomerFormInput,
} from "@/lib/validation/customers";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { CustomerRow } from "@/server/customers/service";

/**
 * Quick-create dialog for a customer — purely controlled (`open`/
 * `onOpenChange`, no built-in trigger) so it can be opened from an inline
 * "+ Add customer" option inside a picker (e.g. the booking form's
 * `CustomerPicker`) without losing progress on the form behind it.
 */
export function CustomerFormDialog({
  open,
  onOpenChange,
  onSuccess,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (customer: CustomerRow) => void;
  /** Prefill from whatever the caller already typed (e.g. a picker's
   * search box) so the person isn't retyping what they just searched. */
  initialValues?: { firstName?: string; phone?: string };
}) {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CustomerFormInput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      firstName: initialValues?.firstName ?? "",
      lastName: "",
      phone: initialValues?.phone ?? "",
      email: "",
      location: "",
      notes: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  // The dialog stays mounted between opens, so reset it fresh (with
  // whatever the caller wants prefilled this time) every time it reopens.
  useEffect(() => {
    if (open) {
      form.reset({
        firstName: initialValues?.firstName ?? "",
        lastName: "",
        phone: initialValues?.phone ?? "",
        email: "",
        location: "",
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const customer = await apiRequest<CustomerRow>("/api/customers", {
        method: "POST",
        body: JSON.stringify(values),
      });
      onOpenChange(false);
      onSuccess?.(customer);
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "phone" || fieldError.field === "email") {
            form.setError(fieldError.field as "phone" | "email", {
              message: fieldError.message,
            });
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
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
          <DialogDescription>
            Create a new customer without losing this booking in progress.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 overflow-hidden min-h-0"
        >
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
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.firstName}>
                  <FieldLabel htmlFor="customer-dialog-firstName">
                    First name
                  </FieldLabel>
                  <div className="relative">
                    <UserIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                    <Input
                      id="customer-dialog-firstName"
                      autoFocus
                      autoComplete="given-name"
                      aria-invalid={!!form.formState.errors.firstName}
                      disabled={isSubmitting}
                      className="pl-8"
                      {...form.register("firstName", {
                        onChange: () => setFormError(null),
                      })}
                    />
                  </div>
                  <FieldError errors={[form.formState.errors.firstName]} />
                </Field>

                <Field data-invalid={!!form.formState.errors.lastName}>
                  <FieldLabel htmlFor="customer-dialog-lastName">
                    Last name
                  </FieldLabel>
                  <Input
                    id="customer-dialog-lastName"
                    autoComplete="family-name"
                    aria-invalid={!!form.formState.errors.lastName}
                    disabled={isSubmitting}
                    {...form.register("lastName", {
                      onChange: () => setFormError(null),
                    })}
                  />
                  <FieldError errors={[form.formState.errors.lastName]} />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.phone}>
                <FieldLabel htmlFor="customer-dialog-phone">Phone</FieldLabel>
                <Controller
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <PhoneInput
                      id="customer-dialog-phone"
                      countryLabel="Customer phone country code"
                      value={field.value ?? ""}
                      onChange={(next) => {
                        field.onChange(next);
                        setFormError(null);
                      }}
                      onBlur={field.onBlur}
                      invalid={!!form.formState.errors.phone}
                      disabled={isSubmitting}
                    />
                  )}
                />
                <FieldError errors={[form.formState.errors.phone]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.email}>
                <FieldLabel htmlFor="customer-dialog-email">
                  Email (optional)
                </FieldLabel>
                <Input
                  id="customer-dialog-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={!!form.formState.errors.email}
                  disabled={isSubmitting}
                  {...form.register("email", {
                    onChange: () => setFormError(null),
                  })}
                />
                <FieldError errors={[form.formState.errors.email]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.location}>
                <FieldLabel htmlFor="customer-dialog-location">
                  Location (optional)
                </FieldLabel>
                <div className="relative">
                  <MapPinIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                  <Input
                    id="customer-dialog-location"
                    placeholder="e.g. Andheri, Mumbai"
                    aria-invalid={!!form.formState.errors.location}
                    disabled={isSubmitting}
                    className="pl-8"
                    {...form.register("location", {
                      onChange: () => setFormError(null),
                    })}
                  />
                </div>
                <FieldError errors={[form.formState.errors.location]} />
              </Field>
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
                "Add customer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
