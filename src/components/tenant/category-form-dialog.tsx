"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  categoryFormSchema,
  type CategoryFormInput,
} from "@/lib/validation/categories";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { CategoryRow } from "@/server/categories/service";

/**
 * Shared create/edit dialog for categories — purely controlled (`open`/
 * `onOpenChange`, no built-in trigger) so both the page-level "+ Add
 * category" button and each row's "Edit" menu item can drive the same
 * component from their own state, rather than nesting a `DialogTrigger`
 * inside a `DropdownMenuItem` (closing the menu can unmount the trigger
 * before the dialog opens — a known composition footgun with this kind of
 * portal-in-portal nesting).
 */
export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryRow;
}) {
  const router = useRouter();
  const isEditing = Boolean(category);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  // Reset the form's fields whenever a *different* category is opened for
  // editing (or the dialog reopens for "add") — the dialog stays mounted
  // between opens, so `defaultValues` alone only applies once.
  useEffect(() => {
    if (open) {
      form.reset({
        name: category?.name ?? "",
        description: category?.description ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(
        isEditing ? `/api/categories/${category!.id}` : "/api/categories",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "name") {
            form.setError("name", { message: fieldError.message });
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setFormError(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit category" : "Add category"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this category's details."
              : "Group your products so they're easier to browse and filter."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex flex-col flex-1 overflow-hidden min-h-0">
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
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="category-name">Name</FieldLabel>
                <Input
                  id="category-name"
                  autoFocus
                  aria-invalid={!!form.formState.errors.name}
                  disabled={isSubmitting}
                  {...form.register("name", {
                    onChange: () => setFormError(null),
                  })}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field data-invalid={!!form.formState.errors.description}>
                <FieldLabel htmlFor="category-description">
                  Description (optional)
                </FieldLabel>
                <Textarea
                  id="category-description"
                  rows={3}
                  aria-invalid={!!form.formState.errors.description}
                  disabled={isSubmitting}
                  {...form.register("description", {
                    onChange: () => setFormError(null),
                  })}
                />
                <FieldError errors={[form.formState.errors.description]} />
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
            <Button type="submit" disabled={isSubmitting} className="min-w-28">
              {isSubmitting ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : isEditing ? (
                "Save changes"
              ) : (
                "Add category"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
