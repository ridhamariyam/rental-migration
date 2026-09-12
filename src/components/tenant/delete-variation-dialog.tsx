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
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { VariationListItem } from "@/server/variations/service";

/**
 * Controlled dialog (no built-in trigger) so the row's ⋯ menu can open it
 * without nesting a trigger inside a menu item — the same composition rule
 * `CategoryFormDialog` documents.
 */
export function DeleteVariationDialog({
  open,
  onOpenChange,
  variation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variation: VariationListItem;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/variations/${variation.id}`, { method: "DELETE" });
      onOpenChange(false);
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
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete item {variation.sku}?</DialogTitle>
          <DialogDescription>
            This barcoded copy is removed for good. An item that appears on any
            booking cannot be deleted — set it to retired instead, which takes
            it out of circulation and keeps its rental history.
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
            onClick={() => onOpenChange(false)}
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
                Deleting…
              </>
            ) : (
              "Delete item"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
