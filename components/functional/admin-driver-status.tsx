"use client";

import { Car, Circle, Users } from "lucide-react";

interface DriverStatusProps {
  registeredDrivers: number;
  driversOnTrip: number;
  activeTrips: number;
}

/**
 * Honest replacement for the former online/offline donut. Presence tracking is
 * not implemented, so this reports only what the ride and account records prove.
 */
export function DriverStatus({ registeredDrivers, driversOnTrip, activeTrips }: DriverStatusProps) {
  const notOnTrip = Math.max(registeredDrivers - driversOnTrip, 0);
  const total = registeredDrivers;
  const onTripShare = total > 0 ? (driversOnTrip / total) * 100 : 0;

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft" aria-label="Driver coverage">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#00E676]" aria-hidden="true" />
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Driver Coverage</h2>
        </div>
        <span className="text-xs font-bold text-[#8B949E]">{registeredDrivers.toLocaleString()} registered drivers</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col items-center justify-center">
          <div className="relative" style={{ width: "200px", height: "200px" }} role="img" aria-label={`${driversOnTrip} of ${registeredDrivers} registered drivers are on an active trip`}>
            <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="100" cy="100" r="80" fill="none" stroke="#21262D" strokeWidth="24" />
              {total > 0 && (
                <circle
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="24"
                  strokeDasharray={`${(onTripShare / 100) * (2 * Math.PI * 80)} ${2 * Math.PI * 80}`}
                  strokeLinecap="round"
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-extrabold text-[#F0F6FC]">{registeredDrivers.toLocaleString()}</span>
              <span className="text-xs text-[#8B949E]">Registered drivers</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-[#21262D] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-current text-[#3B82F6]">
              <Car className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#F0F6FC]">On an active trip</span>
                <span className="font-display text-lg font-extrabold text-[#F0F6FC]">{driversOnTrip}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#0B0E14]">
                <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${onTripShare}%` }} />
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold text-[#8B949E]">{onTripShare.toFixed(1)}%</span>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-[#21262D] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-current text-[#00E676]">
              <Circle className="h-3 w-3 fill-current" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#F0F6FC]">Not on a trip</span>
                <span className="font-display text-lg font-extrabold text-[#F0F6FC]">{notOnTrip}</span>
              </div>
              <p className="mt-1 text-xs text-[#8B949E]">May be online or offline — presence is not tracked.</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#21262D] pt-2 text-sm">
            <span className="text-[#8B949E]">Active trips right now</span>
            <span className="font-bold text-[#00E676]">{activeTrips}</span>
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-[#21262D] pt-3 text-xs text-[#8B949E]">
        Driver online/offline status and vehicle telemetry are not recorded in this build, so no such statistics are shown.
      </p>
    </section>
  );
}
