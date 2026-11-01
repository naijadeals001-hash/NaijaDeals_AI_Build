"use client";

import { AlertTriangle, Bell, XCircle, Info, Clock, Truck, UserPlus, DollarSign, Shield, Car, ExternalLink } from "lucide-react";

interface AlertItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  module: string;
  timestamp: string;
  actionLabel?: string;
  actionHref?: string;
  dismissible?: boolean;
}

interface AlertsPanelProps {
  alerts?: AlertItem[];
  loading?: boolean;
  onDismiss?: (id: string) => void;
}

export function AlertsPanel({ alerts = [], loading, onDismiss }: AlertsPanelProps) {
  const defaultAlerts: AlertItem[] = [
    {
      id: "1",
      severity: "critical",
      title: "Driver shortage in Lagos Island",
      description: "Only 12 drivers online for 47 active ride requests. Surge pricing active but supply gap persists.",
      module: "NaijaDrive",
      timestamp: "3 min ago",
      actionLabel: "View Dispatch",
      actionHref: "/admin?module=drive&tab=dispatch",
    },
    {
      id: "2",
      severity: "warning",
      title: "Payment provider latency elevated",
      description: "Paystack API responding at 2.3s avg (threshold: 1.5s). Some wallet top-ups may be delayed.",
      module: "NaijaPay",
      timestamp: "12 min ago",
      actionLabel: "Check Providers",
      actionHref: "/admin?module=pay&tab=providers",
    },
    {
      id: "3",
      severity: "warning",
      title: "Courier capacity at 94% in Abuja",
      description: "NaijaSend deliveries queued. Consider activating backup courier partners.",
      module: "NaijaSend",
      timestamp: "28 min ago",
      actionLabel: "Manage Couriers",
      actionHref: "/admin?module=send&tab=couriers",
    },
    {
      id: "4",
      severity: "info",
      title: "New seller application requires review",
      description: "FreshFarms Cooperative (Kano) submitted application. 2 pending total.",
      module: "NaijaShop",
      timestamp: "1 hr ago",
      actionLabel: "Review Applications",
      actionHref: "/admin?module=shop&tab=sellers",
    },
    {
      id: "5",
      severity: "info",
      title: "Scheduled maintenance window tonight",
      description: "Database maintenance 02:00-04:00 WAT. Read-only mode for 2 hours.",
      module: "System",
      timestamp: "4 hr ago",
      actionLabel: "View Schedule",
      actionHref: "/admin?tab=settings",
    },
  ];

  const displayAlerts = alerts.length > 0 ? alerts : defaultAlerts;

  const getSeverityConfig = (severity: AlertItem["severity"]) => {
    switch (severity) {
      case "critical":
        return { color: "text-crimson", bg: "bg-crimson/10", border: "border-crimson/30", icon: <AlertTriangle className="h-4 w-4" /> };
      case "warning":
        return { color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30", icon: <Bell className="h-4 w-4" /> };
      case "info":
        return { color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10", border: "border-[#3B82F6]/30", icon: <Info className="h-4 w-4" /> };
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft animate-pulse">
        <div className="h-6 w-1/4 bg-[#21262D] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-[#21262D] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="System alerts">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#F59E0B]" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">System Alerts & Actions</h2>
        </div>
        <span className="text-xs text-[#8B949E] font-bold">
          {displayAlerts.filter((a) => a.severity === "critical").length} critical •
          {displayAlerts.filter((a) => a.severity === "warning").length} warnings
        </span>
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto">
        {displayAlerts.map((alert) => {
          const config = getSeverityConfig(alert.severity);
          return (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-xl p-4 ${config.bg} border ${config.border}`}
            >
              <div className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${config.color} bg-transparent border border-current`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`font-bold text-sm ${config.color}`}>{alert.title}</h3>
                  <span className="shrink-0 text-[10px] text-[#8B949E] font-medium">{alert.timestamp}</span>
                </div>
                <p className="mt-1 text-sm text-[#8B949E]">{alert.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#8B949E]">{alert.module}</span>
                  {alert.actionHref && (
                    <a
                      href={alert.actionHref}
                      className="text-xs font-bold text-[#00E676] hover:underline flex items-center gap-1"
                    >
                      {alert.actionLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              {alert.dismissible && onDismiss && (
                <button
                  onClick={() => onDismiss(alert.id)}
                  className="shrink-0 p-1 text-[#8B949E] hover:text-[#F0F6FC]"
                  aria-label={`Dismiss ${alert.title}`}
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}