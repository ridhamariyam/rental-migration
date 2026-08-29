"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

/**
 * Shown exactly once, right after a tenant + its first admin user are
 * created — the temporary password is never stored in plaintext and never
 * re-fetchable, so this component (not a route, not a query param) is the
 * only place it will ever appear. Navigating away for any reason loses it
 * for good, hence the explicit warning and the "I've copied this" gate on
 * the primary continue action.
 */
export function TenantCredentialsHandover({
  tenantId,
  ownerEmail,
  temporaryPassword,
}: {
  tenantId: string;
  ownerEmail: string;
  temporaryPassword: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) —
      // the password is still selectable/visible on screen either way.
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
        <FieldLabel>Owner email</FieldLabel>
        <div className="bg-muted rounded-lg border px-3 py-2 font-mono text-sm">
          {ownerEmail}
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
        The owner must sign in with this password and will be required to set a
        new one immediately.
      </p>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => router.push(`/admin/tenants/${tenantId}?created=1`)}
        >
          I&rsquo;ve stored it — go to tenant
        </Button>
      </div>
    </div>
  );
}
