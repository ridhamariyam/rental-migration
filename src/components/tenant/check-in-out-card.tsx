"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  LogInIcon,
  LogOutIcon,
  MapPinIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ApiClientError, apiRequest } from "@/lib/api-client";
import { formatTime } from "@/lib/format";
import type { Attendance } from "@/lib/db/schema";
import {
  AttendanceGeofenceMap,
  type AttendanceOutletGeofence,
} from "@/components/tenant/attendance-geofence-map";

/**
 * Geofenced check-in/out (doc §17) — the browser's own `Geolocation` API
 * supplies raw coordinates, which the server always re-validates itself
 * against the assigned outlet's radius (`src/server/attendance/service.ts`);
 * this card never decides "am I in range" client-side, it only reports
 * what `navigator.geolocation` returns and shows whatever the server
 * decides.
 */
export function CheckInOutCard({
  initialToday,
  outlet,
}: {
  initialToday: Attendance | null;
  outlet: AttendanceOutletGeofence | null;
}) {
  const router = useRouter();
  const [today, setToday] = useState(initialToday);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleAction(action: "check-in" | "check-out") {
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
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasCheckedIn = Boolean(today);
  const hasCheckedOut = Boolean(today?.checkOutTime);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPinIcon className="size-4" aria-hidden="true" />
          Today
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert
            variant="destructive"
            className="border-destructive/25 bg-destructive/5"
          >
            <AlertCircleIcon />
            <AlertDescription className="text-destructive font-medium">
              {error}
            </AlertDescription>
          </Alert>
        ) : null}

        {!hasCheckedOut ? <AttendanceGeofenceMap outlet={outlet} /> : null}

        <div className="flex flex-col gap-1 text-sm">
          {!hasCheckedIn ? (
            <p className="text-muted-foreground">
              You haven&rsquo;t checked in yet today.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Checked in</span>
                <span className="font-medium">
                  {formatTime(today!.checkInTime)}
                </span>
              </div>
              {hasCheckedOut ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Checked out</span>
                  <span className="font-medium">
                    {formatTime(today!.checkOutTime!)}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {!hasCheckedIn ? (
          <Button
            onClick={() => handleAction("check-in")}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : <LogInIcon />}
            Check in
          </Button>
        ) : !hasCheckedOut ? (
          <Button
            variant="accent"
            onClick={() => handleAction("check-out")}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : <LogOutIcon />}
            Check out
          </Button>
        ) : (
          <p className="text-primary text-sm font-medium">
            All done for today.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
