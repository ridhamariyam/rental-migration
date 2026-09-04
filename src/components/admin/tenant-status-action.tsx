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
 * Block/unblock is a hard-to-reverse, access-affecting action (blocking
 * immediately revokes every session for every user under the tenant), so
 * it always goes through an explicit confirmation step rather than firing
 * on a single click — matching the project's operational-safety norms.
 */
export function TenantStatusAction({
  tenantId,
  isActive,
}: {
  tenantId: string;
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
      await apiRequest(`/api/admin/tenants/${tenantId}/status`, {
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
            Block tenant
          </>
        ) : (
          <>
            <CheckCircle2Icon />
            Unblock tenant
          </>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isActive ? "Block this tenant?" : "Unblock this tenant?"}
          </DialogTitle>
          <DialogDescription>
            {isActive
              ? "This immediately signs out every user at this business and prevents them from logging back in until you unblock it."
              : "This restores login access for every user at this business."}
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
                {isActive ? "Blocking…" : "Unblocking…"}
              </>
            ) : isActive ? (
              "Block tenant"
            ) : (
              "Unblock tenant"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
