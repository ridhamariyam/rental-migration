"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, HandCoinsIcon } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  markSettlementPaidSchema,
  type MarkSettlementPaidInput,
} from "@/lib/validation/settlements";

/**
 * Confirms a payout to a customer-owner (doc §19–21) — a `pending`
 * settlement's only forward action. Purely controlled (`open`/
 * `onOpenChange`), same reasoning as `RecordPaymentDialog`: the trigger
 * lives in the table row, not inside this component.
 */
export function MarkSettlementPaidDialog({
  open,
  onOpenChange,
  settlementId,
  ownerName,
  ownerAmount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlementId: string;
  ownerName: string | null;
  ownerAmount: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<MarkSettlementPaidInput>({
    resolver: zodResolver(markSettlementPaidSchema),
    defaultValues: { paymentReference: "", note: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/settlements/${settlementId}/pay`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      onOpenChange(false);
      form.reset({ paymentReference: "", note: "" });
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setFormError(null);
          form.reset({ paymentReference: "", note: "" });
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            Confirm {formatMoney(ownerAmount)} was paid out to{" "}
            {ownerName || "the owner"}. This can&rsquo;t be undone.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 overflow-hidden min-h-0"
        >
          <DialogBody>
            {formError ? (
              <Alert
                variant="destructive"
                className="border-destructive/25 bg-destructive/5"
              >
                <AlertCircleIcon />
                <AlertDescription className="text-destructive font-medium">
                  {formError}
                </AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup>
              <Field data-invalid={!!form.formState.errors.paymentReference}>
                <FieldLabel htmlFor="settlement-reference">
                  Payment reference (optional)
                </FieldLabel>
                <Input
                  id="settlement-reference"
                  placeholder="UPI transaction id, cheque no., etc."
                  disabled={isSubmitting}
                  {...form.register("paymentReference")}
                />
                <FieldError errors={[form.formState.errors.paymentReference]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.note}>
                <FieldLabel htmlFor="settlement-note">Note (optional)</FieldLabel>
                <Textarea
                  id="settlement-note"
                  rows={2}
                  disabled={isSubmitting}
                  {...form.register("note")}
                />
                <FieldError errors={[form.formState.errors.note]} />
              </Field>
            </FieldGroup>
          </DialogBody>

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
              type="submit"
              disabled={isSubmitting}
              className="min-w-36"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Confirming…
                </>
              ) : (
                <>
                  <HandCoinsIcon />
                  Mark as paid
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
