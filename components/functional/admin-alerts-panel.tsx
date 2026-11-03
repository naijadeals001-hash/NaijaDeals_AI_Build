"use client";

import { AlertTriangle, Bell, Info, ExternalLink, CheckCircle } from "lucide-react";

export interface AlertItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  module: string;
  actionLabel?: string;
  actionHref?: string;
}

function severityConfig(severity: AlertItem["severity"]) {
  switch (severity) {
    case "critical":
      return { color: "text-crimson", bg: "bg-crimson/10", border: "border-crimson/30", icon: <AlertTriangle className="h-4 w-4" /> };
    case "warning":
      return { color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30", icon: <Bell className="h-4 w-4" /> };
    default:
      return { color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10", border: "border-[#3B82F6]/30", icon: <Info className="h-4 w-4" /> };
  }
}

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const warnings = alerts.filter((alert) => alert.severity === "warning").length;

  return (
    <section className="min-w-0 max-w-full rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="Operational alerts">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#F59E0B]" aria-hidden="true" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Alerts & Actions</h2>
        </div>
        <span className="text-xs font-bold text-[#8B949E]">
          {critical} critical · {warnings} warning
        </span>
      </div>

      {alerts.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-[#8B949E]">
          <CheckCircle className="h-4 w-4 text-[#00E676]" aria-hidden="true" />
          No operational issues derived from current records.
        </p>
      ) : (
        <div className="max-h-[300px] space-y-3 overflow-y-auto">
          {alerts.map((alert) => {
            const config = severityConfig(alert.severity);
            return (
              <div key={alert.id} className={`flex items-start gap-3 rounded-xl border p-4 ${config.bg} ${config.border}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-current ${config.color}`}>
                  {config.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-sm font-bold ${config.color}`}>{alert.title}</h3>
                  <p className="mt-1 text-sm text-[#8B949E]">{alert.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#8B949E]">{alert.module}</span>
                    {alert.actionHref && (
                      <a href={alert.actionHref} className="flex items-center gap-1 text-xs font-bold text-[#00E676] hover:underline">
                        {alert.actionLabel ?? "Open"}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
