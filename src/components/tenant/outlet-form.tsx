"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  Building2Icon,
  MapPinIcon,
  NavigationIcon,
} from "lucide-react";

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
import { MapboxLocationPicker } from "@/components/ui/mapbox-location-picker";
import { Spinner } from "@/components/ui/spinner";
import {
  createOutletSchema,
  type CreateOutletInput,
} from "@/lib/validation/outlets";
import { tenantPaths } from "@/lib/tenant-paths";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { OutletRow } from "@/server/outlets/service";

/**
 * Shared create/edit form for outlets — the same field set and validation
 * either way, so one component covers both `/dashboard/outlets/new` and
 * editing from the detail page rather than two near-duplicate forms (there
 * is no one-time "handover" step for an outlet the way there is for a
 * newly-provisioned staff login, so unlike `AddTenantForm`/`AddStaffForm`
 * there's no branching post-submit UI to keep separate).
 */
function toFiniteNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function OutletForm({ outlet }: { outlet?: OutletRow }) {
  const router = useRouter();
  const isEditing = Boolean(outlet);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreateOutletInput>({
    resolver: zodResolver(createOutletSchema),
    defaultValues: {
      name: outlet?.name ?? "",
      code: outlet?.code ?? "",
      address: outlet?.address ?? "",
      phone: outlet?.phone ?? "",
      latitude: outlet?.latitude != null ? String(outlet.latitude) : "",
      longitude: outlet?.longitude != null ? String(outlet.longitude) : "",
      allowedRadiusMetres: outlet ? String(outlet.allowedRadiusMetres) : "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await apiRequest<OutletRow>(
        isEditing ? `/api/outlets/${outlet!.id}` : "/api/outlets",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );

      if (isEditing) {
        router.push(`${tenantPaths.outlets}/${result.id}`);
      } else {
        router.push(`${tenantPaths.outlets}/${result.id}?created=1`);
      }
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.fieldErrors.length > 0) {
        let mappedToField = false;
        for (const fieldError of error.fieldErrors) {
          if (fieldError.field === "code") {
            form.setError("code", { message: fieldError.message });
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

  // Reactive mirrors of the (string-backed) lat/long/radius fields, purely
  // to drive the map picker's marker + geofence circle — the actual form
  // values submitted are still whatever `register()` holds.
  const latitudeValue = useWatch({ control: form.control, name: "latitude" });
  const longitudeValue = useWatch({ control: form.control, name: "longitude" });
  const radiusValue = useWatch({
    control: form.control,
    name: "allowedRadiusMetres",
  });

  const parsedLatitude = toFiniteNumber(latitudeValue);
  const parsedLongitude = toFiniteNumber(longitudeValue);
  const parsedRadius = toFiniteNumber(radiusValue);

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
          <FieldLabel htmlFor="name">Outlet name</FieldLabel>
          <div className="relative">
            <Building2Icon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
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

        <Field data-invalid={!!form.formState.errors.code}>
          <FieldLabel htmlFor="code">Outlet code</FieldLabel>
          <Input
            id="code"
            placeholder="e.g. KNR"
            aria-invalid={!!form.formState.errors.code}
            disabled={isSubmitting}
            className="uppercase"
            {...form.register("code", {
              onChange: () => setFormError(null),
            })}
          />
          <p className="text-muted-foreground text-xs">
            A short identifier, unique within your business — letters, numbers,
            and hyphens only.
          </p>
          <FieldError errors={[form.formState.errors.code]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.address}>
          <FieldLabel htmlFor="address">Address (optional)</FieldLabel>
          <div className="relative">
            <MapPinIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="address"
              autoComplete="street-address"
              aria-invalid={!!form.formState.errors.address}
              disabled={isSubmitting}
              className="pl-8"
              {...form.register("address", {
                onChange: () => setFormError(null),
              })}
            />
          </div>
          <FieldError errors={[form.formState.errors.address]} />
        </Field>

        <Field data-invalid={!!form.formState.errors.phone}>
          <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                id="phone"
                countryLabel="Outlet phone country code"
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
      </FieldGroup>

      <div className="flex items-center gap-2 border-t pt-4">
        <NavigationIcon
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        <p className="text-sm font-medium">
          Location &amp; geofence (optional)
        </p>
      </div>
      <p className="text-muted-foreground -mt-3 text-sm">
        Used for staff attendance check-in later — not enforced yet.
      </p>

      <MapboxLocationPicker
        latitude={parsedLatitude}
        longitude={parsedLongitude}
        radiusMetres={parsedRadius}
        disabled={isSubmitting}
        onChange={({ latitude, longitude }) => {
          form.setValue("latitude", latitude.toFixed(6), {
            shouldValidate: true,
            shouldDirty: true,
          });
          form.setValue("longitude", longitude.toFixed(6), {
            shouldValidate: true,
            shouldDirty: true,
          });
          setFormError(null);
        }}
      />

      <FieldGroup>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.latitude}>
            <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
            <Input
              id="latitude"
              inputMode="decimal"
              placeholder="e.g. 11.8745"
              aria-invalid={!!form.formState.errors.latitude}
              disabled={isSubmitting}
              {...form.register("latitude", {
                onChange: () => setFormError(null),
              })}
            />
            <FieldError errors={[form.formState.errors.latitude]} />
          </Field>

          <Field data-invalid={!!form.formState.errors.longitude}>
            <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
            <Input
              id="longitude"
              inputMode="decimal"
              placeholder="e.g. 75.3704"
              aria-invalid={!!form.formState.errors.longitude}
              disabled={isSubmitting}
              {...form.register("longitude", {
                onChange: () => setFormError(null),
              })}
            />
            <FieldError errors={[form.formState.errors.longitude]} />
          </Field>
        </div>

        <Field data-invalid={!!form.formState.errors.allowedRadiusMetres}>
          <FieldLabel htmlFor="allowedRadiusMetres">
            Allowed radius (metres)
          </FieldLabel>
          <Input
            id="allowedRadiusMetres"
            inputMode="numeric"
            placeholder="150"
            aria-invalid={!!form.formState.errors.allowedRadiusMetres}
            disabled={isSubmitting}
            {...form.register("allowedRadiusMetres", {
              onChange: () => setFormError(null),
            })}
          />
          <FieldError errors={[form.formState.errors.allowedRadiusMetres]} />
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
                ? `${tenantPaths.outlets}/${outlet!.id}`
                : tenantPaths.outlets,
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
            "Create outlet"
          )}
        </Button>
      </div>
    </form>
  );
}
