"use client";

import { Clock, AlertTriangle, Bell, CheckCircle, XCircle, UserPlus, Package, Car, DollarSign, Zap, Plus, Settings, Truck, MapPin, Shield } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "ride" | "order" | "driver" | "vendor" | "payment" | "system";
  action: string;
  entity: string;
  actor?: string;
  timestamp: string;
  status: "success" | "warning" | "error" | "info";
}

interface ActivityPanelProps {
  activities?: ActivityItem[];
  loading?: boolean;
}

export function ActivityPanel({ activities = [], loading }: ActivityPanelProps) {
  const defaultActivities: ActivityItem[] = [
    { id: "1", type: "ride", action: "Trip completed", entity: "NDR-A1B2C3", actor: "Driver: Adebayo K.", timestamp: "2 min ago", status: "success" },
    { id: "2", type: "driver", action: "New driver approved", entity: "DRV-X9Y8Z7", actor: "System", timestamp: "5 min ago", status: "success" },
    { id: "3", type: "payment", action: "Payout processed", entity: "Vendor: FreshMart Lagos", actor: "Admin: Control Center", timestamp: "12 min ago", status: "success" },
    { id: "4", type: "ride", action: "Ride cancelled by rider", entity: "NDR-D4E5F6", actor: "Rider: Chidinma O.", timestamp: "18 min ago", status: "warning" },
    { id: "5", type: "vendor", action: "Seller application submitted", entity: "TechGadgets NG", actor: "Applicant: Musa A.", timestamp: "25 min ago", status: "info" },
    { id: "6", type: "order", action: "Order delivered", entity: "ORD-G7H8I9", actor: "Courier: Bolt Logistics", timestamp: "32 min ago", status: "success" },
    { id: "7", type: "system", action: "Price surge activated", entity: "Zone: Victoria Island", actor: "Auto-pricing engine", timestamp: "41 min ago", status: "info" },
    { id: "8", type: "driver", action: "Driver went offline", entity: "DRV-J0K1L2", actor: "Driver: Emmanuel T.", timestamp: "48 min ago", status: "warning" },
    { id: "9", type: "payment", action: "Refund issued", entity: "ORD-M3N4O5", actor: "Admin: Control Center", timestamp: "55 min ago", status: "success" },
    { id: "10", type: "ride", action: "New ride requested", entity: "NDR-P6Q7R8", actor: "Rider: Fatima S.", timestamp: "1 hr ago", status: "info" },
  ];

  const displayActivities = activities.length > 0 ? activities : defaultActivities;

  const getTypeIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "ride": return <Car className="h-3.5 w-3.5 text-[#3B82F6]" />;
      case "order": return <Package className="h-3.5 w-3.5 text-[#F97316]" />;
      case "driver": return <UserPlus className="h-3.5 w-3.5 text-[#00E676]" />;
      case "vendor": return <Shield className="h-3.5 w-3.5 text-[#8B5CF6]" />;
      case "payment": return <DollarSign className="h-3.5 w-3.5 text-[#F59E0B]" />;
      case "system": return <Zap className="h-3.5 w-3.5 text-[#EC4899]" />;
    }
  };

  const getStatusIcon = (status: ActivityItem["status"]) => {
    switch (status) {
      case "success": return <CheckCircle className="h-3 w-3 text-[#00E676]" />;
      case "warning": return <AlertTriangle className="h-3 w-3 text-[#F59E0B]" />;
      case "error": return <XCircle className="h-3 w-3 text-crimson" />;
      case "info": return <Bell className="h-3 w-3 text-[#3B82F6]" />;
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft animate-pulse">
        <div className="h-6 w-1/4 bg-[#21262D] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-[#21262D] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="Recent activity">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#00E676]" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Recent Activities (Ecosystem Wide)</h2>
        </div>
        <span className="text-xs text-[#8B949E] font-bold">Live feed</span>
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto">
        {displayActivities.map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-3 rounded-xl p-3 hover:bg-[#21262D]/50 transition-colors"
          >
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-[#21262D] text-[#8B949E]">
              {getTypeIcon(activity.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[#F0F6FC] truncate">
                  <strong>{activity.action}</strong> • {activity.entity}
                </p>
                <span className="shrink-0 text-[10px] text-[#8B949E] font-medium">{activity.timestamp}</span>
              </div>
              <p className="mt-0.5 text-xs text-[#8B949E]">
                {activity.actor ? `By: ${activity.actor}` : "System event"}
              </p>
            </div>
            <div className="shrink-0 flex items-center">
              {getStatusIcon(activity.status)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}