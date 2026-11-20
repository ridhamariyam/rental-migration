"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  type PlanCatalog,
  PLAN_FEATURES,
  formatRupees,
  signupTotal,
  type PlanId,
} from "@/lib/plans";
import {
  CheckoutDismissedError,
  openRazorpayCheckout,
  type CheckoutSessionPayload,
} from "@/lib/razorpay-checkout";
import { cn } from "@/lib/utils";
import { signupSchema, type SignupInput } from "@/lib/validation/billing";

type FormValues = z.input<typeof signupSchema>;
type VerifyResult = { status: "ready" | "signin" | "attention" };
type Purchase = {
  status: "ready" | "signin";
  businessName: string;
  planName: string;
  total: number;
};

const fieldClass =
  "h-11 rounded-[10px] border-auth-line bg-white text-[15px] text-auth-ink placeholder:text-auth-muted/70 md:text-[15px]";
const labelClass = "text-auth-ink text-[13px] font-medium";

/**
 * Public "Buy" flow: pick a plan, enter the business and owner details,
 * pay with Razorpay. Payment success creates the account on the server
 * (`/api/billing/signup/verify`) and signs the owner straight in, so they
 * land in their own, empty dashboard with the plan already active.
 */
export function SignupForm({
  initialPlan,
  plans,
}: {
  initialPlan: PlanId;
  plans: PlanCatalog;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [stage, setStage] = useState<"form" | "paying" | "verifying" | "done">("form");
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [attention, setAttention] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormValues, unknown, SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      plan: initialPlan,
      businessName: "",
      businessEmail: "",
      businessPhone: "",
      address: "",
      ownerFirstName: "",
      ownerLastName: "",
      ownerEmail: "",
      ownerPhone: "",
      password: "",
      confirmPassword: "",
      // The checkbox starts unticked; the schema only accepts `true`.
      acceptTerms: false as unknown as true,
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const planId = useWatch({ control: form.control, name: "plan" }) as PlanId;
  const plan = plans[planId] ?? plans.yearly;
  const total = signupTotal(plan);
  const busy = stage !== "form" || form.formState.isSubmitting;
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await apiRequest<CheckoutSessionPayload>("/api/billing/signup", {
        method: "POST",
        body: JSON.stringify(values),
      });

      setStage("paying");
      const result = await openRazorpayCheckout(session);

      setStage("verifying");
      const verified = await apiRequest<VerifyResult>("/api/billing/signup/verify", {
        method: "POST",
        body: JSON.stringify(result),
      });

      if (verified.status === "ready" || verified.status === "signin") {
        // Show the success modal first; its button takes them on.
        setStage("done");
        setPurchase({
          status: verified.status,
          businessName: values.businessName,
          planName: plan.name,
          total,
        });
        return;
      }
      setAttention(
        "Payment received. We're finishing your account setup and will contact you shortly on your business phone.",
      );
    } catch (error) {
      setStage("form");
      if (error instanceof CheckoutDismissedError) {
        setFormError("Payment was cancelled. Your details are still here. Pay whenever you're ready.");
        return;
      }
      if (error instanceof ApiClientError) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field in values) {
            form.setError(fieldError.field as Path<FormValues>, { message: fieldError.message });
          }
        }
        setFormError(error.message);
        return;
      }
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  });

  const continueAfterPurchase = () => {
    if (purchase?.status === "ready") {
      router.push("/dashboard");
      router.refresh();
    } else {
      router.push("/login");
    }
  };

  if (attention) {
    return (
      <div className="border-auth-line mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-white p-8 text-center">
        <CheckCircle2Icon className="text-primary size-10" aria-hidden="true" />
        <h2 className="text-xl font-medium tracking-tight">Thank you!</h2>
        <p className="text-auth-muted text-sm">{attention}</p>
      </div>
    );
  }

  const textField = (
    name: Path<FormValues>,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => {
    const error = errors[name as keyof typeof errors] as { message?: string } | undefined;
    return (
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={name} className={labelClass}>
          {label}
        </FieldLabel>
        <Input
          id={name}
          aria-invalid={!!error}
          disabled={busy}
          className={fieldClass}
          {...props}
          {...form.register(name, { onChange: () => setFormError(null) })}
        />
        <FieldError errors={[error]} />
      </Field>
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {/* Plan */}
        <section className="border-auth-line rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-base font-medium tracking-tight">1. Choose your plan</h2>
          <Controller
            control={form.control}
            name="plan"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Plan" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.values(plans).map((option) => {
                  const selected = field.value === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={busy}
                      onClick={() => field.onChange(option.id)}
                      className={cn(
                        "relative flex flex-col items-start rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected
                          ? "border-primary bg-primary/5 ring-primary ring-1"
                          : "border-auth-line hover:bg-neutral-50",
                      )}
                    >
                      {option.id === "yearly" ? (
                        <span className="bg-primary absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
                          Best value
                        </span>
                      ) : null}
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{option.name}</span>
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full border",
                            selected ? "border-primary bg-primary text-white" : "border-auth-line",
                          )}
                          aria-hidden="true"
                        >
                          {selected ? <CheckIcon className="size-3" /> : null}
                        </span>
                      </span>
                      <span className="mt-2 text-2xl font-medium tracking-tight">
                        {formatRupees(option.price)}
                        <span className="text-auth-muted text-sm font-normal"> / {option.periodLabel}</span>
                      </span>
                      <span className="text-auth-muted mt-1 text-xs">{option.tagline}</span>
                    </button>
                  );
                })}
              </div>
            )}
          />
        </section>

        {/* Business */}
        <section className="border-auth-line rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-base font-medium tracking-tight">2. Your business</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {textField("businessName", "Business name", { autoComplete: "organization", placeholder: "e.g. Royal Bridal Rentals" })}
            </div>
            {textField("businessEmail", "Business email", { type: "email", inputMode: "email", autoComplete: "email", placeholder: "shop@example.com" })}
            {textField("businessPhone", "Business phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+91 98765 43210" })}
            <div className="sm:col-span-2">
              <Field data-invalid={!!errors.address}>
                <FieldLabel htmlFor="address" className={labelClass}>
                  Address <span className="text-auth-muted font-normal">(optional)</span>
                </FieldLabel>
                <Textarea
                  id="address"
                  rows={2}
                  disabled={busy}
                  placeholder="Street, city, PIN"
                  className="border-auth-line rounded-[10px] bg-white text-[15px] md:text-[15px]"
                  {...form.register("address")}
                />
                <FieldError errors={[errors.address]} />
              </Field>
            </div>
          </div>
        </section>

        {/* Owner */}
        <section className="border-auth-line rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="text-base font-medium tracking-tight">3. Your login</h2>
          <p className="text-auth-muted mt-1 text-sm">You&apos;ll sign in with this email and password.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {textField("ownerFirstName", "First name", { autoComplete: "given-name" })}
            {textField("ownerLastName", "Last name", { autoComplete: "family-name" })}
            {textField("ownerEmail", "Login email", { type: "email", inputMode: "email", autoComplete: "username", placeholder: "you@example.com" })}
            {textField("ownerPhone", "Mobile (optional)", { type: "tel", inputMode: "tel", autoComplete: "tel" })}

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password" className={labelClass}>
                Password
              </FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  disabled={busy}
                  className={`${fieldClass} pr-11`}
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="text-auth-muted hover:text-auth-ink absolute inset-y-0 right-0 flex w-11 items-center justify-center"
                >
                  {showPassword ? <EyeOffIcon className="size-[18px]" /> : <EyeIcon className="size-[18px]" />}
                </button>
              </div>
              <p className="text-auth-muted text-xs">10+ characters, with upper and lower case letters and a number.</p>
              <FieldError errors={[errors.password]} />
            </Field>
            {textField("confirmPassword", "Confirm password", {
              type: showPassword ? "text" : "password",
              autoComplete: "new-password",
            })}
          </div>
        </section>
      </div>

      {/* Summary + pay */}
      <aside className="border-auth-line flex flex-col gap-5 rounded-2xl border bg-white p-5 sm:p-6 lg:sticky lg:top-6">
        <div>
          <h2 className="text-base font-medium tracking-tight">Order summary</h2>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-auth-muted">{plan.name} plan (1 {plan.periodLabel})</dt>
              <dd>{formatRupees(plan.price)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-auth-muted">One-time setup</dt>
              <dd>{formatRupees(plan.setupFee)}</dd>
            </div>
            <div className="border-auth-line mt-2 flex justify-between gap-3 border-t pt-3 text-base font-medium">
              <dt>Pay today</dt>
              <dd>{formatRupees(total)}</dd>
            </div>
          </dl>
          <p className="text-auth-muted mt-2 text-xs">
            Then {formatRupees(plan.price)} per {plan.periodLabel} to renew.
          </p>
        </div>

        <ul className="flex flex-col gap-2 text-sm">
          {PLAN_FEATURES.slice(0, 5).map((feature) => (
            <li key={feature} className="flex gap-2">
              <CheckIcon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <Controller
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <Field data-invalid={!!errors.acceptTerms}>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="acceptTerms"
                  checked={field.value === true}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={busy}
                  className="mt-0.5"
                />
                <Label htmlFor="acceptTerms" className="text-sm leading-snug font-normal">
                  I agree to pay {formatRupees(total)} now for the {plan.name.toLowerCase()} plan,
                  including the one-time setup fee.
                </Label>
              </div>
              <FieldError errors={[errors.acceptTerms]} />
            </Field>
          )}
        />

        {formError ? (
          <Alert variant="destructive" className="border-auth-danger/25 bg-auth-danger/5 rounded-[10px]">
            <AlertCircleIcon className="text-auth-danger" />
            <AlertDescription className="text-auth-danger font-medium">{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={busy} className="h-12 rounded-[10px] text-[15px]">
          {busy ? <Spinner /> : <LockIcon className="size-4" aria-hidden="true" />}
          {stage === "paying"
            ? "Complete payment in the window…"
            : stage === "verifying"
              ? "Creating your account…"
              : stage === "done"
                ? "Account created"
              : `Pay ${formatRupees(total)} & create account`}
        </Button>
        <p className="text-auth-muted flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
          Secure payment by Razorpay · UPI, cards, netbanking
        </p>
      </aside>

      {/* Portalled out of the form. Payment is done and the account
          exists, so closing it any way (button, Esc, overlay) moves the
          owner on — never back to the form. */}
      <Dialog
        open={purchase !== null}
        onOpenChange={(open) => {
          if (!open) continueAfterPurchase();
        }}
      >
        <DialogContent showCloseButton={false}>
          <div className="flex flex-col items-center gap-3 p-6 pt-8 text-center sm:p-8">
            <span className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
              <CheckCircle2Icon className="text-primary size-8" aria-hidden="true" />
            </span>
            <DialogTitle className="text-xl">Purchase successful!</DialogTitle>
            <DialogDescription className="text-[15px]">
              Welcome to RentQue{purchase ? `, ${purchase.businessName}` : ""}. Your{" "}
              {purchase?.planName.toLowerCase()} plan is active and your account is ready.
            </DialogDescription>
            {purchase ? (
              <p className="text-muted-foreground text-xs">
                Amount paid: {formatRupees(purchase.total)}
              </p>
            ) : null}
          </div>
          <DialogFooter className="sm:justify-center">
            <Button type="button" className="w-full sm:w-auto" onClick={continueAfterPurchase}>
              {purchase?.status === "ready" ? "Go to my dashboard" : "Sign in to your account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
