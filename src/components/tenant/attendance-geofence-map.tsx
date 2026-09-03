"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type mapboxgl from "mapbox-gl";
import { AlertCircleIcon, MapPinIcon } from "lucide-react";
import {
  circleGeoJson,
  emptyGeoJson,
  formatDistanceMetres,
  haversineMetres,
} from "@/lib/geo";
import { isMapboxConfigured, MAPBOX_STYLE, MAPBOX_TOKEN } from "@/lib/mapbox";

export type AttendanceOutletGeofence = {
  name: string;
  latitude: number | null;
  longitude: number | null;
  allowedRadiusMetres: number;
};

// Same default centre used by the outlet location picker, for consistency
// when neither the outlet nor the staff member's position is known yet.
const DEFAULT_CENTER = { latitude: 10.8505, longitude: 76.2673 };

// `navigator.geolocation`'s presence never changes at runtime, so there's
// nothing to subscribe to — this never notifies, it just lets
// `useSyncExternalStore` supply the right snapshot per environment (same
// `use-mobile.ts` pattern: no `setState` in an effect, no hydration
// mismatch, since React expects the server/client snapshots to disagree).
function subscribeNever() {
  return () => {};
}

function getGeolocationSupportSnapshot() {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

function getServerGeolocationSupportSnapshot() {
  return true;
}

function useHasGeolocationSupport() {
  return useSyncExternalStore(
    subscribeNever,
    getGeolocationSupportSnapshot,
    getServerGeolocationSupportSnapshot,
  );
}

/**
 * Read-only "am I close enough" map shown on the self check-in/out card —
 * live-tracks the staff member's own position (`watchPosition`, distinct
 * from the one-shot `getCurrentPosition` the actual check-in/out submit
 * uses) purely so they can see themselves relative to the outlet and its
 * geofence circle before tapping the button. The server always
 * re-validates the real submitted coordinates itself — this is visual
 * feedback only, never trusted for the actual decision.
 *
 * Degrades to a plain text distance readout (no map) when
 * `NEXT_PUBLIC_MAPBOX_TOKEN` isn't configured, or when the outlet has no
 * geofence point set at all.
 */
export function AttendanceGeofenceMap({
  outlet,
}: {
  outlet: AttendanceOutletGeofence | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapboxModRef = useRef<typeof mapboxgl | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const meMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [position, setPosition] = useState<GeolocationCoordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasGeolocationSupport = useHasGeolocationSupport();

  const configured = isMapboxConfigured();
  const hasGeofence = outlet?.latitude != null && outlet?.longitude != null;

  // Live-track the staff member's own position purely for on-map feedback.
  useEffect(() => {
    if (!hasGeolocationSupport) return;

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setLocationError(null);
        setPosition(result.coords);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location access denied — allow it to see your distance from the outlet."
            : "Couldn't get your current location.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [hasGeolocationSupport]);

  // Initialise the map once, client-side only.
  useEffect(() => {
    if (!configured || !containerRef.current || mapRef.current) return;

    let cancelled = false;

    import("mapbox-gl").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const mapboxgl = mod.default;
      mapboxModRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const center = hasGeofence
        ? { latitude: outlet!.latitude!, longitude: outlet!.longitude! }
        : DEFAULT_CENTER;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAPBOX_STYLE,
        center: [center.longitude, center.latitude],
        zoom: hasGeofence ? 16 : 4,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      map.on("load", () => {
        map.addSource("geofence", {
          type: "geojson",
          data: hasGeofence
            ? circleGeoJson(
                { latitude: outlet!.latitude!, longitude: outlet!.longitude! },
                outlet!.allowedRadiusMetres,
              )
            : emptyGeoJson(),
        });
        map.addLayer({
          id: "geofence-fill",
          type: "fill",
          source: "geofence",
          paint: { "fill-color": "#059669", "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: "geofence-line",
          type: "line",
          source: "geofence",
          paint: { "line-color": "#059669", "line-width": 2 },
        });

        if (hasGeofence) {
          new mapboxgl.Marker({ color: "#059669" })
            .setLngLat([outlet!.longitude!, outlet!.latitude!])
            .setPopup(new mapboxgl.Popup({ closeButton: false }).setText(outlet!.name))
            .addTo(map);
        }

        setMapReady(true);
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      meMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // Keep the "you are here" marker synced with the live position, and
  // frame the map to show both points once a fix is available.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxModRef.current;
    if (!map || !mapboxgl || !mapReady || !position) return;

    if (!meMarkerRef.current) {
      const el = document.createElement("div");
      el.className =
        "size-3.5 rounded-full bg-blue-500 ring-4 ring-blue-500/30 border-2 border-white shadow";
      meMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([position.longitude, position.latitude])
        .addTo(map);
    } else {
      meMarkerRef.current.setLngLat([position.longitude, position.latitude]);
    }

    if (hasGeofence) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([position.longitude, position.latitude]);
      bounds.extend([outlet!.longitude!, outlet!.latitude!]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 17 });
    } else {
      map.flyTo({ center: [position.longitude, position.latitude], zoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.latitude, position?.longitude, mapReady]);

  const distance =
    hasGeofence && position
      ? Math.round(
          haversineMetres(
            position.latitude,
            position.longitude,
            outlet!.latitude!,
            outlet!.longitude!,
          ),
        )
      : null;

  const withinRange =
    distance != null && outlet ? distance <= outlet.allowedRadiusMetres : null;

  const displayedError =
    locationError ??
    (!hasGeolocationSupport ? "Your browser doesn't support location access" : null);

  return (
    <div className="flex flex-col gap-2">
      {configured ? (
        <div
          ref={containerRef}
          className="ring-foreground/10 h-40 w-full overflow-hidden rounded-lg ring-1"
        />
      ) : null}

      {displayedError ? (
        <p className="text-destructive flex items-center gap-1.5 text-xs">
          <AlertCircleIcon className="size-3.5 shrink-0" />
          {displayedError}
        </p>
      ) : distance != null ? (
        <p
          className={`flex items-center gap-1.5 text-xs font-medium ${
            withinRange ? "text-primary" : "text-destructive"
          }`}
        >
          <MapPinIcon className="size-3.5 shrink-0" />
          {formatDistanceMetres(distance)} from {outlet?.name}{" "}
          {withinRange
            ? "(within range)"
            : `(outside the ${formatDistanceMetres(outlet!.allowedRadiusMetres)} range)`}
        </p>
      ) : outlet && !hasGeofence ? (
        <p className="text-muted-foreground text-xs">
          This outlet has no geofence configured — any location is accepted.
        </p>
      ) : null}
    </div>
  );
}
