/**
 * Shared date/number presentation — kept in one place so table cells and
 * detail pages never disagree on formatting (mirrors the old frontend's
 * own rule that presentation logic doesn't get reinvented per component).
 */
export function formatDate(
  value: Date | string,
  style: "medium" | "long" = "medium",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: style }).format(date);
}

/** A timestamp's date *and* time together (e.g. a check-in/check-out
 * moment) — `formatDate` alone drops the time of day. */
export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Just the time of day — for a table cell where the date is already
 * implied by its own column/row (e.g. an attendance list's own `date`
 * column already shown alongside a check-in time). */
export function formatTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(date);
}

/**
 * Renders a raw minute count as "7h 45m" / "45m" / "3h" — shared by the
 * per-day attendance duration below and the salary payslip's period
 * totals (`total_worked_minutes`).
 */
export function formatMinutes(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Sunday"…"Saturday" for a salary config's `weeklyOffDay` (`0`–`6`), or
 * "None" when there isn't one. */
export function formatWeeklyOffDay(weeklyOffDay: number | null): string {
  return weeklyOffDay === null ? "None" : WEEKDAY_NAMES[weeklyOffDay];
}

/**
 * Total hours worked between a check-in and check-out, e.g. "7h 45m" —
 * `null` (rendered as "—") while still checked in, since there's no
 * checkout time to measure against yet.
 */
export function formatWorkedHours(
  checkInTime: Date | string,
  checkOutTime: Date | string | null,
): string | null {
  if (!checkOutTime) return null;

  const checkIn = typeof checkInTime === "string" ? new Date(checkInTime) : checkInTime;
  const checkOut =
    typeof checkOutTime === "string" ? new Date(checkOutTime) : checkOutTime;

  const totalMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000);
  return formatMinutes(totalMinutes);
}

/**
 * Money always crosses the API as a string (see CLAUDE.md's `Decimal`/
 * `Numeric(12,2)` rule) — this is purely presentation, never arithmetic.
 */
export function formatMoney(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * A plain `YYYY-MM-DD` string (what `dateStringSchema`/a Postgres `date`
 * column store) parsed as a **local** calendar date, never UTC — `new
 * Date("2024-01-15")` parses as UTC midnight, which renders as the 14th in
 * any timezone behind UTC. Used to hand a value to `react-day-picker`,
 * which works in `Date` objects.
 */
export function parseDateString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The inverse of `parseDateString` — a local `Date` back to `YYYY-MM-DD`,
 * never `.toISOString()` (that converts to UTC first, risking the same
 * off-by-one-day shift). */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const PAYROLL_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * How a payroll period reads: "September 2026" when it is exactly one
 * calendar month, and the two dates otherwise ("12 – 25 Sept 2026").
 * Payslips can now be run for any stretch of days, and a range that is not
 * a month has no month to be named after.
 */
export function formatPayrollPeriod(period: {
  periodStart: string;
  periodEnd: string;
  periodYear: number | null;
  periodMonth: number | null;
}): string {
  if (period.periodYear && period.periodMonth) {
    return `${PAYROLL_MONTH_LABELS[period.periodMonth - 1]} ${period.periodYear}`;
  }
  return `${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`;
}
