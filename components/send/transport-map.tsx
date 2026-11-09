"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { Navigation, SignalLow } from "lucide-react";

/**
 * NaijaSend transport map.
 *
 * What it shows, and what it does not:
 *  - OpenStreetMap raster tiles with pickup and destination markers.
 *  - A straight line between the two points when only labels are known. It is
 *    NOT a road route and NOT turn-by-turn guidance, and the caption says so.
 *  - If tiles fail, a schematic diagram is drawn instead so a weak connection
 *    never blocks the transporter from acting.
 *
 * Coordinates come from the project's landmark table when a label matches one;
 * otherwise the map centres on the city and marks the labels without inventing
 * a precise location.
 */

type Point = { lat: number; lng: number } | null;

export function TransportMap({ pickup, dropoff, pickupLabel, dropoffLabel, distanceMeters }: { pickup: Point; dropoff: Point; pickupLabel: string; dropoffLabel: string; distanceMeters: number | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [lowData, setLowData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const errors = { count: 0 };
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || lowData) return;
      const centre: [number, number] = pickup ? [pickup.lat, pickup.lng] : dropoff ? [dropoff.lat, dropoff.lng] : [6.5244, 3.3792];
      const map = L.map(containerRef.current, { center: centre, zoom: 11, zoomControl: true, attributionControl: true });
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      })
        .on("tileerror", () => {
          errors.count += 1;
          if (errors.count >= 4) setStatus("failed");
        })
        .on("load", () => setStatus("ready"))
        .addTo(map);

      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      const icon = (color: string) =>
        L.divIcon({ className: "", html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] });
      if (pickup) L.marker([pickup.lat, pickup.lng], { icon: icon("#006d38") }).bindTooltip(`Pickup: ${pickupLabel}`, { permanent: false }).addTo(layer);
      if (dropoff) L.marker([dropoff.lat, dropoff.lng], { icon: icon("#f26b21") }).bindTooltip(`Delivery: ${dropoffLabel}`, { permanent: false }).addTo(layer);
      if (pickup && dropoff) {
        L.polyline(
          [
            [pickup.lat, pickup.lng],
            [dropoff.lat, dropoff.lng]
          ],
          { color: "#0b5c33", weight: 3, dashArray: "6 6" }
        ).addTo(layer);
        map.fitBounds(
          [
            [pickup.lat, pickup.lng],
            [dropoff.lat, dropoff.lng]
          ],
          { padding: [28, 28] }
        );
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, lowData, pickupLabel, dropoffLabel]);

  return (
    <figure className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#eef1ef]">
      <div className="relative h-[240px] w-full bg-[#e8f3e4]">
        {!lowData ? <div ref={containerRef} className="h-full w-full" aria-label={`Map showing pickup at ${pickupLabel} and delivery at ${dropoffLabel}`} role="img" /> : null}
        {lowData || status === "failed" ? (
          <div className="grid h-full w-full place-items-center p-4 text-center">
            <div>
              <p className="text-[12px] font-extrabold text-[#0b5c33]">{pickup ? "● Pickup" : "○ Pickup (location unknown)"} → {dropoff ? "● Delivery" : "○ Delivery (location unknown)"}</p>
              <p className="mt-1 text-[10.5px] text-[#5d6d64]">{pickupLabel} → {dropoffLabel}</p>
              {distanceMeters ? <p className="text-[10.5px] font-semibold text-[#14241b]">≈ {(distanceMeters / 1000).toFixed(1)} km as the crow flies</p> : null}
            </div>
          </div>
        ) : null}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1ef] px-3 py-2 text-[10px] leading-4 text-[#6b7a70]">
        <span className="flex items-center gap-1">
          <Navigation className="h-3 w-3" aria-hidden />
          {status === "ready" ? "Map with OpenStreetMap tiles. Dashed line is the straight-line distance, not a road route — use your preferred navigation app for turn-by-turn directions." : "Map unavailable; showing the route on a diagram."}
        </span>
        <button type="button" onClick={() => setLowData((value) => !value)} className="flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[#0b5c33] ring-1 ring-[#cfe3ca]">
          <SignalLow className="h-3 w-3" aria-hidden /> {lowData ? "Show map" : "Low data"}
        </button>
      </figcaption>
    </figure>
  );
}
