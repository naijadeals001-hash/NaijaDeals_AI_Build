"use client";

import { Clock, ClipboardList, AlertTriangle, CheckCircle, Info } from "lucide-react";

export interface ActivityItem {
  id: string;
  action: string;
  entity: string;
  actor?: string;
  timestamp: string;
  status: "success" | "warning" | "error" | "info";
}

function statusIcon(status: ActivityItem["status"]) {
  switch (status) {
    case "success":
      return <CheckCircle className="h-3.5 w-3.5 text-[#00E676]" aria-hidden="true" />;
    case "warning":
      return <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />;
    case "error":
      return <AlertTriangle className="h-3.5 w-3.5 text-crimson" aria-hidden="true" />;
    default:
      return <Info className="h-3.5 w-3.5 text-[#3B82F6]" aria-hidden="true" />;
  }
}

export function ActivityPanel({ activities }: { activities: ActivityItem[] }) {
  return (
    <section className="min-w-0 max-w-full rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="Recent activity">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#00E676]" aria-hidden="true" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Recent Activity</h2>
        </div>
        <span className="text-xs font-bold text-[#8B949E]">Audit log</span>
      </div>

      {activities.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#8B949E]">
          No audit entries have been recorded yet. Administrative actions will appear here.
        </p>
      ) : (
        <div className="max-h-[300px] space-y-3 overflow-y-auto">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 rounded-xl p-3 hover:bg-[#21262D]/50">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#21262D] text-[#8B949E]">
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-[#F0F6FC]">
                    <strong>{activity.action}</strong> · {activity.entity}
                  </p>
                  <span className="shrink-0 text-[10px] font-medium text-[#8B949E]">{activity.timestamp}</span>
                </div>
                <p className="mt-0.5 text-xs text-[#8B949E]">
                  {activity.actor ? `Actor: ${activity.actor}` : "System event"}
                </p>
              </div>
              <div className="shrink-0">{statusIcon(activity.status)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
