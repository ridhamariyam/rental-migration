"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { tenantPaths } from "@/lib/tenant-paths";

/**
 * Staff-flavored counterpart to `TenantCredentialsHandover` — same "shown
 * exactly once, never re-fetchable" reasoning, different copy/redirect
 * target. Kept as its own small component rather than generalizing the
 * admin one across two different navigation contexts (`/admin/tenants/…`
 * vs `/dashboard/staff/…`) for a single reused block of markup.
 */
export function StaffCredentialsHandover({
  staffId,
  email,
  temporaryPassword,
}: {
  staffId: string;
  email: string;
  temporaryPassword: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable — the password is still
      // selectable/visible on screen either way.
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Alert className="border-primary/25 bg-primary/5">
        <TriangleAlertIcon className="text-primary" />
        <AlertDescription className="text-primary font-medium">
          Store this password now — it will not be shown again.
        </AlertDescription>
      </Alert>

      <Field>
        <FieldLabel>Login email</FieldLabel>
        <div className="bg-muted rounded-lg border px-3 py-2 font-mono text-sm">
          {email}
        </div>
      </Field>

      <Field>
        <FieldLabel>Temporary password</FieldLabel>
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
            {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
          </Button>
        </div>
      </Field>

      <p className="text-muted-foreground text-sm">
        They must sign in with this password at{" "}
        <span className="font-medium">{tenantPaths.login}</span> and will be
        required to set a new one immediately.
      </p>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() =>
            router.push(`${tenantPaths.staff}/${staffId}?created=1`)
          }
        >
          I&rsquo;ve stored it — go to their profile
        </Button>
      </div>
    </div>
  );
}
