"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  PencilIcon,
  SparklesIcon,
} from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Something went wrong. Please try again.";
}

function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
      <AlertCircleIcon />
      <AlertDescription className="text-destructive font-medium">{message}</AlertDescription>
    </Alert>
  );
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const selectClass =
  "border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// ---------------------------------------------------------------------------
// Edit plan / end date by hand (no payment recorded)
// ---------------------------------------------------------------------------

export function EditSubscriptionDialog({
  tenantId,
  plan,
  endsAt,
}: {
  tenantId: string;
  plan: "yearly" | "monthly" | "custom" | null;
  endsAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nextPlan, setNextPlan] = useState<string>(plan ?? "none");
  const [nextEndsAt, setNextEndsAt] = useState(toDateInput(endsAt));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearing = nextPlan === "none";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/tenants/${tenantId}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({
          plan: clearing ? null : nextPlan,
          endsAt: clearing ? null : nextEndsAt || null,
        }),
      });
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setNextPlan(plan ?? "none");
          setNextEndsAt(toDateInput(endsAt));
        } else {
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PencilIcon />
        Edit plan
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Edit subscription</DialogTitle>
            <DialogDescription>
              Change the plan or end date without recording a payment, e.g. for a free extension or a trial. To log money
              received, use “Record payment” instead.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="es-plan">Plan</FieldLabel>
                <select id="es-plan" className={selectClass} value={nextPlan} onChange={(e) => setNextPlan(e.target.value)}>
                  <option value="yearly">Yearly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom</option>
                  <option value="none">No plan (never locks)</option>
                </select>
              </Field>
              {!clearing ? (
                <Field>
                  <FieldLabel htmlFor="es-ends">Paid until</FieldLabel>
                  <Input id="es-ends" type="date" required value={nextEndsAt} onChange={(e) => setNextEndsAt(e.target.value)} />
                  <FieldDescription>
                    The business keeps access for 7 days of grace after this date, then it&apos;s locked until renewed.
                  </FieldDescription>
                </Field>
              ) : (
                <FieldDescription>
                  With no plan the business is never locked out. Use this for hand-provisioned or free accounts.
                </FieldDescription>
              )}
              <ErrorAlert message={error} />
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Demo account toggle
// ---------------------------------------------------------------------------

export function DemoToggleAction({
  tenantId,
  isDemo,
  otherDemoName,
}: {
  tenantId: string;
  isDemo: boolean;
  otherDemoName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/tenants/${tenantId}/demo`, {
        method: "PATCH",
        body: JSON.stringify({ isDemo: !isDemo }),
      });
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
        <SparklesIcon />
        {isDemo ? "Stop using as demo" : "Use as demo account"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDemo ? "Stop using this as the demo?" : "Make this the demo account?"}</DialogTitle>
          <DialogDescription>
            {isDemo
              ? "The “Try the demo” button on the website disappears, and anyone signed in to the demo is signed out."
              : `Visitors who click “Try the demo” on the website will be signed in to this business. Passwords and business settings become read-only.${otherDemoName ? ` “${otherDemoName}” stops being the demo.` : ""}`}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <DialogBody>
            <ErrorAlert message={error} />
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isSubmitting} onClick={confirm}>
            {isSubmitting ? <Spinner /> : null}
            {isDemo ? "Stop demo" : "Make demo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Owner password reset (temporary password shown once)
// ---------------------------------------------------------------------------

export function ResetOwnerPasswordAction({
  tenantId,
  userId,
  ownerName,
  disabledReason,
}: {
  tenantId: string;
  userId: string;
  ownerName: string;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function confirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await apiRequest<{ email: string; temporaryPassword: string }>(
        `/api/admin/tenants/${tenantId}/owner-password`,
        { method: "POST", body: JSON.stringify({ userId }) },
      );
      setResult(data);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(`Email: ${result.email}\nTemporary password: ${result.temporaryPassword}`);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the password is still visible to copy by hand.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setResult(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="sm" disabled={Boolean(disabledReason)} title={disabledReason} />}
      >
        <KeyRoundIcon />
        Reset password
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? "New temporary password" : `Reset ${ownerName}'s password?`}</DialogTitle>
          <DialogDescription>
            {result
              ? "Send this to the owner now. It is shown only once, and they'll be asked to choose a new password when they sign in."
              : "They're signed out everywhere and get a one-time temporary password, which you'll see on the next screen."}
          </DialogDescription>
        </DialogHeader>
        {result || error ? (
          <DialogBody>
            {result ? (
              <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-3 font-mono text-sm">
                <span className="break-all">{result.email}</span>
                <span className="text-base font-semibold break-all">{result.temporaryPassword}</span>
              </div>
            ) : null}
            <ErrorAlert message={error} />
          </DialogBody>
        ) : null}
        <DialogFooter>
          {result ? (
            <>
              <Button type="button" variant="outline" onClick={copy}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={isSubmitting} onClick={confirm}>
                {isSubmitting ? <Spinner /> : null}
                Reset password
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Resolve a flagged payment
// ---------------------------------------------------------------------------

export function ResolvePaymentAction({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/payments/${paymentId}`, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      });
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CheckIcon />
        Resolve
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Mark as resolved</DialogTitle>
            <DialogDescription>
              Note what you did, e.g. “Created the account by hand” or “Refunded on Razorpay”. It&apos;s saved on the payment.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="resolve-note">What was done</FieldLabel>
                <Textarea id="resolve-note" required maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <ErrorAlert message={error} />
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !note.trim()}>
              {isSubmitting ? <Spinner /> : null}
              Mark resolved
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
