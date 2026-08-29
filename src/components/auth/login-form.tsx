"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import {
  AlertCircleIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
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
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";

type Credentials = { email: string; password: string };

/**
 * Only ever follow a same-origin, single-segment-rooted path from this
 * query param — never hand it straight to `router.push`. Otherwise a
 * crafted `?redirectTo=https://evil.example` (or a protocol-relative
 * `//evil.example`) link could send a signed-in user somewhere else right
 * after login (open redirect).
 */
function safeRedirectTarget(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}

/**
 * Shared email/password sign-in form behind both `/admin/login` and
 * `/login` — same fields, same validation shape, same error handling;
 * only the resolver (login-value floor differs per schema), the API route
 * it posts to, and the default post-login destination differ between the
 * two surfaces. Takes an already-built `resolver` (each wrapper calls its
 * own `zodResolver(itsSchema)`) rather than a raw Zod schema — `zodResolver`
 * has generic overloads that don't play well with a schema typed through a
 * shared, looser `ZodType<Credentials>` prop.
 */
export function LoginForm({
  resolver,
  apiPath,
  defaultRedirectTo,
}: {
  resolver: Resolver<Credentials>;
  apiPath: string;
  defaultRedirectTo: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirectTarget(
    searchParams.get("redirectTo"),
    defaultRedirectTo,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Credentials>({
    resolver,
    defaultValues: { email: "", password: "" },
    // Validate a field as soon as it's left (blur), then live as it's
    // corrected — catches bad input before the backend is ever called,
    // instead of only after a failed submit.
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(apiPath, {
        method: "POST",
        body: JSON.stringify(values),
      });
      router.push(redirectTo);
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
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <div className="relative">
            <MailIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={!!form.formState.errors.email}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("email", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.email]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <div className="relative">
            <LockIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              aria-invalid={!!form.formState.errors.password}
              disabled={isSubmitting}
              className="pr-9 pl-8"
              {...form.register("password", {
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
          <FieldError errors={[form.formState.errors.password]} />
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={isSubmitting} className="h-10 w-full">
        {isSubmitting ? (
          <>
            <Spinner />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
