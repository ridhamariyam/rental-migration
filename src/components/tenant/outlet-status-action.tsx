"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, BanIcon, CheckCircle2Icon } from "lucide-react";

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

/**
 * Deactivating an outlet doesn't touch its staff's sessions (unlike
 * blocking a tenant or deactivating a staff account) — it just takes the
 * outlet out of the "assign staff here" picker and its list of active
 * outlets. Still routed through a confirmation dialog, matching the
 * project's norm for any hard-to-reverse-feeling action.
 */
export function OutletStatusAction({
  outletId,
  isActive,
}: {
  outletId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/outlets/${outletId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !isActive }),
      });
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
        if (!next) {
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={isActive ? "destructive" : "outline"}
            size="sm"
            className="w-full"
          />
        }
      >
        {isActive ? (
          <>
            <BanIcon />
            Deactivate outlet
          </>
        ) : (
          <>
            <CheckCircle2Icon />
            Activate outlet
          </>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isActive ? "Deactivate this outlet?" : "Activate this outlet?"}
          </DialogTitle>
          <DialogDescription>
            {isActive
              ? "It stops appearing as an option when assigning staff or inventory. Existing staff already assigned here keep their accounts active."
              : "It becomes available again for staff assignment and inventory."}
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
            variant={isActive ? "destructive" : "default"}
            disabled={isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting ? (
              <>
                <Spinner />
                {isActive ? "Deactivating…" : "Activating…"}
              </>
            ) : isActive ? (
              "Deactivate outlet"
            ) : (
              "Activate outlet"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
