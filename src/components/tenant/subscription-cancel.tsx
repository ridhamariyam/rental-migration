"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, RotateCcwIcon, XCircleIcon } from "lucide-react";

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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";

/**
 * Cancel the plan, or undo a cancellation. Nothing renews automatically,
 * so cancelling never refunds or cuts access early: the account keeps
 * working until `endsLabel`, then locks like any lapsed plan.
 */
export function SubscriptionCancel({
  cancelled,
  endsLabel,
}: {
  cancelled: boolean;
  endsLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/billing/cancel", {
        method,
        ...(method === "POST" ? { body: JSON.stringify({ reason }) } : {}),
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (cancelled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Your plan is cancelled. You can keep using Rentque until <strong>{endsLabel}</strong>; after that the
          account locks. Changed your mind?
        </p>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button className="w-fit" disabled={busy} onClick={() => submit("DELETE")}>
          {busy ? <Spinner /> : <RotateCcwIcon />}
          Keep my subscription
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" className="text-destructive hover:text-destructive w-fit" onClick={() => setOpen(true)}>
        <XCircleIcon />
        Cancel subscription
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel your subscription?</DialogTitle>
            <DialogDescription>
              You keep full access until {endsLabel}. After that the account locks until you renew. Payments
              already made aren&apos;t refunded. You can undo this any time before then.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cancel-reason">Why are you leaving? (optional)</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={3}
                disabled={busy}
                placeholder="It helps us improve."
              />
            </div>
            {error ? (
              <Alert variant="destructive" className="border-destructive/25 bg-destructive/5">
                <AlertCircleIcon />
                <AlertDescription className="text-destructive font-medium">{error}</AlertDescription>
              </Alert>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Keep subscription
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => submit("POST")}>
              {busy ? <Spinner /> : null}
              Cancel subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
