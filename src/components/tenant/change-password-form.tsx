"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  CheckIcon,
  CheckCircle2Icon,
  CircleIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
} from "lucide-react";

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
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import {
  changeOwnPasswordSchema,
  type ChangeOwnPasswordInput,
} from "@/lib/validation/profile";
import { ApiClientError, apiRequest } from "@/lib/api-client";

const passwordRules: { label: string; test: (value: string) => boolean }[] = [
  {
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  { label: "One lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "One uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "One number", test: (value) => /[0-9]/.test(value) },
];

/**
 * Genuine self-service password change — unlike `ResetPasswordForm` (the
 * forced first-login flow, no current-password field, redirects to the
 * dashboard on success), this stays on the Profile page and requires
 * proving the current password first (see `changeOwnPassword`'s doc
 * comment in `server/profile/service.ts`).
 */
export function ChangePasswordForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const form = useForm<ChangeOwnPasswordInput>({
    resolver: zodResolver(changeOwnPasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const newPassword = useWatch({
    control: form.control,
    name: "newPassword",
    defaultValue: "",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setJustSaved(false);

    try {
      await apiRequest("/api/profile/password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      form.reset();
      setJustSaved(true);
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "currentPassword" ||
            fieldError.field === "newPassword"
          ) {
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

      {justSaved ? (
        <Alert className="border-primary/25 bg-primary/5">
          <CheckCircle2Icon className="text-primary" />
          <AlertDescription className="text-primary font-medium">
            Password updated. You&apos;ll stay signed in here, but every other
            session was signed out.
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.currentPassword}>
          <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
          <div className="relative">
            <LockIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!form.formState.errors.currentPassword}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("currentPassword", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.currentPassword]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.newPassword}>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <div className="relative">
            <LockIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              aria-invalid={!!form.formState.errors.newPassword}
              disabled={isSubmitting}
              className="pr-9 pl-8"
              {...form.register("newPassword", {
                onChange: () => setFormError(null),
              })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              disabled={isSubmitting}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="text-muted-foreground hover:text-foreground focus-visible:text-foreground absolute inset-y-0 right-0 flex w-9 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOffIcon className="size-4" aria-hidden="true" />
              ) : (
                <EyeIcon className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <FieldError errors={[form.formState.errors.newPassword]} />

          <ul className="mt-1 flex flex-col gap-1">
            {passwordRules.map((rule) => {
              const met = rule.test(newPassword);
              return (
                <li
                  key={rule.label}
                  className={
                    met
                      ? "text-primary flex items-center gap-1.5 text-xs"
                      : "text-muted-foreground flex items-center gap-1.5 text-xs"
                  }
                >
                  {met ? (
                    <CheckIcon className="size-3.5" aria-hidden="true" />
                  ) : (
                    <CircleIcon className="size-3.5" aria-hidden="true" />
                  )}
                  {rule.label}
                </li>
              );
            })}
          </ul>
        </Field>

        <Field data-invalid={!!form.formState.errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            aria-invalid={!!form.formState.errors.confirmPassword}
            disabled={isSubmitting}
            {...form.register("confirmPassword", {
              onChange: () => setFormError(null),
            })}
          />
          <FieldError errors={[form.formState.errors.confirmPassword]} />
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Update password
        </Button>
      </div>
    </form>
  );
}
