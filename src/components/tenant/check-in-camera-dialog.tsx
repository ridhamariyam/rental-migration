"use client";

import { useState } from "react";
import { AlertCircleIcon, LogInIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { CameraCapture } from "@/components/tenant/camera-capture";

/**
 * The camera step in front of check-in, shared by the Attendance page card
 * and the dashboard header widget so there is one check-in experience
 * rather than two that drift.
 *
 * Check-out deliberately has no camera step: the photo exists to record
 * who started the shift, and asking for a second one on the way out buys
 * nothing while adding a step at the moment people are leaving.
 */
export function CheckInCameraDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (photo: Blob) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [photo, setPhoto] = useState<Blob | null>(null);

  function handleOpenChange(next: boolean) {
    // Drop the captured frame when the dialog closes, so reopening always
    // starts from a live camera rather than a stale shot from earlier.
    if (!next) setPhoto(null);
    onOpenChange(next);
  }

  async function handleConfirm() {
    if (!photo) return;
    await onConfirm(photo);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Check in</DialogTitle>
          <DialogDescription>
            Take a photo to record your check-in. Look at the camera, keep your
            face inside the frame, and make sure the light is good.
          </DialogDescription>
        </DialogHeader>

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

        {/* Mounted only while open, so the camera stops when the dialog
            closes rather than staying live behind it. */}
        {open ? (
          <CameraCapture onCapture={setPhoto} disabled={isSubmitting} />
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!photo || isSubmitting}
            onClick={handleConfirm}
            className="min-w-28"
          >
            {isSubmitting ? <Spinner /> : <LogInIcon aria-hidden="true" />}
            Check in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
