"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  Building2Icon,
  CheckCircle2Icon,
  MailIcon,
} from "lucide-react";

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
import { Spinner } from "@/components/ui/spinner";
import { ImageUploadField } from "@/components/tenant/image-upload-field";
import { PhoneInput } from "@/components/admin/phone-input";
import {
  updateBusinessSchema,
  type UpdateBusinessInput,
} from "@/lib/validation/business";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ShopRow } from "@/server/business/service";

/**
 * "Business Settings" — the fix for the legacy backend gap CLAUDE.md
 * documents (a shop owner could never edit their own shop profile). Only
 * ever rendered on `/dashboard/business`, which the page itself gates
 * behind `Permission.SHOP_MANAGE` (admin-only) — this form has no
 * permission check of its own, same division of responsibility as every
 * other tenant form in this app.
 */
export function BusinessSettingsForm({ shop }: { shop: ShopRow }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const form = useForm<UpdateBusinessInput>({
    resolver: zodResolver(updateBusinessSchema),
    defaultValues: {
      name: shop.name,
      email: shop.email,
      phone: shop.phone,
      address: shop.address ?? "",
      logoUrl: shop.logoUrl ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setJustSaved(false);

    try {
      await apiRequest("/api/business", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setJustSaved(true);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "email" || fieldError.field === "phone") {
            form.setError(fieldError.field, { message: fieldError.message });
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

      {justSaved ? (
        <Alert className="border-primary/25 bg-primary/5">
          <CheckCircle2Icon className="text-primary" />
          <AlertDescription className="text-primary font-medium">
            Business settings updated
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="logoUrl">Logo</FieldLabel>
          <Controller
            control={form.control}
            name="logoUrl"
            render={({ field }) => (
              <ImageUploadField
                value={field.value ?? ""}
                onChange={(url) => {
                  field.onChange(url);
                  setJustSaved(false);
                }}
                disabled={isSubmitting}
                endpoint="/api/uploads/avatar"
              />
            )}
          />
        </Field>

        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="name">Business name</FieldLabel>
          <div className="relative">
            <Building2Icon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="name"
              aria-invalid={!!form.formState.errors.name}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("name", {
                onChange: () => setJustSaved(false),
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
              aria-invalid={!!form.formState.errors.email}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("email", {
                onChange: () => setJustSaved(false),
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
                value={field.value ?? ""}
                onChange={(next) => {
                  field.onChange(next);
                  setJustSaved(false);
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
          <Textarea
            id="address"
            rows={3}
            aria-invalid={!!form.formState.errors.address}
            disabled={isSubmitting}
            {...form.register("address", {
              onChange: () => setJustSaved(false),
            })}
          />
          <FieldError errors={[form.formState.errors.address]} />
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Save changes
        </Button>
      </div>
    </form>
  );
}
