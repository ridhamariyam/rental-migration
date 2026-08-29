import { z } from "zod";
import { optionalUuidSchema, uuidSchema } from "@/lib/validation/common";

export const attendanceIdParamSchema = z.object({ id: uuidSchema });

/** Raw GPS coordinates from the browser's Geolocation API — the server
 * always recomputes the distance/geofence check itself from these (see
 * `src/lib/geo.ts`), never trusting a client-supplied "inside radius"
 * flag. */
export const checkInOutSchema = z.object({
  latitude: z.coerce.number().min(-90, "Invalid latitude").max(90, "Invalid latitude"),
  longitude: z.coerce
    .number()
    .min(-180, "Invalid longitude")
    .max(180, "Invalid longitude"),
});

export type CheckInOutInput = z.infer<typeof checkInOutSchema>;

const ATTENDANCE_STATUS_FILTER_VALUES = [
  "all",
  "present",
  "corrected",
  "absent",
] as const;

/** Same `.catch(default)` discipline as every other `*ListQuerySchema` in
 * this app — a malformed value from a stale bookmark degrades to the
 * default instead of throwing/422-ing. */
export const attendanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  status: z.enum(ATTENDANCE_STATUS_FILTER_VALUES).catch("all"),
  staffId: optionalUuidSchema.catch(undefined),
  outletId: optionalUuidSchema.catch(undefined),
  fromDate: z.iso.date().optional().catch(undefined),
  toDate: z.iso.date().optional().catch(undefined),
});

export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;

/**
 * Owner-only edit to a recorded day (doc §17's "The Shop Owner can review
 * attendance and manually correct it") — a `reason` is always required so
 * every correction leaves an audit trail (`attendance_corrections`),
 * mirroring the legacy backend's `AttendanceService.correct` exactly.
 * `checkInTime`/`checkOutTime` are whatever a `<input type="datetime-local">`
 * submits (`YYYY-MM-DDTHH:mm`, no timezone offset) — deliberately not
 * `z.iso.datetime()` (which requires one); the server parses it as the
 * caller's own local time via a plain `new Date(...)`, same as the value
 * the input itself represents.
 */
export const correctAttendanceSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "A reason is required for a correction")
      .max(500, "Reason must be at most 500 characters"),
    checkInTime: z.string().trim().optional(),
    checkOutTime: z.string().trim().optional(),
    status: z.enum(["present", "corrected", "absent"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.checkInTime &&
      data.checkOutTime &&
      new Date(data.checkOutTime) < new Date(data.checkInTime)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["checkOutTime"],
        message: "Check-out cannot precede check-in",
      });
    }
  });

export type CorrectAttendanceInput = z.infer<typeof correctAttendanceSchema>;
