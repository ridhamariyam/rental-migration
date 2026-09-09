"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import type { Attendance } from "@/lib/db/schema";

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Your browser doesn't support location access"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
    });
  });
}

function isGeolocationError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
  );
}

/**
 * Shared geofenced check-in/out submit logic (doc §17) — used by both the
 * full `CheckInOutCard` on the attendance page and the compact header
 * quick-action widget, so the actual geolocation + API call behaviour
 * never drifts between the two surfaces.
 */
export function useCheckInOut(initialToday: Attendance | null) {
  const router = useRouter();
  const [today, setToday] = useState(initialToday);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "check-in" | "check-out") {
    setError(null);
    setIsSubmitting(true);

    try {
      const position = await getPosition();
      const result = await apiRequest<Attendance>(`/api/attendance/${action}`, {
        method: "POST",
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });
      setToday(result);
      router.refresh();
      return true;
    } catch (submitError) {
      if (isGeolocationError(submitError)) {
        setError(
          submitError.code === submitError.PERMISSION_DENIED
            ? "Location access was denied — allow it for this site and try again."
            : "Couldn't get your location. Please try again.",
        );
      } else {
        setError(
          submitError instanceof ApiClientError
            ? submitError.message
            : "Something went wrong. Please try again.",
        );
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    today,
    isSubmitting,
    error,
    setError,
    hasCheckedIn: Boolean(today),
    hasCheckedOut: Boolean(today?.checkOutTime),
    checkIn: () => submit("check-in"),
    checkOut: () => submit("check-out"),
  };
}
