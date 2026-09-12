"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PencilIcon, PlusIcon } from "lucide-react";

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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { toDateString } from "@/lib/format";
import {
  createSalarySchema,
  type CreateSalaryInput,
} from "@/lib/validation/salary";
import type { Salary } from "@/lib/db/schema";

const WEEKDAY_OPTIONS = [
  { value: "none", label: "None (works every day)" },
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

/**
 * Creates a pay configuration, or edits an existing one when `salary` is
 * passed. Editing matters because a configuration is a dated record, not a
 * setting: a typo in today's rate has to be correctable in place, while a
 * genuine raise is still a *new* row so last month's payslip keeps pricing
 * against the rate that was actually in force (see `getEffectiveSalary`).
 */
export function AddSalaryDialog({
  staffId,
  salary,
}: {
  staffId: string;
  salary?: Salary;
}) {
  const router = useRouter();
  const isEditing = Boolean(salary);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emptyValues: CreateSalaryInput = {
    staffId,
    hourlyRate: salary?.hourlyRate ?? "",
    amount: salary?.amount ?? "",
    weeklyOffDay: salary?.weeklyOffDay ?? 0,
    standardHoursPerDay: salary ? Number(salary.standardHoursPerDay) : 8,
    overtimeRatePerHour: salary?.overtimeRatePerHour ?? "",
    effectiveDate: salary?.effectiveDate ?? toDateString(new Date()),
    note: salary?.note ?? "",
  };

  const form = useForm<CreateSalaryInput>({
    resolver: zodResolver(createSalarySchema),
    defaultValues: emptyValues,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(
        isEditing ? `/api/salary/${salary!.id}` : "/api/salary",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );
      setOpen(false);
      form.reset(isEditing ? values : emptyValues);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (
            fieldError.field === "amount" ||
            fieldError.field === "hourlyRate"
          ) {
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
        if (!next) setFormError(null);
      }}
    >
      <DialogTrigger
        render={<Button size="sm" variant={isEditing ? "ghost" : "outline"} />}
      >
        {isEditing ? <PencilIcon /> : <PlusIcon />}
        {isEditing ? "Edit" : "Configure pay"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit pay configuration" : "Configure pay"}
          </DialogTitle>
          <DialogDescription>
            Pay is hours actually worked × the hourly rate. Takes effect from
            the date below — earlier months keep pricing against whatever was in
            force then.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          noValidate
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
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
                <Field data-invalid={!!form.formState.errors.hourlyRate}>
                  <FieldLabel htmlFor="salary-hourly-rate">
                    Hourly rate
                  </FieldLabel>
                  <Input
                    id="salary-hourly-rate"
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.hourlyRate}
                    {...form.register("hourlyRate")}
                  />
                  <FieldDescription>
                    Every approved hour worked is paid at this rate.
                  </FieldDescription>
                  <FieldError errors={[form.formState.errors.hourlyRate]} />
                </Field>
                <Field
                  data-invalid={!!form.formState.errors.standardHoursPerDay}
                >
                  <FieldLabel htmlFor="salary-standard-hours">
                    Standard hours/day
                  </FieldLabel>
                  <Input
                    id="salary-standard-hours"
                    type="number"
                    step={0.5}
                    min={1}
                    max={24}
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.standardHoursPerDay}
                    {...form.register("standardHoursPerDay", {
                      valueAsNumber: true,
                    })}
                  />
                  <FieldError
                    errors={[form.formState.errors.standardHoursPerDay]}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!form.formState.errors.weeklyOffDay}>
                  <FieldLabel htmlFor="salary-weekly-off">
                    Weekly off day
                  </FieldLabel>
                  <Controller
                    control={form.control}
                    name="weeklyOffDay"
                    render={({ field }) => (
                      <Select
                        value={
                          field.value === null ? "none" : String(field.value)
                        }
                        onValueChange={(next) =>
                          field.onChange(next === "none" ? null : Number(next))
                        }
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="salary-weekly-off">
                          <SelectValue>
                            {(value: string) =>
                              WEEKDAY_OPTIONS.find((o) => o.value === value)
                                ?.label
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.weeklyOffDay]} />
                </Field>
                <Field
                  data-invalid={!!form.formState.errors.overtimeRatePerHour}
                >
                  <FieldLabel htmlFor="salary-overtime-rate">
                    Extra worktime rate/hour
                  </FieldLabel>
                  <Input
                    id="salary-overtime-rate"
                    inputMode="decimal"
                    placeholder="0.00"
                    disabled={isSubmitting}
                    aria-invalid={!!form.formState.errors.overtimeRatePerHour}
                    {...form.register("overtimeRatePerHour")}
                  />
                  <FieldDescription>
                    Paid for hours beyond the standard day. Leave blank to
                    record extra hours without paying for them.
                  </FieldDescription>
                  <FieldError
                    errors={[form.formState.errors.overtimeRatePerHour]}
                  />
                </Field>
              </div>

              <Field data-invalid={!!form.formState.errors.amount}>
                <FieldLabel htmlFor="salary-amount">
                  Monthly salary (optional)
                </FieldLabel>
                <Input
                  id="salary-amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={isSubmitting}
                  aria-invalid={!!form.formState.errors.amount}
                  {...form.register("amount")}
                />
                <FieldDescription>
                  Reference only — what the role is quoted at. Pay is never
                  derived from it.
                </FieldDescription>
                <FieldError errors={[form.formState.errors.amount]} />
              </Field>

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
            <Button type="submit" disabled={isSubmitting} className="min-w-28">
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
