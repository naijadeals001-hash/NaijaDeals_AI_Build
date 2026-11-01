"use client";

import { Users, ShoppingBag, DollarSign, TrendingUp, BarChart3 } from "lucide-react";

interface EcosystemSummaryProps {
  data?: {
    totalUsers?: number;
    totalOrdersTrips?: number;
    totalRevenue?: string;
    platformEarnings?: string;
  };
  loading?: boolean;
}

export function EcosystemSummary({ data, loading }: EcosystemSummaryProps) {
  const metrics = [
    {
      label: "Total Users",
      value: data?.totalUsers?.toLocaleString() ?? "—",
      icon: Users,
      color: "text-[#3B82F6]",
      bgColor: "bg-[#3B82F6]/10",
    },
    {
      label: "Total Orders/Trips",
      value: data?.totalOrdersTrips?.toLocaleString() ?? "—",
      icon: ShoppingBag,
      color: "text-[#00E676]",
      bgColor: "bg-[#00E676]/10",
    },
    {
      label: "Total Revenue",
      value: data?.totalRevenue ?? "—",
      icon: DollarSign,
      color: "text-[#F59E0B]",
      bgColor: "bg-[#F59E0B]/10",
    },
    {
      label: "Platform Earnings",
      value: data?.platformEarnings ?? "—",
      icon: DollarSign,
      color: "text-[#F97316]",
      bgColor: "bg-[#F97316]/10",
    },
  ];

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft animate-pulse">
        <div className="h-6 w-1/3 bg-[#21262D] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-[#21262D] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft sticky top-112 lg:top-20" aria-label="Ecosystem summary">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#00E676]" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Ecosystem Summary (All Modules)</h2>
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center gap-3 rounded-xl p-3 hover:bg-[#21262D] transition-colors">
            <div className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-lg ${metric.bgColor} ${metric.color}`}>
              <metric.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">{metric.label}</p>
              <p className="font-display text-lg font-extrabold text-[#F0F6FC] truncate">{metric.value}</p>
            </div>
            <TrendingUp className="h-5 w-5 text-[#00E676]/50" aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  );
}