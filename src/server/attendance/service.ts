import "server-only";

import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { AppError } from "@/lib/errors/app-error";
import {
  attendanceCorrections,
  attendances,
  outlets,
  users,
  type Attendance,
} from "@/lib/db/schema";
import { Permission, hasPermission } from "@/lib/auth/permissions";
import type { TenantSessionUser } from "@/server/auth/guard";
import { AuditAction, recordAudit } from "@/server/audit/service";
import {
  assertValidCoordinates,
  formatDistanceMetres,
  haversineMetres,
} from "@/lib/geo";
import { toDateString } from "@/lib/format";
import { uploadToStorage } from "@/lib/storage";
import type { ValidatedImage } from "@/lib/uploads/read-image-upload";
import type {
  AttendanceListQuery,
  CheckInOutInput,
  CorrectAttendanceInput,
} from "@/lib/validation/attendance";

export type AttendanceItem = Attendance & {
  staffFirstName: string;
  staffLastName: string;
  staffAvatarUrl: string | null;
  outletName: string | null;
};

const ATTENDANCE_SELECT = {
  id: attendances.id,
  shopId: attendances.shopId,
  outletId: attendances.outletId,
  staffId: attendances.staffId,
  date: attendances.date,
  status: attendances.status,
  checkInTime: attendances.checkInTime,
  checkInLatitude: attendances.checkInLatitude,
  checkInLongitude: attendances.checkInLongitude,
  checkInDistanceMetres: attendances.checkInDistanceMetres,
  checkInPhotoUrl: attendances.checkInPhotoUrl,
  checkOutTime: attendances.checkOutTime,
  checkOutLatitude: attendances.checkOutLatitude,
  checkOutLongitude: attendances.checkOutLongitude,
  checkOutDistanceMetres: attendances.checkOutDistanceMetres,
  createdAt: attendances.createdAt,
  updatedAt: attendances.updatedAt,
  staffFirstName: users.firstName,
  staffLastName: users.lastName,
  staffAvatarUrl: users.avatarUrl,
  outletName: outlets.name,
} as const;

function baseAttendanceQuery() {
  return db
    .select(ATTENDANCE_SELECT)
    .from(attendances)
    .innerJoin(users, eq(attendances.staffId, users.id))
    .leftJoin(outlets, eq(attendances.outletId, outlets.id));
}

/**
 * The staff member's own assigned outlet, required for a geofenced
 * check-in/out — never a client-supplied outlet id (see the table-level
 * doc comment on `schema/attendance.ts`).
 */
async function resolveOwnOutlet(actor: TenantSessionUser) {
  if (!actor.outletId) {
    throw new AppError(
      "You are not assigned to an outlet; ask your manager to assign one",
      400,
    );
  }

  const [outlet] = await db
    .select()
    .from(outlets)
    .where(
      and(eq(outlets.id, actor.outletId), eq(outlets.shopId, actor.shopId)),
    )
    .limit(1);

  if (!outlet) {
    throw AppError.notFound("Assigned outlet no longer exists");
  }

  return outlet;
}

/** Returns the server-computed distance, rejecting anything out of range
 * — mirrors the legacy `AttendanceService._validate_position`, with one
 * deliberate relaxation: an outlet with no geofence configured
 * (`latitude`/`longitude` unset) no longer blocks check-in/out outright.
 * Most shops won't bother setting a precise GPS point/radius for every
 * outlet on day one, and there's no reason attendance itself should be
 * unusable until they do — the geofence is an *optional* extra check, not
 * a prerequisite for using attendance at all. Returns `null` distance
 * (nothing to compare against) when there's no geofence to check against. */
function validatePosition(
  outlet: {
    latitude: number | null;
    longitude: number | null;
    allowedRadiusMetres: number;
    name: string;
  },
  latitude: number,
  longitude: number,
): number | null {
  assertValidCoordinates(latitude, longitude);

  if (outlet.latitude === null || outlet.longitude === null) {
    return null;
  }

  const distance = haversineMetres(
    latitude,
    longitude,
    outlet.latitude,
    outlet.longitude,
  );

  if (distance > outlet.allowedRadiusMetres) {
    throw new AppError(
      `You are ${formatDistanceMetres(distance)} from ${outlet.name}. Attendance is only accepted within ${formatDistanceMetres(outlet.allowedRadiusMetres)}.`,
      403,
    );
  }

  return distance;
}

/** Today's own attendance row, or `null` if not yet checked in — powers
 * the "Check in"/"Check out" widget's current state. */
export async function getTodaysAttendance(
  staffId: string,
): Promise<Attendance | null> {
  const today = toDateString(new Date());
  const [row] = await db
    .select()
    .from(attendances)
    .where(and(eq(attendances.staffId, staffId), eq(attendances.date, today)))
    .limit(1);

  return row ?? null;
}

export type WorkedHoursSummary = {
  /** Sum of every completed day's check-out minus check-in, in whole
   * minutes. A day with no check-out yet (still checked in) contributes
   * nothing — there's no end time to measure against. */
  totalMinutes: number;
  /** How many of those days actually had a check-out (i.e. contributed to
   * `totalMinutes`) — the correct denominator for an "average per day"
   * figure, since an open/unfinished day shouldn't drag the average down. */
  daysWithHours: number;
};

/**
 * Total time actually worked across a date range — used by the Salary
 * page to show "total hours"/"average per day" alongside the day-count-
 * based pay calculation (`calculateSalary`). `generatePayslip` freezes
 * this into the payslip row at generation time (see the doc comment on
 * `schema/salary.ts`'s `totalWorkedMinutes`); it's only ever recomputed
 * live for a not-yet-generated preview.
 */
export async function getWorkedHoursSummary(
  shopId: string,
  staffId: string,
  periodStart: string,
  periodEnd: string,
): Promise<WorkedHoursSummary> {
  const rows = await db
    .select({
      checkInTime: attendances.checkInTime,
      checkOutTime: attendances.checkOutTime,
    })
    .from(attendances)
    .where(
      and(
        eq(attendances.shopId, shopId),
        eq(attendances.staffId, staffId),
        gte(attendances.date, periodStart),
        lte(attendances.date, periodEnd),
      ),
    );

  let totalMinutes = 0;
  let daysWithHours = 0;

  for (const row of rows) {
    if (!row.checkOutTime) continue;
    totalMinutes += Math.max(
      0,
      Math.round(
        (row.checkOutTime.getTime() - row.checkInTime.getTime()) / 60_000,
      ),
    );
    daysWithHours += 1;
  }

  return { totalMinutes, daysWithHours };
}

export async function checkIn(
  actor: TenantSessionUser,
  input: CheckInOutInput & { photo: ValidatedImage },
): Promise<Attendance> {
  if (!hasPermission(actor.role, Permission.ATTENDANCE_SELF)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const existing = await getTodaysAttendance(actor.id);
  if (existing) {
    throw new AppError("Already checked in today", 409);
  }

  const outlet = await resolveOwnOutlet(actor);
  const distance = validatePosition(outlet, input.latitude, input.longitude);

  // Stored only once every other check has passed, so a check-in that is
  // going to be refused (wrong day, outside the geofence, no permission)
  // never leaves an orphaned object in the bucket. The folder is private
  // and the key carries the owning shop, so the capture is readable only
  // through `/api/files/...` by someone signed in to this tenant.
  const checkInPhotoUrl = await uploadToStorage(
    input.photo.buffer,
    "attendance",
    input.photo.contentType,
    { ownerShopId: actor.shopId },
  );

  const [attendance] = await db
    .insert(attendances)
    .values({
      shopId: actor.shopId,
      outletId: outlet.id,
      staffId: actor.id,
      date: toDateString(new Date()),
      status: "present",
      checkInTime: new Date(),
      checkInLatitude: input.latitude,
      checkInLongitude: input.longitude,
      checkInDistanceMetres: distance,
      checkInPhotoUrl,
    })
    .returning();

  return attendance;
}

export async function checkOut(
  actor: TenantSessionUser,
  input: CheckInOutInput,
): Promise<Attendance> {
  if (!hasPermission(actor.role, Permission.ATTENDANCE_SELF)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const existing = await getTodaysAttendance(actor.id);
  if (!existing) {
    throw new AppError("No check-in found for today", 400);
  }
  if (existing.checkOutTime) {
    throw new AppError("Already checked out today", 409);
  }

  const outlet = await resolveOwnOutlet(actor);
  const distance = validatePosition(outlet, input.latitude, input.longitude);

  const [attendance] = await db
    .update(attendances)
    .set({
      checkOutTime: new Date(),
      checkOutLatitude: input.latitude,
      checkOutLongitude: input.longitude,
      checkOutDistanceMetres: distance,
      updatedAt: new Date(),
    })
    .where(eq(attendances.id, existing.id))
    .returning();

  return attendance;
}

export type AttendanceListResult = {
  items: AttendanceItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function buildAttendanceConditions(shopId: string, query: AttendanceListQuery) {
  const conditions = [eq(attendances.shopId, shopId)];

  if (query.status !== "all") {
    conditions.push(eq(attendances.status, query.status));
  }
  if (query.staffId) {
    conditions.push(eq(attendances.staffId, query.staffId));
  }
  if (query.outletId) {
    conditions.push(eq(attendances.outletId, query.outletId));
  }
  if (query.fromDate) {
    conditions.push(gte(attendances.date, query.fromDate));
  }
  if (query.toDate) {
    conditions.push(lte(attendances.date, query.toDate));
  }

  return conditions;
}

/** Every staff member's attendance, shop-wide — gated by `ATTENDANCE_VIEW`
 * (manager/admin only; a plain staff account uses `getMyAttendance`
 * instead, which never needs this permission for their own records). */
export async function listAttendance(
  actor: TenantSessionUser,
  query: AttendanceListQuery,
): Promise<AttendanceListResult> {
  if (!hasPermission(actor.role, Permission.ATTENDANCE_VIEW)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const where = and(...buildAttendanceConditions(actor.shopId, query));

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(attendances).where(where),
    baseAttendanceQuery()
      .where(where)
      .orderBy(desc(attendances.date), desc(attendances.checkInTime))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** The caller's own attendance history — never gated by `ATTENDANCE_VIEW`,
 * same "self-check bypasses the permission" reasoning as the legacy
 * backend's `get_my_attendance`. Takes a bare `shopId`/`staffId` pair
 * rather than a full `TenantSessionUser` — a server component rendering
 * just this one list doesn't need to construct one. */
export async function getMyAttendance(
  shopId: string,
  staffId: string,
  query: AttendanceListQuery,
): Promise<AttendanceListResult> {
  const where = and(
    ...buildAttendanceConditions(shopId, { ...query, staffId }),
  );

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(attendances).where(where),
    baseAttendanceQuery()
      .where(where)
      .orderBy(desc(attendances.date))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);

  const total = totalRow[0]?.value ?? 0;

  return {
    items: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export type AttendanceStats = {
  presentToday: number;
  totalStaff: number;
  correctionsThisMonth: number;
};

export async function getAttendanceStats(
  shopId: string,
): Promise<AttendanceStats> {
  const today = toDateString(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;

  const [presentRow, staffRow, correctionsRow] = await Promise.all([
    db
      .select({ value: count() })
      .from(attendances)
      .where(and(eq(attendances.shopId, shopId), eq(attendances.date, today))),
    db
      .select({ value: count() })
      .from(users)
      .where(
        and(
          eq(users.shopId, shopId),
          inArray(users.role, ["manager", "staff"]),
          eq(users.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(attendanceCorrections)
      .innerJoin(
        attendances,
        eq(attendanceCorrections.attendanceId, attendances.id),
      )
      .where(
        and(eq(attendances.shopId, shopId), gte(attendances.date, monthStart)),
      ),
  ]);

  return {
    presentToday: presentRow[0]?.value ?? 0,
    totalStaff: staffRow[0]?.value ?? 0,
    correctionsThisMonth: correctionsRow[0]?.value ?? 0,
  };
}

async function loadAttendanceForTenant(
  shopId: string,
  attendanceId: string,
): Promise<Attendance> {
  const [row] = await db
    .select()
    .from(attendances)
    .where(
      and(eq(attendances.id, attendanceId), eq(attendances.shopId, shopId)),
    )
    .limit(1);

  if (!row) {
    throw AppError.notFound("Attendance record not found");
  }

  return row;
}

/**
 * Owner-only edit to a recorded day (doc §17), always leaving an audit
 * trail — mirrors the legacy backend's `AttendanceService.correct` exactly,
 * including defaulting the status to `corrected` when the caller doesn't
 * explicitly set one.
 */
export async function correctAttendance(
  actor: TenantSessionUser,
  attendanceId: string,
  input: CorrectAttendanceInput,
): Promise<Attendance> {
  if (!hasPermission(actor.role, Permission.ATTENDANCE_CORRECT)) {
    throw AppError.forbidden("You do not have permission to do this");
  }

  const attendance = await loadAttendanceForTenant(actor.shopId, attendanceId);

  const previous = {
    checkInTime: attendance.checkInTime,
    checkOutTime: attendance.checkOutTime,
    status: attendance.status,
  };

  const nextCheckInTime = input.checkInTime
    ? new Date(input.checkInTime)
    : attendance.checkInTime;
  const nextCheckOutTime = input.checkOutTime
    ? new Date(input.checkOutTime)
    : attendance.checkOutTime;
  const nextStatus = input.status ?? "corrected";

  if (
    nextCheckOutTime &&
    nextCheckInTime &&
    nextCheckOutTime < nextCheckInTime
  ) {
    throw new AppError("Check-out cannot precede check-in", 400, [
      { field: "checkOutTime", message: "Check-out cannot precede check-in" },
    ]);
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(attendances)
      .set({
        checkInTime: nextCheckInTime,
        checkOutTime: nextCheckOutTime,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(attendances.id, attendanceId))
      .returning();

    await tx.insert(attendanceCorrections).values({
      attendanceId,
      correctedById: actor.id,
      reason: input.reason,
      previousCheckInTime: previous.checkInTime,
      previousCheckOutTime: previous.checkOutTime,
      previousStatus: previous.status,
      newCheckInTime: row.checkInTime,
      newCheckOutTime: row.checkOutTime,
      newStatus: row.status,
    });

    await recordAudit(tx, {
      shopId: actor.shopId,
      outletId: row.outletId,
      userId: actor.id,
      action: AuditAction.ATTENDANCE_CORRECTED,
      entityType: "attendance",
      entityId: row.id,
      summary: input.reason,
      before: previous,
      after: {
        checkInTime: row.checkInTime,
        checkOutTime: row.checkOutTime,
        status: row.status,
      },
    });

    return row;
  });

  return updated;
}
