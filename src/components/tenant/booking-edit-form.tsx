"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  updateBookingOrderSchema,
  type UpdateBookingOrderInput,
} from "@/lib/validation/bookings";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Booking } from "@/lib/db/schema";

/**
 * Editing the order itself — additional cost (e.g. an agreed late-return
 * fee) and notes. Dates/quantity are per-item now (see
 * `booking-item-edit-form.tsx`), and the discount/customer/items are
 * fixed once the order is created.
 */
export function BookingOrderEditForm({ booking }: { booking: Booking }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdateBookingOrderInput>({
    resolver: zodResolver(updateBookingOrderSchema),
    defaultValues: {
      additionalCost: booking.additionalCost,
      additionalCostReason: booking.additionalCostReason ?? "",
      notes: booking.notes ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const additionalCost = form.watch("additionalCost");
  const extraCharged = Number(additionalCost || "0") > 0;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      router.push(`${tenantPaths.bookings}/${booking.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "additionalCost" ||
            fieldError.field === "additionalCostReason" ||
            fieldError.field === "notes"
          ) {
            form.setError(
              fieldError.field as
                | "additionalCost"
                | "additionalCostReason"
                | "notes",
              { message: fieldError.message },
            );
            mappedToField = true;
          }
        }
        if (mappedToField) {
          return;
        }
      }

      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
        {Number(booking.discountAmount) > 0 ? (
          <p className="text-muted-foreground text-xs">
            Discount of {formatMoney(booking.discountAmount)} was applied when
            this order was created and can&rsquo;t be changed here.
          </p>
        ) : null}

        <Field data-invalid={!!form.formState.errors.additionalCost}>
          <FieldLabel htmlFor="additionalCost">
            Additional cost (optional)
          </FieldLabel>
          <Input
            id="additionalCost"
            inputMode="decimal"
            placeholder="0.00"
            disabled={isSubmitting}
            aria-invalid={!!form.formState.errors.additionalCost}
            {...form.register("additionalCost")}
          />
          <FieldError errors={[form.formState.errors.additionalCost]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.additionalCostReason}>
          <FieldLabel htmlFor="additionalCostReason">
            Reason{extraCharged ? "" : " (optional)"}
          </FieldLabel>
          <Input
            id="additionalCostReason"
            placeholder="Alteration, delivery, late fee…"
            disabled={isSubmitting}
            aria-invalid={!!form.formState.errors.additionalCostReason}
            {...form.register("additionalCostReason")}
          />
          <FieldError errors={[form.formState.errors.additionalCostReason]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.notes}>
          <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
          <Textarea
            id="notes"
            rows={3}
            disabled={isSubmitting}
            {...form.register("notes")}
          />
          <FieldError errors={[form.formState.errors.notes]} />
        </Field>
      </FieldGroup>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push(`${tenantPaths.bookings}/${booking.id}`)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-32">
          {isSubmitting ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
