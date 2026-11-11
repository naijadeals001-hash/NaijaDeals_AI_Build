"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { Crosshair, LocateFixed, MapPin, Navigation, Route, TriangleAlert } from "lucide-react";

export type MapPoint = { lat: number; lng: number; label: string };
export type MapDriver = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  capturedAt: string | number;
  stale?: boolean;
};

type TripMapProps = {
  pickup?: MapPoint | null;
  dropoff?: MapPoint | null;
  driver?: MapDriver | null;
  route?: Array<{ lat: number; lng: number }> | null;
  title?: string;
  caption?: string;
  heightClass?: string;
  showControls?: boolean;
  routeUnavailable?: boolean;
  emptyMessage?: string;
  followInitially?: boolean;
};

type MapStatus = "loading" | "ready" | "failed";

const LAGOS_CENTER: [number, number] = [6.5244, 3.3792];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function pinIcon(kind: "pickup" | "dropoff") {
  const letter = kind === "pickup" ? "P" : "B";
  const radius = kind === "pickup" ? "9999px" : "4px";
  const background = kind === "pickup" ? "#0b5c33" : "#14241b";
  return `<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:${radius};background:${background};color:#fff;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);font:800 11px Inter,system-ui,sans-serif;line-height:1">${letter}</span>`;
}

function driverIcon(stale: boolean) {
  const background = stale ? "#8a938d" : "#16a34a";
  return `<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:9999px;background:${background};color:#fff;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.4);font:800 12px Inter,system-ui,sans-serif;line-height:1">D</span>`;
}

/**
 * Road map for NaijaDrive.
 *
 * OSM raster tiles plus OSRM route geometry. The component never joins two points
 * with a straight line: if the server could not return a route, no line is drawn
 * and a labelled notice explains that routing is unavailable. Driver coordinates
 * come from the tracking endpoint and are shown with an accuracy circle; a stale
 * fix is grey and labelled as the last known position.
 */
export function TripMap({
  pickup,
  dropoff,
  driver,
  route,
  title = "Trip map",
  caption,
  heightClass = "h-[320px] sm:h-[420px]",
  showControls = true,
  routeUnavailable = false,
  emptyMessage = "Pick a pick-up and destination to see the road route.",
  followInitially = false
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const tileErrorsRef = useRef(0);
  const aliveRef = useRef(false);
  const fittedRef = useRef("");
  const [status, setStatus] = useState<MapStatus>("loading");
  const [tilesFailed, setTilesFailed] = useState(false);
  const [follow, setFollow] = useState(followInitially);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    setStatus("loading");
    tileErrorsRef.current = 0;

    void (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;
        map = L.map(containerRef.current, {
          zoomControl: true,
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
          if (tileErrorsRef.current >= 4 && !cancelled) setTilesFailed(true);
        });
        tiles.addTo(map);
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        aliveRef.current = true;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      aliveRef.current = false;
      layerRef.current = null;
      mapRef.current = null;
      try {
        map?.remove();
      } catch {
        /* the container may already be detached */
      }
      map = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (cancelled || !aliveRef.current || !map || !layer || !map.getContainer().isConnected) return;
      layer.clearLayers();

      if (pickup) {
        L.marker([pickup.lat, pickup.lng], {
          icon: L.divIcon({ html: pinIcon("pickup"), className: "", iconSize: [28, 28], iconAnchor: [14, 14] }),
          title: `Pick-up: ${pickup.label}`,
          alt: `Pick-up: ${pickup.label}`,
          keyboard: true
        }).addTo(layer);
      }
      if (dropoff) {
        L.marker([dropoff.lat, dropoff.lng], {
          icon: L.divIcon({ html: pinIcon("dropoff"), className: "", iconSize: [28, 28], iconAnchor: [14, 14] }),
          title: `Drop-off: ${dropoff.label}`,
          alt: `Drop-off: ${dropoff.label}`,
          keyboard: true
        }).addTo(layer);
      }

      if (route && route.length > 1) {
        const points = route.map((point) => [point.lat, point.lng] as [number, number]);
        L.polyline(points, { color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(layer);
        L.polyline(points, { color: "#0b8f47", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(layer);
      }

      if (driver) {
        const stale = Boolean(driver.stale);
        if (driver.accuracyM && driver.accuracyM > 0) {
          L.circle([driver.lat, driver.lng], {
            radius: driver.accuracyM,
            color: stale ? "#8a938d" : "#0b8f47",
            weight: 1,
            opacity: 0.55,
            fillColor: stale ? "#8a938d" : "#0b8f47",
            fillOpacity: 0.12
          }).addTo(layer);
        }
        L.marker([driver.lat, driver.lng], {
          icon: L.divIcon({ html: driverIcon(stale), className: "", iconSize: [34, 34], iconAnchor: [17, 17] }),
          title: stale ? "Last known driver position" : "Driver position",
          alt: stale ? "Last known driver position" : "Driver position",
          keyboard: true
        }).addTo(layer);
      }

      const points: Array<[number, number]> = [];
      if (route && route.length > 1) points.push(...route.map((point) => [point.lat, point.lng] as [number, number]));
      if (pickup) points.push([pickup.lat, pickup.lng]);
      if (dropoff) points.push([dropoff.lat, dropoff.lng]);
      if (driver) points.push([driver.lat, driver.lng]);

      const fitKey = `${pickup?.lat ?? ""}:${pickup?.lng ?? ""}:${dropoff?.lat ?? ""}:${dropoff?.lng ?? ""}`;
      if (follow && driver) {
        map.panTo([driver.lat, driver.lng], { animate: false });
      } else if (points.length > 1) {
        if (fittedRef.current !== fitKey) {
          fittedRef.current = fitKey;
          map.fitBounds(L.latLngBounds(points).pad(0.18), { animate: false, maxZoom: 15 });
        }
      } else if (driver) {
        map.setView([driver.lat, driver.lng], 14, { animate: false });
      } else if (pickup) {
        map.setView([pickup.lat, pickup.lng], 13, { animate: false });
      } else if (dropoff) {
        map.setView([dropoff.lat, dropoff.lng], 13, { animate: false });
      } else {
        map.setView(LAGOS_CENTER, 11, { animate: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff, driver, route, status, follow]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || status !== "ready") return;
    const observer = new ResizeObserver(() => {
      if (!aliveRef.current || !map.getContainer().isConnected) return;
      try {
        map.invalidateSize();
      } catch {
        /* map was removed between the guard and the call */
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [status]);

  const hasRoute = Boolean(route && route.length > 1);
  const noPoints = !pickup && !dropoff && !driver;

  return (
    <section aria-labelledby="trip-map-heading" className="min-w-0 overflow-hidden rounded-2xl border border-[#dfe7df] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1ef] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#eaf5ec] text-[#0b5c33]">
            <Navigation className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="trip-map-heading" className="truncate text-[13px] font-extrabold text-[#14241b]">
              {title}
            </h2>
            <p className="truncate text-[11px] text-[#6b7a70]">
              {caption ?? (hasRoute ? "Road route from OSRM · OpenStreetMap tiles" : "Real map tiles · no decorative route line")}
            </p>
          </div>
        </div>
        {showControls ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setFollow(false);
                const map = mapRef.current;
                const points: Array<[number, number]> = [];
                if (route) points.push(...route.map((point) => [point.lat, point.lng] as [number, number]));
                if (pickup) points.push([pickup.lat, pickup.lng]);
                if (dropoff) points.push([dropoff.lat, dropoff.lng]);
                if (driver) points.push([driver.lat, driver.lng]);
                if (map && points.length > 1) {
                  const fit = async () => {
                    const L = (await import("leaflet")).default;
                    map.fitBounds(L.latLngBounds(points).pad(0.18), { animate: false, maxZoom: 15 });
                  };
                  void fit();
                }
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#dfe7df] px-2.5 text-[11px] font-bold text-[#33443a] hover:border-[#0b5c33]/40 hover:text-[#0b5c33]"
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden />
              Re-centre
            </button>
            {driver ? (
              <button
                type="button"
                aria-pressed={follow}
                onClick={() => setFollow((value) => !value)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${
                  follow
                    ? "border-[#0b5c33] bg-[#eaf5ec] text-[#0b5c33]"
                    : "border-[#dfe7df] text-[#33443a] hover:border-[#0b5c33]/40"
                }`}
              >
                <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                Follow
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className={`${heightClass} w-full bg-[#eef3ee]`}
          role="region"
          aria-label={`Map showing ${pickup ? `pick-up ${pickup.label}` : "no pick-up"}${dropoff ? `, drop-off ${dropoff.label}` : ""}${driver ? ", and the latest driver position" : ""}`}
        />
        {status === "loading" ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center bg-[#eef3ee]/85 text-xs font-bold text-[#33443a]">
            Loading map…
          </p>
        ) : null}
        {status === "failed" ? (
          <div role="status" className="absolute inset-0 grid place-items-center bg-[#f7f3e8] p-4 text-center">
            <p className="max-w-sm text-xs font-semibold leading-5 text-[#33443a]">
              <TriangleAlert className="mx-auto mb-1 h-4 w-4 text-[#a3480f]" aria-hidden />
              The map could not start in this browser. No route line is drawn. Distances and fares still
              come from the server.
            </p>
          </div>
        ) : null}
        {tilesFailed && status === "ready" ? (
          <p role="status" className="absolute left-2 top-2 max-w-[260px] rounded-lg bg-[#fff3e8] px-2.5 py-1.5 text-[10.5px] font-semibold leading-4 text-[#a3480f]">
            Map tiles did not load. Markers and route geometry below still come from the server.
          </p>
        ) : null}
        {noPoints ? (
          <p className="pointer-events-none absolute inset-x-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-[11px] font-semibold text-[#6b7a70] shadow-sm">
            {emptyMessage}
          </p>
        ) : null}
        {routeUnavailable && !noPoints ? (
          <p role="status" className="absolute inset-x-3 bottom-3 flex items-start gap-1.5 rounded-lg bg-[#fff3e8] px-3 py-2 text-[11px] font-semibold leading-4 text-[#a3480f]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Road routing is unavailable right now, so only the confirmed points are shown. No straight
            line is drawn as a substitute.
          </p>
        ) : null}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#eef1ef] px-3 py-2 text-[10.5px] text-[#6b7a70]">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3 text-[#0b5c33]" aria-hidden /> Pick-up and drop-off are confirmed landmarks
        </span>
        {driver ? (
          <span className="inline-flex items-center gap-1">
            <Route className="h-3 w-3 text-[#0b5c33]" aria-hidden />
            {driver.stale ? "Last known driver position" : "Driver position from the server"}
          </span>
        ) : null}
      </p>
    </section>
  );
}
