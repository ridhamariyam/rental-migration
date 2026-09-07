"use client";

import { useState } from "react";
import { LogInIcon, LogOutIcon } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format";
import type { Attendance } from "@/lib/db/schema";
import { useAttendanceCheckInOut } from "@/hooks/use-attendance-check-in-out";

/**
 * Quick check-in/out from the dashboard header, not just the Attendance
 * page — same geofenced action as `CheckInOutCard`. Check-out sits behind
 * a confirmation dialog since it's easy to tap by mistake and ends today's
 * attendance record.
 */
export function NavCheckInOut({
  initialToday,
}: {
  initialToday: Attendance | null;
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

  async function handleConfirmedCheckOut() {
    await checkOut();
    setConfirmOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="text-destructive hidden max-w-56 cursor-help truncate text-xs font-medium md:inline" />
            }
          >
            {error}
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{error}</TooltipContent>
        </Tooltip>
      ) : null}

      {!hasCheckedIn ? (
        <Button size="sm" onClick={checkIn} disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : <LogInIcon />}
          Check in
        </Button>
      ) : !hasCheckedOut ? (
        <>
          <span className="text-muted-foreground hidden text-xs sm:inline">
            Checked in {formatTime(today!.checkInTime)}
          </span>
          <Button
            size="sm"
            variant="accent"
            onClick={() => setConfirmOpen(true)}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : <LogOutIcon />}
            Check out
          </Button>
        </>
      ) : (
        <span className="text-primary text-xs font-medium">
          Checked out {formatTime(today!.checkOutTime!)}
        </span>
      )}

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
    </div>
  );
}
