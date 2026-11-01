"use client";

import { TrendingUp, TrendingDown, Minus, Users, UserCheck, ShoppingBag, DollarSign, Clock, Truck } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  iconColor?: string;
  iconBg?: string;
  loading?: boolean;
}

export function KPICard({ label, value, trend, icon, iconColor = "text-[#00E676]", iconBg = "bg-[#00E676]/10", loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft animate-pulse">
        <div className="h-4 w-3/4 bg-[#21262D] rounded mb-2" />
        <div className="h-8 w-1/2 bg-[#21262D] rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-[#8B949E] truncate">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-[#F0F6FC] truncate">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center gap-1.5">
              {trend.value > 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-[#00E676]" aria-hidden="true" />
              ) : trend.value < 0 ? (
                <TrendingDown className="h-3.5 w-3.5 text-crimson" aria-hidden="true" />
              ) : (
                <Minus className="h-3.5 w-3.5 text-[#8B949E]" aria-hidden="true" />
              )}
              <span
                className={`text-xs font-bold ${
                  trend.value > 0 ? "text-[#00E676]" : trend.value < 0 ? "text-crimson" : "text-[#8B949E]"
                }`}
              >
                {trend.value > 0 ? "+" : ""}{trend.value.toFixed(1)}%
              </span>
              <span className="text-xs text-[#8B949E]">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-xl ${iconBg} ${iconColor}`} aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

interface KPICardsProps {
  data?: {
    totalTrips?: number;
    activeDrivers?: number;
    registeredRiders?: number;
    grossRevenue?: string;
    platformCommission?: string;
    avgPickupTime?: number;
  };
  loading?: boolean;
}

export function DriveKPICards({ data, loading }: KPICardsProps) {
  const kpis = [
    {
      label: "Total Trips",
      value: data?.totalTrips?.toLocaleString() ?? "—",
      trend: data?.totalTrips ? { value: 14.6, label: "vs last month" } : undefined,
      icon: <ShoppingBag className="h-5 w-5" />,
      iconColor: "text-[#3B82F6]",
      iconBg: "bg-[#3B82F6]/10",
    },
    {
      label: "Active Drivers",
      value: data?.activeDrivers?.toLocaleString() ?? "—",
      trend: data?.activeDrivers ? { value: 6.8, label: "vs last month" } : undefined,
      icon: <UserCheck className="h-5 w-5" />,
      iconColor: "text-[#00E676]",
      iconBg: "bg-[#00E676]/10",
    },
    {
      label: "Registered Riders",
      value: data?.registeredRiders?.toLocaleString() ?? "—",
      trend: data?.registeredRiders ? { value: 12.4, label: "vs last month" } : undefined,
      icon: <Users className="h-5 w-5" />,
      iconColor: "text-[#8B5CF6]",
      iconBg: "bg-[#8B5CF6]/10",
    },
    {
      label: "Gross Revenue",
      value: data?.grossRevenue ?? "—",
      trend: data?.grossRevenue ? { value: 18.9, label: "vs last month" } : undefined,
      icon: <DollarSign className="h-5 w-5" />,
      iconColor: "text-[#F59E0B]",
      iconBg: "bg-[#F59E0B]/10",
    },
    {
      label: "Platform Commission",
      value: data?.platformCommission ?? "—",
      trend: data?.platformCommission ? { value: 18.9, label: "vs last month" } : undefined,
      icon: <DollarSign className="h-5 w-5" />,
      iconColor: "text-[#F97316]",
      iconBg: "bg-[#F97316]/10",
    },
    {
      label: "Avg. Pickup Time",
      value: data?.avgPickupTime ? `${data.avgPickupTime.toFixed(1)} min` : "—",
      trend: data?.avgPickupTime ? { value: -22.1, label: "vs last month" } : undefined,
      icon: <Clock className="h-5 w-5" />,
      iconColor: "text-[#EC4899]",
      iconBg: "bg-[#EC4899]/10",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Key performance indicators">
      {kpis.map((kpi, index) => (
        <KPICard key={kpi.label} {...kpi} loading={loading} />
      ))}
    </section>
  );
}

export function EcosystemKPICards({ data, loading }: KPICardsProps) {
  const kpis = [
    {
      label: "Total Users",
      value: data?.totalTrips?.toLocaleString() ?? "—",
      trend: data?.totalTrips ? { value: 8.2, label: "vs last month" } : undefined,
      icon: <Users className="h-5 w-5" />,
      iconColor: "text-[#3B82F6]",
      iconBg: "bg-[#3B82F6]/10",
    },
    {
      label: "Total Orders/Trips",
      value: data?.activeDrivers?.toLocaleString() ?? "—",
      trend: data?.activeDrivers ? { value: 15.3, label: "vs last month" } : undefined,
      icon: <ShoppingBag className="h-5 w-5" />,
      iconColor: "text-[#00E676]",
      iconBg: "bg-[#00E676]/10",
    },
    {
      label: "Total Revenue",
      value: data?.grossRevenue ?? "—",
      trend: data?.grossRevenue ? { value: 22.1, label: "vs last month" } : undefined,
      icon: <DollarSign className="h-5 w-5" />,
      iconColor: "text-[#F59E0B]",
      iconBg: "bg-[#F59E0B]/10",
    },
    {
      label: "Platform Earnings",
      value: data?.platformCommission ?? "—",
      trend: data?.platformCommission ? { value: 22.1, label: "vs last month" } : undefined,
      icon: <DollarSign className="h-5 w-5" />,
      iconColor: "text-[#F97316]",
      iconBg: "bg-[#F97316]/10",
    },
    {
      label: "Active Vendors",
      value: data?.registeredRiders?.toLocaleString() ?? "—",
      trend: data?.registeredRiders ? { value: 5.7, label: "vs last month" } : undefined,
      icon: <UserCheck className="h-5 w-5" />,
      iconColor: "text-[#8B5CF6]",
      iconBg: "bg-[#8B5CF6]/10",
    },
    {
      label: "Active Couriers",
      value: data?.avgPickupTime?.toLocaleString() ?? "—",
      trend: data?.avgPickupTime ? { value: 3.2, label: "vs last month" } : undefined,
      icon: <Truck className="h-5 w-5" />,
      iconColor: "text-[#EC4899]",
      iconBg: "bg-[#EC4899]/10",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Key performance indicators">
      {kpis.map((kpi) => (
        <KPICard key={kpi.label} {...kpi} loading={loading} />
      ))}
    </section>
  );
}