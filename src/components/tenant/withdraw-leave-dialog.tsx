"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";

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
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";

export function WithdrawLeaveDialog({ leaveId }: { leaveId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/leave/${leaveId}`, { method: "DELETE" });
      setOpen(false);
      router.refresh();
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Withdraw
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw this request?</DialogTitle>
          <DialogDescription>This can&rsquo;t be undone.</DialogDescription>
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
            Keep request
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="min-w-28"
          >
            {isSubmitting ? (
              <>
                <Spinner />
                Withdrawing…
              </>
            ) : (
              "Withdraw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
