"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PlusIcon } from "lucide-react";

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
import { ItemPicker } from "@/components/tenant/item-picker";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  createMaintenanceTaskSchema,
  type CreateMaintenanceTaskInput,
} from "@/lib/validation/maintenance";
import type { VariationSearchResult } from "@/server/variations/service";

const TASK_TYPE_LABELS: Record<string, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
};

/**
 * Manually logs a task for an item found needing work outside a return
 * (e.g. a routine shelf check) — the automatic pair
 * (`openMaintenanceTasksForReturn`) is raised for you at return time and
 * needs no dialog of its own.
 */
export function LogMaintenanceTaskDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [item, setItem] = useState<VariationSearchResult | null>(null);

  const form = useForm<CreateMaintenanceTaskInput>({
    resolver: zodResolver(createMaintenanceTaskSchema),
    defaultValues: {
      variationId: "",
      taskType: "cleaning",
      notes: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest("/api/maintenance", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setOpen(false);
      form.reset();
      setItem(null);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "barcode") {
            form.setError("barcode", { message: fieldError.message });
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
          form.reset();
          setItem(null);
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Log a task
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log a cleaning or maintenance task</DialogTitle>
          <DialogDescription>
            For an item that needs work outside a normal return — it stops
            being bookable until this is closed out.
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
              <Field data-invalid={!!form.formState.errors.barcode}>
                <FieldLabel>Item</FieldLabel>
                <ItemPicker
                  value={item}
                  onSelect={(next) => {
                    setItem(next);
                    form.setValue("variationId", next?.id ?? "");
                    form.clearErrors("barcode");
                  }}
                  disabled={isSubmitting}
                  invalid={!!form.formState.errors.barcode}
                />
                <FieldError errors={[form.formState.errors.barcode]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.taskType}>
                <FieldLabel>Task type</FieldLabel>
                <Controller
                  control={form.control}
                  name="taskType"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a type">
                          {(value: string) => TASK_TYPE_LABELS[value] ?? value}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field data-invalid={!!form.formState.errors.notes}>
                <FieldLabel htmlFor="task-notes">Notes (optional)</FieldLabel>
                <Textarea
                  id="task-notes"
                  rows={3}
                  disabled={isSubmitting}
                  {...form.register("notes")}
                />
                <FieldError errors={[form.formState.errors.notes]} />
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
              disabled={isSubmitting || !item}
              className="min-w-32"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Logging…
                </>
              ) : (
                "Log task"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
