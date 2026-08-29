"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  TriangleAlertIcon,
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";

type ResetPasswordResponse = {
  staff: { id: string };
  temporaryPassword: string;
};

/**
 * Admin-initiated "Reset password" for a staff/manager account (see
 * `resetStaffPassword`'s doc comment in `server/staff/service.ts` for the
 * security reasoning). Two-phase dialog, same "shown exactly once" rule
 * as `StaffCredentialsHandover`: confirm, then reveal the new temporary
 * password inline — the account's every existing session is already
 * invalidated by the time this reveal renders, so there's no window where
 * both the old and new credentials work.
 */
export function StaffResetPasswordAction({
  staffId,
  email,
}: {
  staffId: string;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await apiRequest<ResetPasswordResponse>(
        `/api/staff/${staffId}/reset-password`,
        { method: "POST" },
      );
      setTemporaryPassword(result.temporaryPassword);
    } catch (submitError) {
      setError(
        submitError instanceof ApiClientError
          ? submitError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable — the password is still visible
      // on screen either way.
    }
  };

  const handleDone = () => {
    setOpen(false);
    setTemporaryPassword(null);
    setCopied(false);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Once the new password is revealed, closing this dialog any
        // other way (backdrop click, Escape) still needs to refresh the
        // page — `mustChangePassword` just flipped server-side.
        if (!next && temporaryPassword) {
          handleDone();
          return;
        }
        setOpen(next);
        if (!next) {
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
        <KeyRoundIcon />
        Reset password
      </DialogTrigger>

      <DialogContent>
        {temporaryPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>Password reset</DialogTitle>
              <DialogDescription>
                Share this with them securely — it will not be shown again.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-5">
              <Alert className="border-primary/25 bg-primary/5">
                <TriangleAlertIcon className="text-primary" />
                <AlertDescription className="text-primary font-medium">
                  Every device they were signed in on has been signed out.
                </AlertDescription>
              </Alert>

              <Field>
                <FieldLabel>Login email</FieldLabel>
                <div className="bg-muted rounded-lg border px-3 py-2 font-mono text-sm">
                  {email}
                </div>
              </Field>

              <Field>
                <FieldLabel>New temporary password</FieldLabel>
                <div className="flex items-center gap-2">
                  <div className="bg-muted flex-1 truncate rounded-lg border px-3 py-2 font-mono text-sm">
                    {temporaryPassword}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copy temporary password"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <CheckIcon className="text-primary" />
                    ) : (
                      <CopyIcon />
                    )}
                  </Button>
                </div>
              </Field>

              <p className="text-muted-foreground text-sm">
                They must sign in with this password and will be required to
                set a new one immediately.
              </p>
            </DialogBody>

            <DialogFooter>
              <Button type="button" onClick={handleDone}>
                I&rsquo;ve stored it — done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset this account&rsquo;s password?</DialogTitle>
              <DialogDescription>
                Generates a new one-time password and immediately signs them
                out of every device. They&rsquo;ll be required to set their
                own new password on next login.
              </DialogDescription>
            </DialogHeader>

            {error ? (
              <DialogBody>
                <Alert
                  variant="destructive"
                  className="border-destructive/25 bg-destructive/5"
                >
                  <AlertCircleIcon />
                  <AlertDescription className="text-destructive font-medium">
                    {error}
                  </AlertDescription>
                </Alert>
              </DialogBody>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting}
                onClick={handleConfirm}
              >
                {isSubmitting ? (
                  <>
                    <Spinner />
                    Resetting…
                  </>
                ) : (
                  <>
                    <KeyRoundIcon />
                    Reset password
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
