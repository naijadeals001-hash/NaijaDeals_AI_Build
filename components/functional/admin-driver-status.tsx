"use client";

import { Users, Circle, Car, CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";

interface DriverStatusData {
  online: number;
  onTrip: number;
  busy: number;
  offline: number;
}

interface DriverStatusProps {
  data?: DriverStatusData;
  loading?: boolean;
}

const statusConfig = {
  online: { label: "Online", color: "#00E676", icon: <Circle className="h-4 w-4 fill-current" /> },
  onTrip: { label: "On Trip", color: "#3B82F6", icon: <Car className="h-4 w-4" /> },
  busy: { label: "Busy", color: "#F59E0B", icon: <AlertTriangle className="h-4 w-4" /> },
  offline: { label: "Offline", color: "#8B949E", icon: <XCircle className="h-4 w-4" /> },
};

export function DriverStatus({ data, loading }: DriverStatusProps) {
  const displayData = data || { online: 3981, onTrip: 4362, busy: 77, offline: 521 };
  const total = displayData.online + displayData.onTrip + displayData.busy + displayData.offline;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft animate-pulse">
        <div className="h-6 w-1/4 bg-[#21262D] rounded mb-4" />
        <div className="h-64 bg-[#21262D] rounded-xl" />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft" aria-label="Driver status">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#00E676]" />
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Driver Status</h2>
        </div>
        <span className="text-xs text-[#8B949E] font-bold">{total.toLocaleString()} total drivers</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Donut Chart */}
        <div className="lg:col-span-1 flex flex-col items-center justify-center">
          <div className="relative" style={{ width: "200px", height: "200px" }} role="img" aria-label="Driver status distribution donut chart">
            <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90" aria-hidden="true">
              <circle
                cx="100"
                cy="100"
                r="80"
                fill="none"
                stroke="#21262D"
                strokeWidth="24"
              />
              {[
                { key: "onTrip", value: displayData.onTrip, color: statusConfig.onTrip.color },
                { key: "online", value: displayData.online, color: statusConfig.online.color },
                { key: "busy", value: displayData.busy, color: statusConfig.busy.color },
                { key: "offline", value: displayData.offline, color: statusConfig.offline.color },
              ].map((segment, i) => {
                const previousSum = [
                  displayData.onTrip,
                  displayData.online,
                  displayData.busy,
                  displayData.offline,
                ].slice(0, i).reduce((a, b) => a + b, 0);
                const circumference = 2 * Math.PI * 80;
                const offset = circumference - (previousSum / total) * circumference;
                const dashArray = `${(segment.value / total) * circumference} ${circumference}`;
                return (
                  <circle
                    key={segment.key}
                    cx="100"
                    cy="100"
                    r="80"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="24"
                    strokeDasharray={dashArray}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-3xl font-extrabold text-[#F0F6FC]">{total.toLocaleString()}</span>
              <span className="text-xs text-[#8B949E]">Total Drivers</span>
            </div>
          </div>
        </div>

        {/* Legend & Details */}
        <div className="lg:col-span-1 space-y-3">
          {[
            { key: "onTrip", ...statusConfig.onTrip, value: displayData.onTrip },
            { key: "online", ...statusConfig.online, value: displayData.online },
            { key: "busy", ...statusConfig.busy, value: displayData.busy },
            { key: "offline", ...statusConfig.offline, value: displayData.offline },
          ].map((status) => {
            const percentage = total > 0 ? ((status.value / total) * 100).toFixed(1) : "0";
            return (
              <div
                key={status.key}
                className="flex items-center gap-3 rounded-xl bg-[#21262D] p-4 hover:bg-[#30363D] transition-colors"
              >
                <div className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-transparent border border-current ${status.color}`}>
                  {status.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#F0F6FC]">{status.label}</span>
                    <span className="font-display text-lg font-extrabold text-[#F0F6FC]">{status.value.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-2 bg-[#0B0E14] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: status.color,
                      }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-sm font-bold text-[#8B949E]">{percentage}%</span>
              </div>
            );
          })}

          <div className="pt-2 border-t border-[#21262D] flex items-center justify-between text-sm">
            <span className="text-[#8B949E]">Utilization Rate</span>
            <span className="font-bold text-[#00E676]">
              {total > 0 ? (((displayData.onTrip + displayData.busy) / total) * 100).toFixed(1) : "0"}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}