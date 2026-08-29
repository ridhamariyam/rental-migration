"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  completeMaintenanceTaskSchema,
  type CompleteMaintenanceTaskInput,
} from "@/lib/validation/maintenance";

export function CompleteMaintenanceTaskDialog({
  taskId,
  currentNotes,
}: {
  taskId: string;
  currentNotes: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CompleteMaintenanceTaskInput>({
    resolver: zodResolver(completeMaintenanceTaskSchema),
    defaultValues: { notes: currentNotes ?? "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/maintenance/${taskId}/complete`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      setOpen(false);
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
        if (!next) setFormError(null);
      }}
    >
      <DialogTrigger render={<Button variant="accent" />}>
        <CheckCircle2Icon />
        Mark complete
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Complete this task</DialogTitle>
          <DialogDescription>
            If nothing else is open for this item, it becomes available
            again immediately.
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

            <Field data-invalid={!!form.formState.errors.notes}>
              <FieldLabel htmlFor="complete-notes">Notes (optional)</FieldLabel>
              <Textarea
                id="complete-notes"
                rows={3}
                disabled={isSubmitting}
                {...form.register("notes")}
              />
              <FieldError errors={[form.formState.errors.notes]} />
            </Field>
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
                  Completing…
                </>
              ) : (
                "Mark complete"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
