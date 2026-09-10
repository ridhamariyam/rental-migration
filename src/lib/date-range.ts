/**
 * Calendar-day arithmetic on `YYYY-MM-DD` strings.
 *
 * These dates are *calendar* dates — a pickup day, a return day, a row on
 * a revenue chart — not instants, so they must never be routed through a
 * local-timezone `Date`. Mixing the two is what made the dashboard's
 * revenue chart render a flat ₹0 line for every user east of UTC: the
 * walk parsed `new Date("2026-08-28T00:00:00")` as *local* midnight and
 * formatted it back with `toISOString()` as *UTC*, shifting every key a
 * day earlier so none of them matched the data (RQ-04).
 *
 * Plain module (no `server-only`) — the chart needs it client-side and
 * the availability calculation needs it on the server.
 */

/** The calendar day after `date`, carrying month and year boundaries. */
export function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  // `Date.UTC` is fixed-origin arithmetic: no local zone is consulted, so
  // the result is the same wherever this runs.
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Every calendar day from `fromDate` to `toDate`, both ends included. */
export function* eachDayInclusive(
  fromDate: string,
  toDate: string,
): Generator<string> {
  let cursor = fromDate;
  // A rental is capped at 365 days and a report window at a couple of
  // years; the guard is only there so a malformed range cannot spin.
  for (let guard = 0; cursor <= toDate && guard < 4000; guard += 1) {
    yield cursor;
    cursor = nextDay(cursor);
  }
}
