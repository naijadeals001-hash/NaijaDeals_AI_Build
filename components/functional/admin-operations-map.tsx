"use client";

import { MapPin, Car, CheckCircle, XCircle } from "lucide-react";

interface ActiveTrip {
  id: string;
  rideNumber: string;
  pickupLabel: string;
  dropoffLabel: string;
  status: string;
  driverName: string;
  fare: string;
}

interface OperationsMapProps {
  activeTrips: ActiveTrip[];
  driverCount: number;
  driversOnTrip: number;
  onViewAllTrips?: () => void;
}

const statusLabel: Record<string, string> = {
  requested: "Requested",
  driver_assigned: "Driver assigned",
  driver_arriving: "Driver arriving",
  in_progress: "In progress"
};

const statusColor: Record<string, string> = {
  requested: "text-[#F59E0B]",
  driver_assigned: "text-[#3B82F6]",
  driver_arriving: "text-[#8B5CF6]",
  in_progress: "text-[#3B82F6]"
};

export function OperationsMap({ activeTrips, driverCount, driversOnTrip, onViewAllTrips }: OperationsMapProps) {
  return (
    <section className="space-y-4" aria-label="Live operations">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Operations Map</h2>
          <span className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 text-xs font-bold text-[#F59E0B]">
            Map not connected
          </span>
        </div>
        <p className="text-xs text-[#8B949E]">Driver positions require a configured mapping provider.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="overflow-hidden rounded-2xl border border-[#21262D] bg-[#161B22] lg:col-span-8" style={{ minHeight: "420px" }}>
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0B0E14] via-[#161B22] to-[#0B0E14]" aria-hidden="true" />
            <div className="relative p-8 text-center">
              <MapPin className="mx-auto h-12 w-12 text-[#21262D]" aria-hidden="true" />
              <p className="mt-4 text-lg font-medium text-[#8B949E]">Live driver positions are unavailable</p>
              <p className="mt-1 max-w-md text-sm text-[#484F58]">
                No mapping provider or driver location feed is configured. Trip records still appear on the right and in
                the Trips tab.
              </p>
              <dl className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-[#8B949E]">
                <div>
                  <dt className="font-bold uppercase tracking-wide">Registered drivers</dt>
                  <dd className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{driverCount}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide">Drivers on a trip</dt>
                  <dd className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{driversOnTrip}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide">Active trips</dt>
                  <dd className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{activeTrips.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#21262D] bg-[#161B22] shadow-soft lg:col-span-4">
          <div className="flex items-center justify-between border-b border-[#21262D] px-5 py-3">
            <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">Active Trips</h3>
            <button type="button" onClick={onViewAllTrips} className="text-xs font-bold text-[#00E676] hover:underline">
              View all →
            </button>
          </div>
          <div className="max-h-[360px] divide-y divide-[#21262D] overflow-y-auto">
            {activeTrips.length === 0 ? (
              <p className="p-5 text-center text-sm text-[#8B949E]">No active trips right now.</p>
            ) : (
              activeTrips.slice(0, 12).map((trip) => (
                <div key={trip.id} className="px-5 py-3 hover:bg-[#21262D]/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="max-w-[150px] truncate font-display text-sm font-extrabold text-[#F0F6FC]">
                      {trip.rideNumber}
                    </span>
                    <span className={`shrink-0 rounded-full border border-current px-2 py-0.5 text-[10px] font-bold ${statusColor[trip.status] ?? "text-[#8B949E]"}`}>
                      {statusLabel[trip.status] ?? trip.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#8B949E]">
                    {trip.pickupLabel} → {trip.dropoffLabel}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8B949E]">
                    <Car className="h-3 w-3" aria-hidden="true" />
                    {trip.driverName} · <strong className="text-[#F0F6FC]">{trip.fare}</strong>
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-[#21262D] px-5 py-3 text-xs text-[#8B949E]">
            <p className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-[#00E676]" aria-hidden="true" /> Sourced from /api/admin/rides
            </p>
            <p className="mt-1 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" /> No simulated map markers
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
