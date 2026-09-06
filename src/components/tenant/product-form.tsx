"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, ShirtIcon } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  createProductSchema,
  type CreateProductInput,
} from "@/lib/validation/products";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { ProductRow } from "@/server/products/service";

export function ProductForm({
  product,
  categories,
}: {
  product?: ProductRow;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const isEditing = Boolean(product);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: product?.name ?? "",
      categoryId: product?.categoryId ?? categories[0]?.id ?? "",
      description: product?.description ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await apiRequest<ProductRow>(
        isEditing ? `/api/products/${product!.id}` : "/api/products",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );

      if (isEditing) {
        router.push(`${tenantPaths.products}/${result.id}`);
      } else {
        router.push(`${tenantPaths.products}/${result.id}?created=1`);
      }
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "categoryId") {
            form.setError("categoryId", { message: fieldError.message });
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
        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="name">Product name</FieldLabel>
          <div className="relative">
            <ShirtIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="name"
              autoFocus
              aria-invalid={!!form.formState.errors.name}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("name", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.name]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.categoryId}>
          <FieldLabel htmlFor="categoryId">Category</FieldLabel>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(next) => {
                  field.onChange(next);
                  setFormError(null);
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger id="categoryId" className="w-full">
                  <SelectValue placeholder="Choose a category">
                    {(value: string) =>
                      categories.find((category) => category.id === value)
                        ?.name ?? "Choose a category"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[form.formState.errors.categoryId]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.description}>
          <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
          <Textarea
            id="description"
            rows={4}
            aria-invalid={!!form.formState.errors.description}
            disabled={isSubmitting}
            {...form.register("description", {
              onChange: () => setFormError(null),
            })}
          />
          <FieldError errors={[form.formState.errors.description]} />
        </Field>
      </FieldGroup>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() =>
            router.push(
              isEditing
                ? `${tenantPaths.products}/${product!.id}`
                : tenantPaths.products,
            )
          }
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="min-w-32">
          {isSubmitting ? (
            <>
              <Spinner />
              {isEditing ? "Saving…" : "Creating…"}
            </>
          ) : isEditing ? (
            "Save changes"
          ) : (
            "Create product"
          )}
        </Button>
      </div>
    </form>
  );
}
