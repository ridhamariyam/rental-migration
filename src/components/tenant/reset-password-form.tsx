"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  CheckIcon,
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
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validation/auth";
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

export function ResetPasswordForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
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

    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
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
        <Field data-invalid={!!form.formState.errors.newPassword}>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <div className="relative">
            <LockIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="newPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
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
          <FieldLabel htmlFor="confirmPassword">
            Confirm new password
          </FieldLabel>
          <div className="relative">
            <LockIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              aria-invalid={!!form.formState.errors.confirmPassword}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("confirmPassword", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.confirmPassword]} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={isSubmitting} className="h-10 w-full">
        {isSubmitting ? (
          <>
            <Spinner />
            Setting password…
          </>
        ) : (
          "Set new password"
        )}
      </Button>
    </form>
  );
}
