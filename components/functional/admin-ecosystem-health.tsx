"use client";

import { ShieldCheck, HeartPulse, Server, Activity, TrendingUp, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

interface EcosystemHealthProps {
  loading?: boolean;
}

export function EcosystemHealth({ loading }: EcosystemHealthProps) {
  const services = [
    { name: "API Gateway", status: "operational", latency: "42ms" },
    { name: "Database (Primary)", status: "operational", latency: "12ms" },
    { name: "Database (Replica)", status: "operational", latency: "18ms" },
    { name: "Redis Cache", status: "operational", latency: "3ms" },
    { name: "Message Queue", status: "operational", latency: "8ms" },
    { name: "NaijaPay Gateway", status: "operational", latency: "156ms" },
    { name: "Mapbox Tiles", status: "operational", latency: "89ms" },
    { name: "Push Notifications", status: "degraded", latency: "340ms" },
    { name: "Email Service", status: "operational", latency: "234ms" },
    { name: "SMS Gateway", status: "operational", latency: "567ms" },
    { name: "Storage (S3)", status: "operational", latency: "67ms" },
    { name: "Analytics Pipeline", status: "maintenance", latency: "—" },
  ];

  const operational = services.filter((s) => s.status === "operational").length;
  const total = services.length;
  const uptime = ((operational / total) * 100).toFixed(2);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft animate-pulse">
        <div className="h-6 w-1/3 bg-[#21262D] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-[#21262D] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "operational":
        return { color: "text-[#00E676]", bg: "bg-[#00E676]/10", icon: <CheckCircle className="h-3.5 w-3.5" /> };
      case "degraded":
        return { color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", icon: <AlertTriangle className="h-3.5 w-3.5" /> };
      case "maintenance":
        return { color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10", icon: <Activity className="h-3.5 w-3.5" /> };
      default:
        return { color: "text-crimson", bg: "bg-crimson/10", icon: <XCircle className="h-3.5 w-3.5" /> };
    }
  };

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft sticky top-112 lg:top-20" aria-label="Ecosystem health">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-[#00E676]" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Ecosystem Health</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inset-0 rounded-full bg-[#00E676] animate-ping opacity-75" />
            <span className="relative rounded-full bg-[#00E676]" />
          </span>
          <span className="text-xs font-bold text-[#00E676]">All Systems Operational</span>
        </div>
      </div>

      <div className="mb-4 rounded-xl bg-[#21262D] p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-[#00E676] mb-1">
          <ShieldCheck className="h-5 w-5" />
          <span className="font-display text-2xl font-extrabold text-[#F0F6FC]">{uptime}%</span>
        </div>
        <p className="text-xs text-[#8B949E]">Uptime (Last 30 Days)</p>
      </div>

      <div className="space-y-2">
        {services.map((service) => {
          const config = getStatusConfig(service.status);
          return (
            <div key={service.name} className="flex items-center justify-between rounded-lg p-2.5 hover:bg-[#21262D] transition-colors">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded ${config.bg} ${config.color}`}>
                  {config.icon}
                </div>
                <span className="text-sm font-medium text-[#F0F6FC] truncate max-w-[140px]">{service.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${config.color}`}>{service.status.charAt(0).toUpperCase() + service.status.slice(1)}</span>
                {service.latency !== "—" && <span className="text-xs text-[#8B949E] font-mono">{service.latency}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}