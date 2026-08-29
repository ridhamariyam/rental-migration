/**
 * Geodesic helpers for GPS attendance validation (doc §17), ported exactly
 * from the legacy backend's `app/utils/geo.py`. The server always
 * recomputes the distance from the raw coordinates it's given — a
 * client-supplied "inside radius" flag is never trusted (see
 * `src/server/attendance/service.ts`).
 */

const EARTH_RADIUS_METRES = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two WGS84 points, in metres. */
export function haversineMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a));
}

/** Throws with a user-facing message for an out-of-range coordinate —
 * mirrors the legacy `validate_coordinates`'s range check (defence in
 * depth alongside the Zod schema's own `.min()`/`.max()`). */
export function assertValidCoordinates(
  latitude: number,
  longitude: number,
): void {
  if (latitude < -90 || latitude > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }
}

export type LngLat = { latitude: number; longitude: number };

/**
 * Approximates a circle of `radiusMetres` around `center` as a closed ring
 * of `[lng, lat]` points — used to draw an outlet's geofence radius on a
 * Mapbox map. Mapbox has no built-in "circle in real metres" layer (only a
 * pixel-radius circle that drifts inaccurate across zoom levels), so the
 * radius is drawn as a filled polygon ring computed here instead. This is a
 * plain, dependency-free module (no `"server-only"`), safe to import from
 * client components too.
 */
export function circleRingCoordinates(
  center: LngLat,
  radiusMetres: number,
  points = 64,
): [number, number][] {
  const coordinates: [number, number][] = [];
  const latRad = toRadians(center.latitude);

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx =
      (radiusMetres * Math.cos(angle)) /
      (EARTH_RADIUS_METRES * Math.cos(latRad));
    const dy = (radiusMetres * Math.sin(angle)) / EARTH_RADIUS_METRES;
    coordinates.push([
      center.longitude + (dx * 180) / Math.PI,
      center.latitude + (dy * 180) / Math.PI,
    ]);
  }

  return coordinates;
}

/** GeoJSON `Feature<Polygon>` wrapping `circleRingCoordinates` — the exact
 * shape a Mapbox GeoJSON source expects. */
export function circleGeoJson(center: LngLat, radiusMetres: number) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [circleRingCoordinates(center, radiusMetres)],
    },
  };
}

/** An empty polygon — used to clear a geofence circle layer's data when
 * there's no radius configured yet, instead of adding/removing the layer
 * itself every time. */
export function emptyGeoJson() {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [[]] },
  };
}

/** Human-friendly distance readout — metres for anything under 1km
 * (rounded to a whole number, matching a GPS reading's real precision),
 * kilometres with one decimal place beyond that (a raw "86025m" reads far
 * worse than "86.0km" once a staff member is checking in from the wrong
 * outlet entirely). Shared by the attendance geofence map and the
 * server's own out-of-range error message so both agree on the same
 * wording. */
export function formatDistanceMetres(metres: number): string {
  if (metres >= 1000) {
    return `${(metres / 1000).toFixed(1)}km`;
  }
  return `${Math.round(metres)}m`;
}
