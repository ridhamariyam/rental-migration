"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type mapboxgl from "mapbox-gl";
import {
  AlertCircleIcon,
  LoaderCircleIcon,
  LocateFixedIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { circleGeoJson, emptyGeoJson } from "@/lib/geo";
import {
  isMapboxConfigured,
  MAPBOX_STYLE,
  MAPBOX_TOKEN,
  searchPlaces,
  type PlaceSuggestion,
} from "@/lib/mapbox";

type LatLng = { latitude: number; longitude: number };

// Kerala-ish default centre (this tenant's own demo data lives around
// Kochi) — only ever used before any real coordinate exists yet, so the
// map isn't just a blank grey square on first open.
const DEFAULT_CENTER: LatLng = { latitude: 10.8505, longitude: 76.2673 };

/**
 * Interactive location picker for an outlet's geofence — click the map or
 * drag the marker to set the point, search an address, or use the
 * browser's own current location. Falls back to a plain "use my current
 * location" button (no map) when `NEXT_PUBLIC_MAPBOX_TOKEN` isn't
 * configured yet, so the feature degrades instead of breaking the form.
 *
 * `mapbox-gl` is loaded via a dynamic `import()` inside `useEffect` (never
 * at module top level) — it touches `window`/`document` at construction
 * time and this component may still be part of a server-rendered tree.
 */
export function MapboxLocationPicker({
  latitude,
  longitude,
  radiusMetres,
  onChange,
  disabled,
}: {
  latitude: number | null;
  longitude: number | null;
  radiusMetres: number | null;
  onChange: (next: LatLng) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapboxModRef = useRef<typeof mapboxgl | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const configured = isMapboxConfigured();

  function placeMarker(map: mapboxgl.Map, mod: typeof mapboxgl, at: LatLng) {
    if (!markerRef.current) {
      markerRef.current = new mod.Marker({ draggable: !disabled, color: "#e11d48" })
        .setLngLat([at.longitude, at.latitude])
        .addTo(map);
      markerRef.current.on("dragend", () => {
        const target = markerRef.current!.getLngLat();
        onChangeRef.current({ latitude: target.lat, longitude: target.lng });
      });
    } else {
      markerRef.current.setLngLat([at.longitude, at.latitude]);
    }
  }

  // Initialise the map once, client-side only.
  useEffect(() => {
    if (!configured || !containerRef.current || mapRef.current) return;

    let cancelled = false;

    import("mapbox-gl").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const mapboxgl = mod.default;
      mapboxModRef.current = mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const hasPoint = latitude != null && longitude != null;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: MAPBOX_STYLE,
        center: hasPoint
          ? [longitude!, latitude!]
          : [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
        zoom: hasPoint ? 15 : 4,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      if (hasPoint) {
        placeMarker(map, mapboxgl, { latitude: latitude!, longitude: longitude! });
      }

      if (!disabled) {
        map.on("click", (event) => {
          const next = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
          placeMarker(map, mapboxgl, next);
          onChangeRef.current(next);
        });
      }

      map.on("load", () => {
        map.addSource("geofence", {
          type: "geojson",
          data:
            hasPoint && radiusMetres
              ? circleGeoJson({ latitude: latitude!, longitude: longitude! }, radiusMetres)
              : emptyGeoJson(),
        });
        map.addLayer({
          id: "geofence-fill",
          type: "fill",
          source: "geofence",
          paint: { "fill-color": "#e11d48", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "geofence-line",
          type: "line",
          source: "geofence",
          paint: { "line-color": "#e11d48", "line-width": 2 },
        });
        setMapReady(true);
      });

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Deliberately init-once: subsequent lat/lng/radius changes are synced
    // by the effect below instead of re-creating the whole map instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, disabled]);

  // Keep the marker + geofence circle in sync with external changes (a
  // manual lat/long/radius edit, a search result, "use my location", etc).
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxModRef.current;
    if (!map || !mapboxgl || !mapReady) return;

    if (latitude != null && longitude != null) {
      placeMarker(map, mapboxgl, { latitude, longitude });
    }

    const source = map.getSource("geofence") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(
      latitude != null && longitude != null && radiusMetres
        ? circleGeoJson({ latitude, longitude }, radiusMetres)
        : emptyGeoJson(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, radiusMetres, mapReady]);

  function flyAndSelect(next: LatLng) {
    const map = mapRef.current;
    const mapboxgl = mapboxModRef.current;
    if (map && mapboxgl) {
      placeMarker(map, mapboxgl, next);
      map.flyTo({ center: [next.longitude, next.latitude], zoom: 16 });
    }
    onChangeRef.current(next);
  }

  function handleSearchChange(value: string) {
    setQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchAbortRef.current?.abort();

    if (!value.trim()) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      searchPlaces(value, {
        proximity:
          latitude != null && longitude != null ? { latitude, longitude } : undefined,
        signal: controller.signal,
      })
        .then(setSuggestions)
        .finally(() => setIsSearching(false));
    }, 400);
  }

  function handleUseCurrentLocation() {
    setLocateError(null);
    if (!("geolocation" in navigator)) {
      setLocateError("Your browser doesn't support location access");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        flyAndSelect({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        setIsLocating(false);
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied — allow it for this site and try again."
            : "Couldn't get your current location.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {configured ? (
        <div className="relative">
          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              disabled={disabled}
              placeholder="Search for an address or place…"
              className="pl-8"
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            {isSearching ? (
              <LoaderCircleIcon className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin" />
            ) : null}
          </div>
          {suggestions.length > 0 ? (
            <ul className="bg-popover ring-foreground/10 absolute z-10 mt-1 w-full overflow-hidden rounded-lg shadow-md ring-1">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    className="hover:bg-accent w-full px-3 py-2 text-left text-sm"
                    onClick={() => {
                      flyAndSelect({
                        latitude: suggestion.latitude,
                        longitude: suggestion.longitude,
                      });
                      setQuery(suggestion.name);
                      setSuggestions([]);
                    }}
                  >
                    {suggestion.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {configured ? (
        <div
          ref={containerRef}
          className="ring-foreground/10 h-64 w-full overflow-hidden rounded-lg ring-1"
        />
      ) : (
        <div className="bg-muted/40 ring-foreground/10 flex items-start gap-2 rounded-lg p-3 text-sm ring-1">
          <AlertCircleIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <p className="text-muted-foreground">
            Add <code className="text-foreground">NEXT_PUBLIC_MAPBOX_TOKEN</code> to
            enable the interactive map. You can still use your current
            location below or enter coordinates manually.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isLocating}
          onClick={handleUseCurrentLocation}
          className="self-start"
        >
          {isLocating ? <LoaderCircleIcon className="animate-spin" /> : <LocateFixedIcon />}
          Use my current location
        </Button>
        {locateError ? (
          <p className="text-destructive text-xs">{locateError}</p>
        ) : null}
      </div>
    </div>
  );
}
