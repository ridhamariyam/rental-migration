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

export function ProductStatusAction({
  productId,
  isActive,
}: {
  productId: string;
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
      await apiRequest(`/api/products/${productId}/status`, {
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
        if (!next) setError(null);
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
            Deactivate product
          </>
        ) : (
          <>
            <CheckCircle2Icon />
            Activate product
          </>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isActive ? "Deactivate this product?" : "Activate this product?"}
          </DialogTitle>
          <DialogDescription>
            {isActive
              ? "It stops appearing anywhere staff can browse or book from. Its existing physical items keep their own records."
              : "It becomes visible again for staff to browse and book from."}
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
              "Deactivate product"
            ) : (
              "Activate product"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
