"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, MapPinIcon, UserIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { CustomerListItem } from "@/server/customers/service";

export function CustomerForm({ customer }: { customer?: CustomerListItem }) {
  const router = useRouter();
  const isEditing = Boolean(customer);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CustomerFormInput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      firstName: customer?.firstName ?? "",
      lastName: customer?.lastName ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      location: customer?.location ?? "",
      notes: customer?.notes ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await apiRequest<{ id: string }>(
        isEditing ? `/api/customers/${customer!.id}` : "/api/customers",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );

      if (isEditing) {
        router.push(`${tenantPaths.customers}/${result.id}`);
      } else {
        router.push(`${tenantPaths.customers}/${result.id}?created=1`);
      }
      router.refresh();
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
          <Field data-invalid={!!form.formState.errors.firstName}>
            <FieldLabel htmlFor="firstName">First name</FieldLabel>
            <div className="relative">
              <UserIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="firstName"
                autoComplete="given-name"
                autoFocus
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
            <FieldLabel htmlFor="lastName">Last name</FieldLabel>
            <Input
              id="lastName"
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
          <FieldLabel htmlFor="phone">Phone</FieldLabel>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                id="phone"
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
          <FieldLabel htmlFor="email">Email (optional)</FieldLabel>
          <Input
            id="email"
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
          <FieldLabel htmlFor="location">
            Location (optional)
          </FieldLabel>
          <div className="relative">
            <MapPinIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="location"
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

        <Field data-invalid={!!form.formState.errors.notes}>
          <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
          <Textarea
            id="notes"
            rows={3}
            placeholder="Anything worth remembering about this customer…"
            aria-invalid={!!form.formState.errors.notes}
            disabled={isSubmitting}
            {...form.register("notes", {
              onChange: () => setFormError(null),
            })}
          />
          <FieldError errors={[form.formState.errors.notes]} />
        </Field>
      </FieldGroup>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push(tenantPaths.customers)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-32">
          {isSubmitting ? (
            <>
              <Spinner />
              {isEditing ? "Saving…" : "Creating…"}
            </>
          ) : isEditing ? (
            "Save changes"
          ) : (
            "Create customer"
          )}
        </Button>
      </div>
    </form>
  );
}
