"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PlusIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { toDateString } from "@/lib/format";
import {
  createSalarySchema,
  type CreateSalaryInput,
} from "@/lib/validation/salary";

export function AddSalaryDialog({ staffId }: { staffId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreateSalaryInput>({
    resolver: zodResolver(createSalarySchema),
    defaultValues: {
      staffId,
      amount: "",
      workingDaysPerMonth: 26,
      effectiveDate: toDateString(new Date()),
      note: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest("/api/salary", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setOpen(false);
      form.reset({
        staffId,
        amount: "",
        workingDaysPerMonth: 26,
        effectiveDate: toDateString(new Date()),
        note: "",
      });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "amount") {
            form.setError("amount", { message: fieldError.message });
          }
        }
        return;
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PlusIcon />
        Configure pay
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure pay</DialogTitle>
          <DialogDescription>
            Takes effect from the date below — earlier months keep pricing
            against whatever was in force then.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col flex-1 overflow-hidden min-h-0"
          id="add-salary-form"
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.amount}>
                  <FieldLabel htmlFor="salary-amount">
                    Monthly amount
                  </FieldLabel>
                  <Input
                    id="salary-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.amount}
                    {...form.register("amount")}
                  />
                  <FieldError errors={[form.formState.errors.amount]} />
                </Field>
                <Field
                  data-invalid={!!form.formState.errors.workingDaysPerMonth}
                >
                  <FieldLabel htmlFor="salary-working-days">
                    Working days/month
                  </FieldLabel>
                  <Input
                    id="salary-working-days"
                    type="number"
                    min={1}
                    max={31}
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.workingDaysPerMonth}
                    {...form.register("workingDaysPerMonth", {
                      valueAsNumber: true,
                    })}
                  />
                  <FieldError
                    errors={[form.formState.errors.workingDaysPerMonth]}
                  />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.effectiveDate}>
                <FieldLabel htmlFor="salary-effective">
                  Effective from
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="effectiveDate"
                  render={({ field }) => (
                    <DatePicker
                      id="salary-effective"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                      invalid={!!form.formState.errors.effectiveDate}
                    />
                  )}
                />
                <FieldError errors={[form.formState.errors.effectiveDate]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.note}>
                <FieldLabel htmlFor="salary-note">Note (optional)</FieldLabel>
                <Textarea
                  id="salary-note"
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
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-28"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
