"use client";

import { useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LogInIcon,
  LogOutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { formatTime } from "@/lib/format";
import type { Attendance } from "@/lib/db/schema";
import { useCheckInOut } from "@/hooks/use-check-in-out";

/**
 * Compact "Check in"/"Check out" control shown in the dashboard header for
 * any staff/manager account (`ATTENDANCE_SELF`, doc §17) — a shortcut to
 * the same action as `CheckInOutCard` on the full attendance page, so they
 * don't have to navigate there just to check in/out. Checking out is a
 * one-way action for the day, so it always confirms first (same as the
 * full card) — an accidental tap here would otherwise be indistinguishable
 * from actually leaving.
 */
export function QuickAttendanceWidget({
  initialToday,
}: {
  initialToday: Attendance | null;
}) {
  const {
    today,
    isSubmitting,
    error,
    setError,
    hasCheckedIn,
    hasCheckedOut,
    checkIn,
    checkOut,
  } = useCheckInOut(initialToday);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleConfirmCheckOut() {
    const ok = await checkOut();
    if (ok) setConfirmOpen(false);
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {!hasCheckedIn ? (
        <Popover open={!!error} onOpenChange={(next) => !next && setError(null)}>
          <PopoverTrigger
            render={
              <Button size="sm" onClick={() => checkIn()} disabled={isSubmitting} />
            }
          >
            {isSubmitting ? <Spinner /> : <LogInIcon />}
            Check in
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-64">
            <p className="text-destructive flex items-start gap-1.5 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          </PopoverContent>
        </Popover>
      ) : !hasCheckedOut ? (
        <>
          <span className="text-muted-foreground hidden text-sm sm:inline">
            Checked in at {formatTime(today!.checkInTime)}
          </span>
          <Popover open={!!error} onOpenChange={(next) => !next && setError(null)}>
            <PopoverTrigger
              render={
                <Button
                  size="sm"
                  variant="accent"
                  onClick={() => setConfirmOpen(true)}
                  disabled={isSubmitting}
                />
              }
            >
              {isSubmitting ? <Spinner /> : <LogOutIcon />}
              Check out
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-64">
              <p className="text-destructive flex items-start gap-1.5 text-sm">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            </PopoverContent>
          </Popover>
        </>
      ) : (
        <span className="text-primary flex items-center gap-1.5 text-sm font-medium">
          <CheckCircle2Icon className="size-4" />
          Checked out for today
        </span>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check out for today?</DialogTitle>
            <DialogDescription>
              This marks your work day as ended
              {today ? ` at ${formatTime(today.checkInTime)} start` : ""}. Make
              sure you meant to tap this — it can only be corrected later by
              an owner/manager.
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
              onClick={handleConfirmCheckOut}
            >
              {isSubmitting ? <Spinner /> : <LogOutIcon />}
              Yes, check out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
