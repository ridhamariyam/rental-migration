"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PencilLineIcon } from "lucide-react";

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  correctAttendanceSchema,
  type CorrectAttendanceInput,
} from "@/lib/validation/attendance";
import type { Attendance } from "@/lib/db/schema";

const STATUS_LABELS: Record<string, string> = {
  present: "Present",
  corrected: "Corrected",
  absent: "Absent",
};

/** Converts a `Date`/ISO string to the `YYYY-MM-DDTHH:mm` shape a
 * `datetime-local` input needs, in the browser's own local time. */
function toDateTimeLocal(value: string | Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CorrectAttendanceDialog({
  attendance,
}: {
  attendance: Attendance;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CorrectAttendanceInput>({
    resolver: zodResolver(correctAttendanceSchema),
    defaultValues: {
      reason: "",
      checkInTime: toDateTimeLocal(attendance.checkInTime),
      checkOutTime: toDateTimeLocal(attendance.checkOutTime),
      status: "corrected",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/attendance/${attendance.id}/correct`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      setOpen(false);
      form.reset();
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
        setOpen(next);
        if (!next) {
          setFormError(null);
          form.reset();
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <PencilLineIcon className="size-3.5" />
        <span className="sr-only">Correct this record</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct attendance</DialogTitle>
          <DialogDescription>
            Edits are recorded with a reason so the change stays auditable.
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
                <Field data-invalid={!!form.formState.errors.checkInTime}>
                  <FieldLabel htmlFor="correct-check-in">Check in</FieldLabel>
                  <input
                    id="correct-check-in"
                    type="datetime-local"
                    disabled={isSubmitting}
                    className="border-input bg-background flex h-9 w-full rounded-lg border px-3 text-sm shadow-xs"
                    {...form.register("checkInTime")}
                  />
                  <FieldError errors={[form.formState.errors.checkInTime]} />
                </Field>
                <Field data-invalid={!!form.formState.errors.checkOutTime}>
                  <FieldLabel htmlFor="correct-check-out">Check out</FieldLabel>
                  <input
                    id="correct-check-out"
                    type="datetime-local"
                    disabled={isSubmitting}
                    className="border-input bg-background flex h-9 w-full rounded-lg border px-3 text-sm shadow-xs"
                    {...form.register("checkOutTime")}
                  />
                  <FieldError errors={[form.formState.errors.checkOutTime]} />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.status}>
                <FieldLabel>Status</FieldLabel>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a status">
                          {(value: string) => STATUS_LABELS[value] ?? value}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field data-invalid={!!form.formState.errors.reason}>
                <FieldLabel htmlFor="correct-reason">Reason</FieldLabel>
                <Textarea
                  id="correct-reason"
                  rows={2}
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
                  Saving…
                </>
              ) : (
                "Save correction"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
