/**
 * Booking number candidate generator, ported from the legacy backend's
 * `BookingService._generate_booking_number`. Pure/no DB access — the
 * uniqueness-checked retry loop lives in
 * `src/server/bookings/service.ts` (same split as `src/lib/barcode.ts`'s
 * generators vs. the DB-aware allocation loop in
 * `src/server/variations/service.ts`).
 */
export function generateBookingNumberCandidate(): string {
  const random = Math.floor(Math.random() * 900000) + 100000;
  return `BK${random}`;
}
