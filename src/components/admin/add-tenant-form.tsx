"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  Building2Icon,
  MailIcon,
  MapPinIcon,
  UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhoneInput } from "@/components/admin/phone-input";
import { Spinner } from "@/components/ui/spinner";
import { TenantCredentialsHandover } from "@/components/admin/tenant-credentials-handover";
import {
  createTenantSchema,
  type CreateTenantInput,
} from "@/lib/validation/tenants";
import { adminPaths } from "@/lib/admin-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { TenantListItem } from "@/server/tenants/service";

type CreateTenantResponse = {
  tenant: TenantListItem;
  temporaryPassword: string;
};

type Handover = {
  tenantId: string;
  ownerEmail: string;
  temporaryPassword: string;
};

/**
 * "+ Add Tenant" form. Creating a tenant also provisions its first admin
 * user in the same step (Phase 5) — on success this swaps to a one-time
 * credentials handover instead of navigating away immediately, since the
 * generated password is never retrievable again after that. Field-level
 * duplicate-email/phone errors surfaced by the API (409 with
 * `errors: [{field, message}]`) are mapped onto the exact offending field
 * via `setError`, same as any other validation error.
 */
export function AddTenantForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [handover, setHandover] = useState<Handover | null>(null);
  // Flips to true only by a real keystroke in the owner email/phone field
  // itself (never by the auto-copy's own `setValue` call below) — this is
  // what lets the copy keep following the business field through multiple
  // edits, right up until the user actually types their own value.
  const [ownerEmailEdited, setOwnerEmailEdited] = useState(false);
  const [ownerPhoneEdited, setOwnerPhoneEdited] = useState(false);

  const form = useForm<CreateTenantInput>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "+91",
      address: "",
      ownerFirstName: "",
      ownerLastName: "",
      ownerEmail: "",
      ownerPhone: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await apiRequest<CreateTenantResponse>(
        "/api/admin/tenants",
        {
          method: "POST",
          body: JSON.stringify(values),
        },
      );
      setHandover({
        tenantId: result.tenant.id,
        ownerEmail: values.ownerEmail,
        temporaryPassword: result.temporaryPassword,
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "email" || fieldError.field === "phone") {
            form.setError(fieldError.field, { message: fieldError.message });
            mappedToField = true;
          }
        }
        // Every field error the server can currently return maps to one of
        // the two fields above, but if that ever changes, fall through to
        // the generic banner instead of silently doing nothing.
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

  if (handover) {
    return (
      <TenantCredentialsHandover
        tenantId={handover.tenantId}
        ownerEmail={handover.ownerEmail}
        temporaryPassword={handover.temporaryPassword}
      />
    );
  }

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
        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="name">Business name</FieldLabel>
          <div className="relative">
            <Building2Icon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="name"
              autoComplete="organization"
              autoFocus
              aria-invalid={!!form.formState.errors.name}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("name", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.name]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="email">Business email</FieldLabel>
          <div className="relative">
            <MailIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!form.formState.errors.email}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("email", {
                onChange: (event) => {
                  setFormError(null);
                  // Copy to the owner's login email until they type their
                  // own — the two are the same business more often than
                  // not, but this never overwrites a value already entered.
                  if (!ownerEmailEdited) {
                    form.setValue("ownerEmail", event.target.value, {
                      shouldDirty: false,
                    });
                  }
                },
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.email]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.phone}>
          <FieldLabel htmlFor="phone">Business phone</FieldLabel>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                id="phone"
                countryLabel="Business phone country code"
                value={field.value}
                onChange={(next) => {
                  field.onChange(next);
                  setFormError(null);
                  // Same idea as the email copy above, phone-shaped.
                  if (!ownerPhoneEdited) {
                    form.setValue("ownerPhone", next, { shouldDirty: false });
                  }
                }}
                onBlur={field.onBlur}
                invalid={!!form.formState.errors.phone}
                disabled={isSubmitting}
              />
            )}
          />
          <FieldError errors={[form.formState.errors.phone]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.address}>
          <FieldLabel htmlFor="address">Address (optional)</FieldLabel>
          <div className="relative">
            <MapPinIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="address"
              autoComplete="street-address"
              aria-invalid={!!form.formState.errors.address}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("address", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.address]} />
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-2 border-t pt-4">
        <UserIcon className="text-muted-foreground size-4" aria-hidden="true" />
        <p className="text-sm font-medium">Owner account</p>
      </div>
      <p className="text-muted-foreground -mt-3 text-sm">
        A login is created for this person, with a temporary password shown once
        you submit.
      </p>

      <FieldGroup>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.ownerFirstName}>
            <FieldLabel htmlFor="ownerFirstName">First name</FieldLabel>
            <Input
              id="ownerFirstName"
              autoComplete="given-name"
              aria-invalid={!!form.formState.errors.ownerFirstName}
              disabled={isSubmitting}
              {...form.register("ownerFirstName", {
                onChange: () => setFormError(null),
              })}
            />
            <FieldError errors={[form.formState.errors.ownerFirstName]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.ownerLastName}>
            <FieldLabel htmlFor="ownerLastName">Last name</FieldLabel>
            <Input
              id="ownerLastName"
              autoComplete="family-name"
              aria-invalid={!!form.formState.errors.ownerLastName}
              disabled={isSubmitting}
              {...form.register("ownerLastName", {
                onChange: () => setFormError(null),
              })}
            />
            <FieldError errors={[form.formState.errors.ownerLastName]} />
          </Field>
        </div>

        <Field data-invalid={!!form.formState.errors.ownerEmail}>
          <FieldLabel htmlFor="ownerEmail">Owner email (login)</FieldLabel>
          <div className="relative">
            <MailIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="ownerEmail"
              type="email"
              autoComplete="email"
              aria-invalid={!!form.formState.errors.ownerEmail}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("ownerEmail", {
                onChange: () => {
                  setFormError(null);
                  setOwnerEmailEdited(true);
                },
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.ownerEmail]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.ownerPhone}>
          <FieldLabel htmlFor="ownerPhone">Owner phone (optional)</FieldLabel>
          <Controller
            control={form.control}
            name="ownerPhone"
            render={({ field }) => (
              <PhoneInput
                id="ownerPhone"
                countryLabel="Owner phone country code"
                value={field.value ?? ""}
                onChange={(next) => {
                  field.onChange(next);
                  setFormError(null);
                  setOwnerPhoneEdited(true);
                }}
                onBlur={field.onBlur}
                invalid={!!form.formState.errors.ownerPhone}
                disabled={isSubmitting}
                allowEmpty
              />
            )}
          />
          <FieldError errors={[form.formState.errors.ownerPhone]} />
        </Field>
      </FieldGroup>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push(adminPaths.tenants)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-32">
          {isSubmitting ? (
            <>
              <Spinner />
              Creating…
            </>
          ) : (
            "Create tenant"
          )}
        </Button>
      </div>
    </form>
  );
}
