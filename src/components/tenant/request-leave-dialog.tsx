"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { parseDateString, toDateString } from "@/lib/format";
import { createLeaveSchema, type CreateLeaveInput } from "@/lib/validation/leave";

export function RequestLeaveDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const today = toDateString(new Date());

  const form = useForm<CreateLeaveInput>({
    resolver: zodResolver(createLeaveSchema),
    defaultValues: {
      fromDate: today,
      toDate: today,
      reason: "",
    },
  });

  const fromDate = useWatch({ control: form.control, name: "fromDate" });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest("/api/leave", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setOpen(false);
      form.reset({ fromDate: today, toDate: today, reason: "" });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "toDate" || fieldError.field === "reason") {
            form.setError(fieldError.field, { message: fieldError.message });
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
        if (!next) {
          setFormError(null);
          form.reset({ fromDate: today, toDate: today, reason: "" });
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Request leave
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>
            Your manager reviews and approves or rejects this request.
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.fromDate}>
                  <FieldLabel htmlFor="leave-from">From</FieldLabel>
                  <Controller
                    control={form.control}
                    name="fromDate"
                    render={({ field }) => (
                      <DatePicker
                        id="leave-from"
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                          const currentToDate = form.getValues("toDate");
                          if (value && currentToDate && value > currentToDate) {
                            form.setValue("toDate", value, {
                              shouldValidate: true,
                              shouldDirty: true,
                            });
                          }
                          void form.trigger(["fromDate", "toDate"]);
                        }}
                        disabled={isSubmitting}
                        invalid={!!form.formState.errors.fromDate}
                      />
                    )}
                  />
                  <FieldError errors={[form.formState.errors.fromDate]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.toDate}>
                  <FieldLabel htmlFor="leave-to">To</FieldLabel>
                  <Controller
                    control={form.control}
                    name="toDate"
                    render={({ field }) => (
                      <DatePicker
                        id="leave-to"
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                          void form.trigger(["fromDate", "toDate"]);
                        }}
                        disabled={isSubmitting}
                        invalid={!!form.formState.errors.toDate}
                        disabledMatcher={
                          fromDate
                            ? { before: parseDateString(fromDate) }
                            : undefined
                        }
                      />
                    )}
                  />
                  <FieldError errors={[form.formState.errors.toDate]} />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.reason}>
                <FieldLabel htmlFor="leave-reason">Reason</FieldLabel>
                <Textarea
                  id="leave-reason"
                  rows={3}
                  disabled={isSubmitting}
                  aria-invalid={!!form.formState.errors.reason}
                  {...form.register("reason")}
                />
                <FieldError errors={[form.formState.errors.reason]} />
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
              className="min-w-32"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Requesting…
                </>
              ) : (
                "Request leave"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
