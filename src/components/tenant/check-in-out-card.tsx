"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  LogInIcon,
  LogOutIcon,
  MapPinIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatTime } from "@/lib/format";
import type { Attendance } from "@/lib/db/schema";
import {
  AttendanceGeofenceMap,
  type AttendanceOutletGeofence,
} from "@/components/tenant/attendance-geofence-map";
import { useAttendanceCheckInOut } from "@/hooks/use-attendance-check-in-out";
import { CheckInCameraDialog } from "@/components/tenant/check-in-camera-dialog";

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
  const {
    today,
    isSubmitting,
    error,
    checkIn,
    checkOut,
    hasCheckedIn,
    hasCheckedOut,
  } = useAttendanceCheckInOut(initialToday);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function handleConfirmedCheckOut() {
    await checkOut();
    setConfirmOpen(false);
  }

  async function handleCheckIn(photo: Blob) {
    await checkIn(photo);
    setCameraOpen(false);
  }

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
          <Button onClick={() => setCameraOpen(true)} disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : <LogInIcon />}
            Check in
          </Button>
        ) : !hasCheckedOut ? (
          <Button
            variant="accent"
            onClick={() => setConfirmOpen(true)}
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

      <CheckInCameraDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onConfirm={handleCheckIn}
        isSubmitting={isSubmitting}
        error={error}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check out for the day?</DialogTitle>
            <DialogDescription>
              This ends today&rsquo;s attendance record and you can&rsquo;t
              check in again until tomorrow. Make sure you&rsquo;re actually
              done for the day.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setConfirmOpen(false)}
            >
              Not yet
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={isSubmitting}
              onClick={handleConfirmedCheckOut}
              className="min-w-28"
            >
              {isSubmitting ? <Spinner /> : "Check out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
