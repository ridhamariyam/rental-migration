"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, Trash2Icon } from "lucide-react";

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

/**
 * The one "permanently delete this" control, shared by every list that has
 * one (orders, products, items, customers, staff, outlets, pay
 * configurations).
 *
 * It deliberately carries no rules of its own: each `DELETE` endpoint
 * refuses when removing the row would strand history — a booking whose
 * stock is still out, a product that appears on past rentals, a customer
 * with orders — and the refusal is shown here as-is, because the reason is
 * the useful part ("archive them instead", "return it first"). The dialog
 * only asks "are you sure" and reports what the server said.
 */
export function DeleteRecordButton({
  endpoint,
  title,
  description,
  confirmLabel = "Delete",
  redirectTo,
  variant = "icon",
  label = "Delete",
}: {
  /** API path that performs the delete, e.g. `/api/bookings/123`. */
  endpoint: string;
  title: string;
  description: string;
  confirmLabel?: string;
  /** Where to go after a successful delete — set on detail pages, whose
   * own URL stops existing. Lists just refresh in place. */
  redirectTo?: string;
  variant?: "icon" | "button";
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(endpoint, { method: "DELETE" });
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      }
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
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={label}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2Icon />
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => setOpen(true)}
        >
          <Trash2Icon />
          {label}
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
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
                  Deleting…
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
