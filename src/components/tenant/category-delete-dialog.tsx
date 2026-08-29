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
import type { CategoryRow } from "@/server/categories/service";

/**
 * Deleting a category is a real removal (not a soft deactivate like
 * outlets/staff) — categories with no products are just leftover metadata,
 * safe to remove outright. The server still refuses if any product still
 * references it, surfaced here as the generic error banner.
 */
export function CategoryDeleteDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryRow;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!category) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/categories/${category.id}`, { method: "DELETE" });
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
  };

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
          <DialogTitle>Delete this category?</DialogTitle>
          <DialogDescription>
            {category
              ? `"${category.name}" will be permanently removed. This can't be undone.`
              : "This can't be undone."}
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
              "Delete category"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
