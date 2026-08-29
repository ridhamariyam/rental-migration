/**
 * Mapbox integration (outlet location picker + attendance geofence map).
 * `NEXT_PUBLIC_MAPBOX_TOKEN` is a *public* Mapbox access token — meant to
 * ship in client JS (scope/restrict it to your own URLs from the Mapbox
 * account dashboard, never put a secret token here). This is a plain,
 * `"server-only"`-free module so it can be imported from client components;
 * referencing `process.env.NEXT_PUBLIC_*` directly like this is what lets
 * Next.js inline the value into the client bundle at build time.
 *
 * The token is optional at build/boot time on purpose — see
 * `.env.example` — every consumer of `isMapboxConfigured()` degrades to a
 * plain manual-entry fallback (no map) when it isn't set yet, rather than
 * crashing.
 */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

export function isMapboxConfigured(): boolean {
  return MAPBOX_TOKEN.trim().length > 0;
}

export type PlaceSuggestion = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

/**
 * Forward geocoding via Mapbox's Geocoding API — a plain `fetch`, no extra
 * SDK dependency needed for a simple "search for an address" input. Returns
 * `[]` on any failure (missing token, network error, no results) so a
 * search box can just show "no results" rather than surface a raw error.
 */
export async function searchPlaces(
  query: string,
  options: { proximity?: LngLatInput; signal?: AbortSignal } = {},
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (!MAPBOX_TOKEN || !trimmed) {
    return [];
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json`,
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", "5");
  if (options.proximity) {
    url.searchParams.set(
      "proximity",
      `${options.proximity.longitude},${options.proximity.latitude}`,
    );
  }

  try {
    const response = await fetch(url.toString(), { signal: options.signal });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      features?: { id: string; place_name: string; center: [number, number] }[];
    };

    return (data.features ?? []).map((feature) => ({
      id: feature.id,
      name: feature.place_name,
      longitude: feature.center[0],
      latitude: feature.center[1],
    }));
  } catch {
    return [];
  }
}

type LngLatInput = { latitude: number; longitude: number };
