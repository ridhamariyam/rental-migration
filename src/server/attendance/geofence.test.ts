/**
 * Check-in geofence: phone GPS indoors is often tens of metres off, so the
 * reported accuracy is forgiven — but only up to a cap.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validatePosition } from "@/server/attendance/service";

// ~0.001° latitude ≈ 111 m.
const outlet = { latitude: 10, longitude: 76, allowedRadiusMetres: 100, name: "Kochi" };

test("inside the radius is accepted", () => {
  assert.ok((validatePosition(outlet, 10.0005, 76) ?? 0) < 100);
});

test("just outside the radius passes when the phone says its fix is that vague", () => {
  assert.throws(() => validatePosition(outlet, 10.0012, 76), /Attendance is only accepted/);
  assert.doesNotThrow(() => validatePosition(outlet, 10.0012, 76, 60));
});

test("a wildly vague fix can't stretch the radius past the cap", () => {
  assert.throws(
    () => validatePosition(outlet, 10.003, 76, 5000),
    /Attendance is only accepted/,
    "333 m away with ±5 km accuracy must still be refused",
  );
});

test("an outlet with no geofence doesn't block check-in", () => {
  assert.equal(
    validatePosition({ ...outlet, latitude: null, longitude: null }, 10.5, 76.5),
    null,
  );
});
