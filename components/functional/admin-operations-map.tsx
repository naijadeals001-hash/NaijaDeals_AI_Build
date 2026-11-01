"use client";

import { MapPin, Car, Circle, CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react";

interface DriverMarker {
  id: string;
  lat: number;
  lng: number;
  status: "available" | "on_trip" | "busy" | "offline";
  vehicleClass?: string;
  driverName?: string;
}

interface ActiveTrip {
  id: string;
  rideNumber: string;
  pickupLabel: string;
  dropoffLabel: string;
  status: string;
  vehicleClass: string;
  fareKobo: number;
  currency: string;
  driverName: string;
  riderName: string;
  driverLat?: number;
  driverLng?: number;
}

interface OperationsMapProps {
  activeTrips?: ActiveTrip[];
  drivers?: DriverMarker[];
  selectedCity?: string;
  loading?: boolean;
  onViewAllTrips?: () => void;
}

const cityCenters: Record<string, { lat: number; lng: number; zoom: number }> = {
  lagos: { lat: 6.5244, lng: 3.3792, zoom: 11 },
  abuja: { lat: 9.0765, lng: 7.3986, zoom: 11 },
  ph: { lat: 4.8156, lng: 7.0498, zoom: 11 },
  ibadan: { lat: 7.3775, lng: 3.9470, zoom: 11 },
  kano: { lat: 12.0022, lng: 8.5920, zoom: 11 },
  NG: { lat: 9.0820, lng: 8.6753, zoom: 6 },
};

const statusConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  available: { color: "text-[#00E676]", label: "Available", icon: <Circle className="h-2 w-2 fill-current" /> },
  on_trip: { color: "text-[#3B82F6]", label: "On Trip", icon: <Car className="h-2.5 w-2.5" /> },
  busy: { color: "text-[#F59E0B]", label: "Busy", icon: <AlertTriangle className="h-2.5 w-2.5" /> },
  offline: { color: "text-[#8B949E]", label: "Offline", icon: <XCircle className="h-2.5 w-2.5" /> },
  requested: { color: "text-[#F59E0B]", label: "Requested", icon: <Circle className="h-2 w-2 fill-current" /> },
  driver_assigned: { color: "text-[#3B82F6]", label: "Driver Assigned", icon: <Car className="h-2.5 w-2.5" /> },
  driver_arriving: { color: "text-[#8B5CF6]", label: "Driver Arriving", icon: <Car className="h-2.5 w-2.5" /> },
  in_progress: { color: "text-[#3B82F6]", label: "In Progress", icon: <Car className="h-2.5 w-2.5" /> },
  completed: { color: "text-[#00E676]", label: "Completed", icon: <CheckCircle className="h-2.5 w-2.5" /> },
  cancelled: { color: "text-crimson", label: "Cancelled", icon: <XCircle className="h-2.5 w-2.5" /> },
};

export function OperationsMap({ activeTrips = [], drivers = [], selectedCity = "lagos", loading, onViewAllTrips }: OperationsMapProps) {
  const cityCenter = cityCenters[selectedCity] || cityCenters.lagos;
  const onTripDrivers = drivers.filter((d) => d.status === "on_trip");
  const availableDrivers = drivers.filter((d) => d.status === "available");
  const busyDrivers = drivers.filter((d) => d.status === "busy");
  const offlineDrivers = drivers.filter((d) => d.status === "offline");

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] h-[420px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00E676]" />
      </div>
    );
  }

  return (
    <section className="space-y-4" aria-label="Live operations">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-[#00E676]/10 px-3 py-1.5">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-[#00E676] animate-ping opacity-75" />
              <span className="relative rounded-full bg-[#00E676]" />
            </span>
            <span className="text-xs font-bold text-[#00E676]">LIVE</span>
          </div>
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Live Operations Map</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCity}
            onChange={(e) => { /* handled by parent */ }}
            className="h-9 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 text-sm font-medium text-[#F0F6FC] focus:outline-none focus:ring-2 focus:ring-[#00E676]/30 focus:border-[#00E676]"
            aria-label="Select city"
          >
            {Object.entries(cityCenters).map(([key, _]) => (
              <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Map Area */}
        <div className="lg:col-span-8 rounded-2xl border border-[#21262D] bg-[#161B22] overflow-hidden" style={{ minHeight: "420px" }}>
          <div className="relative h-full w-full">
            {/* Map placeholder - in production this would be Mapbox/Leaflet */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-[#0B0E14] via-[#161B22] to-[#0B0E14]"
              aria-hidden="true"
            />
            <div className="relative h-full w-full flex items-center justify-center">
              <div className="text-center p-8">
                <MapPin className="h-12 w-12 mx-auto text-[#21262D]" aria-hidden="true" />
                <p className="mt-4 text-lg font-medium text-[#8B949E]">Operations Map</p>
                <p className="mt-1 text-sm text-[#484F58]">
                  Mapbox GL integration required for live driver positions.<br />
                  Showing {onTripDrivers.length} active trips, {availableDrivers.length} available drivers.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-[#484F58]">
                  <div className="flex items-center gap-1.5">
                    <Circle className="h-2.5 w-2.5 fill-current text-[#3B82F6]" />
                    <span>On Trip: {onTripDrivers.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Circle className="h-2.5 w-2.5 fill-current text-[#00E676]" />
                    <span>Available: {availableDrivers.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Circle className="h-2.5 w-2.5 fill-current text-[#F59E0B]" />
                    <span>Busy: {busyDrivers.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Circle className="h-2.5 w-2.5 fill-current text-[#8B949E]" />
                    <span>Offline: {offlineDrivers.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Simulated driver markers overlay */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {onTripDrivers.slice(0, 8).map((driver, i) => (
                <div
                  key={driver.id}
                  className="absolute"
                  style={{
                    left: `${15 + (i % 4) * 20}%`,
                    top: `${20 + Math.floor(i / 4) * 35}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <Car className="h-5 w-5 text-[#3B82F6] drop-shadow-lg" />
                </div>
              ))}
              {availableDrivers.slice(0, 12).map((driver, i) => (
                <div
                  key={driver.id}
                  className="absolute"
                  style={{
                    left: `${10 + (i % 6) * 15}%`,
                    top: `${15 + Math.floor(i / 6) * 40}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <Circle className="h-3 w-3 fill-current text-[#00E676] drop-shadow" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Active Fleet Panel */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">Active Fleet</h3>
              <span className="text-xs font-bold text-[#00E676]">{drivers.length} total</span>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { key: "on_trip", label: "On Trip", count: onTripDrivers.length, color: "text-[#3B82F6]", icon: <Car className="h-4 w-4" /> },
                { key: "available", label: "Available", count: availableDrivers.length, color: "text-[#00E676]", icon: <Circle className="h-4 w-4 fill-current" /> },
                { key: "busy", label: "Busy", count: busyDrivers.length, color: "text-[#F59E0B]", icon: <AlertTriangle className="h-4 w-4" /> },
                { key: "offline", label: "Offline", count: offlineDrivers.length, color: "text-[#8B949E]", icon: <XCircle className="h-4 w-4" /> },
              ].map((stat) => (
                <div key={stat.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`${stat.color}`}>{stat.icon}</span>
                    <span className="text-sm text-[#F0F6FC]">{stat.label}</span>
                  </div>
                  <span className="font-display text-lg font-extrabold text-[#F0F6FC]">{stat.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Trips List */}
          <div className="rounded-2xl border border-[#21262D] bg-[#161B22] shadow-soft">
            <div className="border-b border-[#21262D] px-5 py-3 flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">Active Trips</h3>
              <button
                onClick={onViewAllTrips}
                className="text-xs font-bold text-[#00E676] hover:underline"
              >
                View All →
              </button>
            </div>
            <div className="divide-y divide-[#21262D] max-h-[320px] overflow-y-auto">
              {activeTrips.length === 0 ? (
                <div className="p-5 text-center text-sm text-[#8B949E]">No active trips</div>
              ) : (
                activeTrips.slice(0, 10).map((trip) => (
                  <div key={trip.id} className="px-5 py-3 hover:bg-[#21262D]/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-extrabold text-[#F0F6FC] text-sm truncate max-w-[140px]">
                        {trip.rideNumber}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        statusConfig[trip.status]?.color || "text-[#8B949E]"
                      } bg-transparent border border-current`}>
                        {statusConfig[trip.status]?.label || trip.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#8B949E] truncate">
                      {trip.pickupLabel} → {trip.dropoffLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8B949E]">
                      {trip.driverName} • {trip.vehicleClass} • <strong className="text-[#F0F6FC]">₦{Number(trip.fareKobo).toLocaleString()}</strong>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}