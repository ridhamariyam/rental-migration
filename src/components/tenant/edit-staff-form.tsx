"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, UserIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { PhoneInput } from "@/components/admin/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  updateStaffSchema,
  type UpdateStaffInput,
} from "@/lib/validation/staff";
import type { UserRole } from "@/lib/auth/permissions";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { StaffRow } from "@/server/staff/service";

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  staff: "Staff",
};

/**
 * Editing an existing staff/manager account — deliberately excludes email
 * and password, same reasoning documented on `updateStaffSchema`.
 */
export function EditStaffForm({
  staff,
  outlets,
  assignableRoles,
}: {
  staff: StaffRow;
  outlets: { id: string; name: string; code: string }[];
  assignableRoles: UserRole[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdateStaffInput>({
    resolver: zodResolver(updateStaffSchema),
    defaultValues: {
      firstName: staff.firstName,
      lastName: staff.lastName,
      phone: staff.phone ?? "",
      role: staff.role as "manager" | "staff",
      outletId: staff.outletId ?? "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await apiRequest(`/api/staff/${staff.id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      router.push(`${tenantPaths.staff}/${staff.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "outletId" || fieldError.field === "role") {
            form.setError(fieldError.field as "outletId" | "role", {
              message: fieldError.message,
            });
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
  // The account's own current role is always shown as an option even if
  // the signed-in actor couldn't have *assigned* it themselves (e.g. a
  // manager editing a staff account they didn't create) — only the roles
  // this editor could actually re-assign it *to* are offered beyond that.
  const roleOptions = Array.from(
    new Set([staff.role, ...assignableRoles]),
  ).filter((role) => role === "manager" || role === "staff");

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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.firstName}>
            <FieldLabel htmlFor="firstName">First name</FieldLabel>
            <div className="relative">
              <UserIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                id="firstName"
                autoComplete="given-name"
                autoFocus
                aria-invalid={!!form.formState.errors.firstName}
                disabled={isSubmitting}
                className="pl-8"
                {...form.register("firstName", {
                  onChange: () => setFormError(null),
                })}
              />
            </div>
            <FieldError errors={[form.formState.errors.firstName]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.lastName}>
            <FieldLabel htmlFor="lastName">Last name</FieldLabel>
            <Input
              id="lastName"
              autoComplete="family-name"
              aria-invalid={!!form.formState.errors.lastName}
              disabled={isSubmitting}
              {...form.register("lastName", {
                onChange: () => setFormError(null),
              })}
            />
            <FieldError errors={[form.formState.errors.lastName]} />
          </Field>
        </div>

        <Field data-invalid={!!form.formState.errors.phone}>
          <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                id="phone"
                countryLabel="Staff phone country code"
                value={field.value ?? ""}
                onChange={(next) => {
                  field.onChange(next);
                  setFormError(null);
                }}
                onBlur={field.onBlur}
                invalid={!!form.formState.errors.phone}
                disabled={isSubmitting}
                allowEmpty
              />
            )}
          />
          <FieldError errors={[form.formState.errors.phone]} />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.role}>
            <FieldLabel htmlFor="role">Role</FieldLabel>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(next) => {
                    field.onChange(next);
                    setFormError(null);
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue placeholder="Choose a role">
                      {(value: string) => ROLE_LABELS[value] ?? "Choose a role"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {roleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role] ?? role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[form.formState.errors.role]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.outletId}>
            <FieldLabel htmlFor="outletId">Outlet</FieldLabel>
            <Controller
              control={form.control}
              name="outletId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(next) => {
                    field.onChange(next);
                    setFormError(null);
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="outletId" className="w-full">
                    <SelectValue placeholder="Choose an outlet">
                      {(value: string) => {
                        const outlet = outlets.find(
                          (item) => item.id === value,
                        );
                        return outlet
                          ? `${outlet.name} (${outlet.code})`
                          : "Choose an outlet";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {outlets.map((outlet) => (
                      <SelectItem key={outlet.id} value={outlet.id}>
                        {outlet.name} ({outlet.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[form.formState.errors.outletId]} />
          </Field>
        </div>
      </FieldGroup>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => router.push(`${tenantPaths.staff}/${staff.id}`)}
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
