"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import {
  AlertCircleIcon,
  ArrowRightIcon,
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
 *
 * `assistiveAction` is an optional slot on the password row (the tenant
 * screen puts its "Forgot password?" disclosure there). It is a slot rather
 * than a `forgotPasswordHref` prop because there is no forgot-password
 * *route* in this app — accounts are administrator-provisioned — so what
 * belongs there differs per surface.
 */
export function LoginForm({
  resolver,
  apiPath,
  defaultRedirectTo,
  assistiveAction,
}: {
  resolver: Resolver<Credentials>;
  apiPath: string;
  defaultRedirectTo: string;
  assistiveAction?: ReactNode;
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

  // 48px tall, 10px corners, one hairline border — the field metrics the
  // sign-in screens are laid out around. Declared once so email and
  // password can't drift apart.
  const fieldClass =
    "h-12 rounded-[10px] border-auth-line bg-white text-[15px] text-auth-ink placeholder:text-auth-muted/70 md:text-[15px]";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError ? (
        <Alert
          variant="destructive"
          className="border-auth-danger/25 bg-auth-danger/5 rounded-[10px]"
        >
          <AlertCircleIcon className="text-auth-danger" />
          <AlertDescription className="text-auth-danger font-medium">
            {formError}
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="gap-5">
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel
            htmlFor="email"
            className="text-auth-ink text-[13px] font-medium"
          >
            Email address
          </FieldLabel>
          <div className="relative">
            <MailIcon className="text-auth-muted pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2" />
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              aria-invalid={!!form.formState.errors.email}
              disabled={isSubmitting}
              className={`${fieldClass} pl-11`}
              {...form.register("email", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.email]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.password}>
          <FieldLabel
            htmlFor="password"
            className="text-auth-ink text-[13px] font-medium"
          >
            Password
          </FieldLabel>
          <div className="relative">
            <LockIcon className="text-auth-muted pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-invalid={!!form.formState.errors.password}
              disabled={isSubmitting}
              className={`${fieldClass} pr-12 pl-11`}
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
              aria-controls="password"
              className="text-auth-muted hover:text-auth-ink focus-visible:ring-ring/50 focus-visible:text-auth-ink absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[10px] transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOffIcon className="size-[18px]" aria-hidden="true" />
              ) : (
                <EyeIcon className="size-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>
          <FieldError errors={[form.formState.errors.password]} />
        </Field>
      </FieldGroup>

      {assistiveAction ? <div className="-mt-1">{assistiveAction}</div> : null}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full gap-2 rounded-[10px] text-[15px] font-medium transition-colors duration-200 hover:bg-[color-mix(in_oklch,var(--primary),black_8%)]"
      >
        {isSubmitting ? (
          <>
            <Spinner />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </form>
  );
}
