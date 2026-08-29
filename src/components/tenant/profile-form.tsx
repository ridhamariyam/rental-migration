"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, CheckCircle2Icon, UserIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validation/profile";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ProfileRow } from "@/server/profile/service";

/**
 * The "Profile" page's own edit form (any signed-in tenant role). Kept
 * deliberately narrow — see `updateProfileSchema`'s doc comment for why
 * email/role/scope aren't editable here. A successful save calls
 * `router.refresh()` so every server-rendered avatar on the page (sidebar
 * footer, etc.) picks up the new photo/name immediately, same as
 * `OutletForm`/`ProductForm`'s own post-save refresh.
 */
export function ProfileForm({ user }: { user: ProfileRow }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? "",
      avatarUrl: user.avatarUrl ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setJustSaved(false);

    try {
      await apiRequest("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      setJustSaved(true);
      router.refresh();
    } catch (error) {
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
            Profile updated
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="avatarUrl">Photo</FieldLabel>
          <Controller
            control={form.control}
            name="avatarUrl"
            render={({ field }) => (
              <ImageUploadField
                value={field.value ?? ""}
                onChange={(url) => {
                  field.onChange(url);
                  setJustSaved(false);
                }}
                disabled={isSubmitting}
                endpoint="/api/uploads/avatar"
                rounded
              />
            )}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.firstName}>
            <FieldLabel htmlFor="firstName">First name</FieldLabel>
            <div className="relative">
              <UserIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="firstName"
                aria-invalid={!!form.formState.errors.firstName}
                disabled={isSubmitting}
                className="pl-8"
                {...form.register("firstName", {
                  onChange: () => setJustSaved(false),
                })}
              />
            </div>
            <FieldError errors={[form.formState.errors.firstName]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.lastName}>
            <FieldLabel htmlFor="lastName">Last name</FieldLabel>
            <Input
              id="lastName"
              aria-invalid={!!form.formState.errors.lastName}
              disabled={isSubmitting}
              {...form.register("lastName", {
                onChange: () => setJustSaved(false),
              })}
            />
            <FieldError errors={[form.formState.errors.lastName]} />
          </Field>
        </div>

        <Field>
          <FieldLabel>Email</FieldLabel>
          <Input value={user.email} disabled readOnly />
          <p className="text-muted-foreground text-xs">
            Your email is your login — contact your business owner to change
            it.
          </p>
        </Field>

        <Field data-invalid={!!form.formState.errors.phone}>
          <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                id="phone"
                countryLabel="Phone country code"
                value={field.value ?? ""}
                onChange={(next) => {
                  field.onChange(next);
                  setJustSaved(false);
                }}
                onBlur={field.onBlur}
                invalid={!!form.formState.errors.phone}
                disabled={isSubmitting}
                allowEmpty
              />
            )}
          />
          <FieldError errors={[form.formState.errors.phone]} />
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
