"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { AlertTriangle, MapPin, RefreshCw, Signal, SignalLow } from "lucide-react";
import { DRIVE_CITY, formatDistanceShort, haversineMeters, type DrivePlace } from "@/lib/config/drive";

/**
 * NaijaDrive trip map.
 *
 * Two rendering modes, both honest about what they show:
 *
 *  - "tiles": Leaflet + OpenStreetMap raster tiles. The line drawn between the two
 *    landmarks is a straight line, NOT a turn-by-turn road route, and the caption
 *    says so. Fares come from the server quote, not from this drawing.
 *  - "schematic": a vector diagram of the same two points with no external tiles.
 *    Used deliberately in low-data mode and automatically if tiles fail, so a
 *    2G connection never blocks booking.
 *
 * Landmarks are encoded by shape AND colour AND text (circle + "Pick-up",
 * square + "Drop-off") so the trip reads correctly without colour vision.
 */

type DriveMapProps = {
  pickup: DrivePlace | null;
  dropoff: DrivePlace | null;
  /** Road distance from the fare quote, when one has loaded. */
  roadDistanceMeters?: number | null;
  lowData: boolean;
  onLowDataChange: (next: boolean) => void;
};

type MapStatus = "idle" | "loading" | "ready" | "failed";

const LAGOS_CENTER: [number, number] = [6.5244, 3.3792];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const PICKUP_COLOR = "#006d38";
const DROPOFF_COLOR = "#101418";
/** Give up on tiles after this many failures so we can fall back quickly on a dead link. */
const TILE_ERROR_LIMIT = 4;

export function DriveMap({ pickup, dropoff, roadDistanceMeters, lowData, onLowDataChange }: DriveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const tileErrorsRef = useRef(0);
  /** False once the Leaflet instance is torn down, so late callbacks are ignored. */
  const aliveRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>("idle");
  const [rebuildKey, setRebuildKey] = useState(0);

  // Create and destroy the Leaflet instance. Leaflet touches `window`, so it is
  // imported at runtime and never on the server.
  useEffect(() => {
    if (lowData) {
      setStatus("idle");
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: LeafletMap | null = null;
    setStatus("loading");
    tileErrorsRef.current = 0;

    void (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;

        map = L.map(container, {
          zoomControl: true,
          // Never hijack page scrolling: on mobile a wheel/touch scroll over the
          // map must still move the page, not the map.
          scrollWheelZoom: false,
          dragging: true,
          keyboard: true,
          attributionControl: true
        });
        map.setView(LAGOS_CENTER, 11);

        const tiles = L.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 19,
          minZoom: 8
        });
        tiles.on("tileerror", () => {
          tileErrorsRef.current += 1;
          if (tileErrorsRef.current >= TILE_ERROR_LIMIT && !cancelled) setStatus("failed");
        });
        tiles.addTo(map);

        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        aliveRef.current = true;
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      // Order matters: mark the instance dead before Leaflet touches the DOM, so a
      // ResizeObserver callback or tile handler that is already queued cannot reach it.
      aliveRef.current = false;
      layerRef.current = null;
      mapRef.current = null;
      try {
        map?.remove();
      } catch {
        // A map detached by the same commit can throw here; nothing to recover.
      }
      map = null;
    };
  }, [lowData, rebuildKey]);

  // Draw markers and the connecting line whenever the two ends change.
  useEffect(() => {
    if (status !== "ready" || lowData) return;
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (cancelled || !aliveRef.current || !map || !layer || !map.getContainer().isConnected) return;

      layer.clearLayers();

      if (pickup) layer.addLayer(markerFor(L, pickup, "pickup"));
      if (dropoff) layer.addLayer(markerFor(L, dropoff, "dropoff"));

      if (pickup && dropoff) {
        layer.addLayer(
          L.polyline(
            [
              [pickup.lat, pickup.lng],
              [dropoff.lat, dropoff.lng]
            ],
            { color: DROPOFF_COLOR, weight: 3, opacity: 0.75, dashArray: "7 9", lineCap: "round" }
          )
        );
      }

      const straight = pickup && dropoff ? haversineMeters(pickup, dropoff) : 0;
      if (pickup && dropoff && straight > 60) {
        map.fitBounds(
          L.latLngBounds([
            [pickup.lat, pickup.lng],
            [dropoff.lat, dropoff.lng]
          ]).pad(0.35),
          { animate: false }
        );
      } else if (pickup) {
        map.setView([pickup.lat, pickup.lng], 14, { animate: false });
      } else if (dropoff) {
        map.setView([dropoff.lat, dropoff.lng], 14, { animate: false });
      } else {
        map.setView(LAGOS_CENTER, 11, { animate: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff, status, lowData]);

  // A container resized by layout changes needs Leaflet to recompute its size.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || status !== "ready" || lowData) return;

    const observer = new ResizeObserver(() => {
      // A queued callback can arrive after teardown; never touch a dead map.
      if (!aliveRef.current || !map.getContainer().isConnected) return;
      try {
        map.invalidateSize();
      } catch {
        // The instance was removed between the guard and the call.
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [status, lowData, rebuildKey]);

  const straightMeters = pickup && dropoff ? haversineMeters(pickup, dropoff) : null;
  const displayMeters = roadDistanceMeters ?? straightMeters;
  const showSchematic = lowData || status === "failed";

  return (
    <section aria-labelledby="trip-map-heading" className="min-w-0 overflow-hidden rounded-2xl border border-border-soft bg-canvas">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft p-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="trip-map-heading" className="truncate text-sm font-extrabold">
              Your route
            </h2>
            <p className="truncate text-[11px] text-muted">{DRIVE_CITY} · landmarks, not street numbers</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onLowDataChange(!lowData)}
          aria-pressed={lowData}
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            lowData ? "border-primary bg-primary-soft text-primary" : "border-border-soft bg-canvas text-muted"
          }`}
        >
          {lowData ? <SignalLow className="h-3.5 w-3.5" aria-hidden="true" /> : <Signal className="h-3.5 w-3.5" aria-hidden="true" />}
          Low data {lowData ? "on" : "off"}
        </button>
      </div>

      <div className="relative">
        {showSchematic ? (
          <DriveRouteDiagram pickup={pickup} dropoff={dropoff} />
        ) : (
          <div
            ref={containerRef}
            className="h-[260px] w-full bg-surface-low sm:h-[320px]"
            role="region"
            aria-label="Route map showing pickup and drop-off"
          />
        )}

        {status === "loading" && !lowData ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center bg-surface-low/90 text-xs font-bold text-muted">
            Loading map…
          </p>
        ) : null}
      </div>

      {status === "failed" && !lowData ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber/40 bg-amber-soft p-3">
          <p className="flex min-w-0 items-start gap-2 text-[11px] font-bold text-ink">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Map tiles did not load. The diagram above still shows your two landmarks and bookings and
              fares are unaffected.
            </span>
          </p>
          <button
            type="button"
            onClick={() => setRebuildKey((value) => value + 1)}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ink/20 bg-canvas px-2.5 text-[11px] font-bold"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Retry map
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-soft p-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/25" />
            Pick-up
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-night" />
            Drop-off
          </li>
          {displayMeters ? (
            <li className="text-muted">
              {lowData ? "Straight line" : "Road distance"} {formatDistanceShort(displayMeters)}
            </li>
          ) : null}
        </ul>
        <p className="text-[10px] leading-snug text-muted">
          {lowData
            ? "Schematic view: no map tiles downloaded."
            : "The dashed line joins the two landmarks; it is not a turn-by-turn road route."}
        </p>
      </div>
    </section>
  );
}

function markerFor(L: typeof import("leaflet"), place: DrivePlace, kind: "pickup" | "dropoff") {
  const color = kind === "pickup" ? PICKUP_COLOR : DROPOFF_COLOR;
  const borderRadius = kind === "pickup" ? "50%" : "5px";
  const letter = kind === "pickup" ? "P" : "D";

  const icon = L.divIcon({
    className: "nd-map-pin",
    html: `<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:${borderRadius};background:${color};border:3px solid #fff;color:#fff;font:800 12px/1 Inter,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.45)">${letter}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  const marker = L.marker([place.lat, place.lng], {
    icon,
    title: `${kind === "pickup" ? "Pick-up" : "Drop-off"}: ${place.label}`
  });

  // The landmark name travels with the pin, so a glance at the map identifies the
  // trip without cross-reading the form.
  marker.bindTooltip(place.label, {
    permanent: true,
    direction: "top",
    offset: [0, -16],
    className: "nd-map-tooltip",
    opacity: 1
  });

  return marker;
}

/**
 * Tile-free diagram. Positions are the real relative latitude/longitude of the two
 * landmarks inside Lagos, clamped so a coordinate near the edge still has room for
 * its label. Nothing here is decorative: remove the map and the trip still reads.
 */
function DriveRouteDiagram({ pickup, dropoff }: { pickup: DrivePlace | null; dropoff: DrivePlace | null }) {
  const points = [pickup, dropoff].filter(Boolean) as DrivePlace[];

  if (points.length === 0) {
    return (
      <div className="grid h-[260px] w-full place-items-center bg-surface-low px-6 text-center sm:h-[320px]">
        <p className="max-w-xs text-sm text-muted">
          Choose a pick-up and drop-off landmark to see them on the route diagram.
        </p>
      </div>
    );
  }

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), 0.03);
  const spanLng = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.03);
  const minLat = Math.min(...lats) - spanLat * 0.18;
  const minLng = Math.min(...lngs) - spanLng * 0.18;
  const totalLat = spanLat * 1.36;
  const totalLng = spanLng * 1.36;

  const project = (place: DrivePlace) => ({
    x: Math.min(310, Math.max(90, ((place.lng - minLng) / totalLng) * 400)),
    y: Math.min(180, Math.max(40, (1 - (place.lat - minLat) / totalLat) * 220))
  });

  const from = pickup ? project(pickup) : null;
  const to = dropoff ? project(dropoff) : null;

  return (
    <svg
      viewBox="0 0 400 220"
      className="h-[260px] w-full bg-surface-low sm:h-[320px]"
      role="img"
      aria-label={
        from && to
          ? `Route diagram from ${pickup?.label} to ${dropoff?.label}`
          : from
            ? `Pick-up at ${pickup?.label}`
            : `Drop-off at ${dropoff?.label}`
      }
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="nd-map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="#d8dfd8" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="400" height="220" fill="url(#nd-map-grid)" />

      {from && to ? (
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="#101418"
          strokeWidth="3"
          strokeDasharray="7 8"
          strokeLinecap="round"
          opacity="0.7"
        />
      ) : null}

      {from ? (
        <g>
          <circle cx={from.x} cy={from.y} r="10" fill={PICKUP_COLOR} stroke="#fff" strokeWidth="3" />
          <text x={from.x} y={from.y + 29} textAnchor="middle" fontSize="11" fontWeight="800" fill="#191c1e">
            Pick-up
          </text>
          <text x={from.x} y={from.y + 42} textAnchor="middle" fontSize="9.5" fill="#4B5563">
            {truncate(pickup?.label ?? "", 30)}
          </text>
        </g>
      ) : null}

      {to ? (
        <g>
          <rect x={to.x - 9} y={to.y - 9} width="18" height="18" rx="3" fill={DROPOFF_COLOR} stroke="#fff" strokeWidth="3" />
          <text x={to.x} y={to.y + 29} textAnchor="middle" fontSize="11" fontWeight="800" fill="#191c1e">
            Drop-off
          </text>
          <text x={to.x} y={to.y + 42} textAnchor="middle" fontSize="9.5" fill="#4B5563">
            {truncate(dropoff?.label ?? "", 30)}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
