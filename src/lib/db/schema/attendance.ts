import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { date } from "drizzle-orm/pg-core";
import { attendanceStatusEnum } from "@/lib/db/schema/enums";
import { shops } from "@/lib/db/schema/shops";
import { outlets } from "@/lib/db/schema/outlets";
import { users } from "@/lib/db/schema/users";

/**
 * One staff attendance day, validated against the outlet geofence (doc
 * §17), mirroring the legacy backend's `Attendance`. The backend always
 * recomputes `check*DistanceMetres` itself from the raw coordinates
 * (`src/lib/geo.ts`) — a client-supplied "inside radius" flag is never
 * trusted. Reverse-geocoded addresses (the legacy model's
 * `check_in_address`/`check_out_address`) are deliberately not carried
 * over — that needs a geocoding provider/API key this project has none of
 * configured; raw coordinates are enough to prove/audit *where* a
 * check-in happened, and were the only geofence input that ever mattered.
 */
export const attendances = pgTable(
  "attendances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").references(() => outlets.id, {
      onDelete: "set null",
    }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: attendanceStatusEnum("status").notNull().default("present"),
    checkInTime: timestamp("check_in_time", { withTimezone: true }).notNull(),
    checkInLatitude: doublePrecision("check_in_latitude").notNull(),
    checkInLongitude: doublePrecision("check_in_longitude").notNull(),
    checkInDistanceMetres: doublePrecision("check_in_distance_metres"),
    checkOutTime: timestamp("check_out_time", { withTimezone: true }),
    checkOutLatitude: doublePrecision("check_out_latitude"),
    checkOutLongitude: doublePrecision("check_out_longitude"),
    checkOutDistanceMetres: doublePrecision("check_out_distance_metres"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One attendance row per staff member per calendar day — a second
    // check-in the same day is a re-check, not a new record.
    uniqueIndex("uq_attendance_staff_date").on(table.staffId, table.date),
    index("ix_attendances_shop_id").on(table.shopId),
    index("ix_attendances_outlet_id").on(table.outletId),
    index("ix_attendances_date").on(table.date),
  ],
);

export type Attendance = typeof attendances.$inferSelect;
export type NewAttendance = typeof attendances.$inferInsert;

/**
 * Audit trail for an owner's edit to a recorded attendance day (doc §17's
 * "The Shop Owner can review attendance and manually correct it"), mirroring
 * the legacy backend's `AttendanceCorrection`. Rows here are inserted, never
 * updated/deleted, so a correction's own history can't itself be silently
 * rewritten later.
 */
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attendanceId: uuid("attendance_id")
      .notNull()
      .references(() => attendances.id, { onDelete: "cascade" }),
    correctedById: uuid("corrected_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    previousCheckInTime: timestamp("previous_check_in_time", {
      withTimezone: true,
    }),
    previousCheckOutTime: timestamp("previous_check_out_time", {
      withTimezone: true,
    }),
    previousStatus: text("previous_status"),
    newCheckInTime: timestamp("new_check_in_time", { withTimezone: true }),
    newCheckOutTime: timestamp("new_check_out_time", { withTimezone: true }),
    newStatus: text("new_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_attendance_corrections_attendance_id").on(table.attendanceId),
  ],
);

export type AttendanceCorrection = typeof attendanceCorrections.$inferSelect;
export type NewAttendanceCorrection =
  typeof attendanceCorrections.$inferInsert;
