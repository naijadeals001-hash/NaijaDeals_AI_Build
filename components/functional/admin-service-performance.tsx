"use client";

import { BarChart3, TrendingUp, Users, Truck, Car, Utensils, Package, Home, Briefcase } from "lucide-react";

interface ServiceMetric {
  service: string;
  icon: React.ReactNode;
  total: number;
  completed: number;
  cancelled: number;
  avgRating?: number;
  revenue?: string;
  color: string;
}

interface ServicePerformanceProps {
  metrics?: ServiceMetric[];
  loading?: boolean;
}

export function ServicePerformance({ metrics = [], loading }: ServicePerformanceProps) {
  const defaultMetrics: ServiceMetric[] = [
    {
      service: "Rides",
      icon: <Car className="h-4 w-4" />,
      total: 12548,
      completed: 11820,
      cancelled: 728,
      avgRating: 4.7,
      revenue: "₦18.2M",
      color: "text-[#3B82F6]",
    },
    {
      service: "Pooled Rides",
      icon: <Users className="h-4 w-4" />,
      total: 3421,
      completed: 3180,
      cancelled: 241,
      avgRating: 4.5,
      revenue: "₦2.8M",
      color: "text-[#8B5CF6]",
    },
    {
      service: "Food & Groceries",
      icon: <Utensils className="h-4 w-4" />,
      total: 8932,
      completed: 8450,
      cancelled: 482,
      avgRating: 4.6,
      revenue: "₦12.4M",
      color: "text-[#EF4444]",
    },
    {
      service: "Packages",
      icon: <Package className="h-4 w-4" />,
      total: 5671,
      completed: 5320,
      cancelled: 351,
      avgRating: 4.8,
      revenue: "₦6.1M",
      color: "text-[#F97316]",
    },
    {
      service: "Micromobility",
      icon: <Briefcase className="h-4 w-4" />,
      total: 2156,
      completed: 2080,
      cancelled: 76,
      avgRating: 4.4,
      revenue: "₦1.2M",
      color: "text-[#84CC16]",
    },
    {
      service: "Car-sharing",
      icon: <Car className="h-4 w-4" />,
      total: 1843,
      completed: 1720,
      cancelled: 123,
      avgRating: 4.3,
      revenue: "₦3.8M",
      color: "text-[#EC4899]",
    },
    {
      service: "Business Accounts",
      icon: <Home className="h-4 w-4" />,
      total: 487,
      completed: 487,
      cancelled: 0,
      avgRating: 4.9,
      revenue: "₦15.6M",
      color: "text-[#06B6D4]",
    },
  ];

  const displayMetrics = metrics.length > 0 ? metrics : defaultMetrics;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft animate-pulse">
        <div className="h-6 w-1/4 bg-[#21262D] rounded mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-[#21262D] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft" aria-label="Service performance">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#00E676]" />
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Service Performance (This Month)</h2>
        </div>
        <span className="text-xs text-[#8B949E] font-bold">Updated just now</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#21262D] bg-[#21262D] text-xs uppercase text-[#8B949E]">
              <th className="py-3 px-4">Service</th>
              <th className="py-3 px-4 text-right">Total Orders</th>
              <th className="py-3 px-4 text-right">Completed</th>
              <th className="py-3 px-4 text-right">Cancelled</th>
              <th className="py-3 px-4 text-right">Completion Rate</th>
              <th className="py-3 px-4 text-right">Avg Rating</th>
              <th className="py-3 px-4 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#21262D]">
            {displayMetrics.map((metric) => {
              const completionRate = metric.total > 0 ? ((metric.completed / metric.total) * 100).toFixed(1) : "0";
              return (
                <tr key={metric.service} className="hover:bg-[#21262D]/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${metric.color} bg-transparent border border-current`}>
                        {metric.icon}
                      </div>
                      <span className="font-bold text-[#F0F6FC]">{metric.service}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-[#F0F6FC]">{metric.total.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-[#00E676] font-medium">{metric.completed.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-crimson font-medium">{metric.cancelled.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right font-bold text-[#F0F6FC]">{completionRate}%</td>
                  <td className="py-3 px-4 text-right">
                    {metric.avgRating ? (
                      <span className="flex items-center gap-1 text-[#F59E0B] font-bold">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {metric.avgRating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-[#8B949E]">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-[#F0F6FC]">{metric.revenue}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}