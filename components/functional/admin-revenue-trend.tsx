"use client";

import { TrendingUp, DollarSign } from "lucide-react";

interface RevenueDataPoint {
  date: string;
  revenue: number;
  trips: number;
}

interface RevenueTrendProps {
  data?: RevenueDataPoint[];
  loading?: boolean;
}

export function RevenueTrend({ data = [], loading }: RevenueTrendProps) {
  const defaultData: RevenueDataPoint[] = [
    { date: "2024-01-15", revenue: 2840000, trips: 1240 },
    { date: "2024-01-16", revenue: 3120000, trips: 1380 },
    { date: "2024-01-17", revenue: 2980000, trips: 1310 },
    { date: "2024-01-18", revenue: 3450000, trips: 1520 },
    { date: "2024-01-19", revenue: 3890000, trips: 1680 },
    { date: "2024-01-20", revenue: 3670000, trips: 1590 },
    { date: "2024-01-21", revenue: 3210000, trips: 1420 },
  ];

  const displayData = data.length > 0 ? data : defaultData;
  const maxRevenue = Math.max(...displayData.map((d) => d.revenue));
  const totalRevenue = displayData.reduce((sum, d) => sum + d.revenue, 0);
  const totalTrips = displayData.reduce((sum, d) => sum + d.trips, 0);
  const avgDailyRevenue = totalRevenue / displayData.length;
  const trend = displayData.length >= 2
    ? ((displayData[displayData.length - 1].revenue - displayData[0].revenue) / displayData[0].revenue) * 100
    : 0;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft animate-pulse">
        <div className="h-6 w-1/4 bg-[#21262D] rounded mb-4" />
        <div className="h-64 bg-[#21262D] rounded-xl" />
      </div>
    );
  }

  // Simple bar chart data for CSS-based visualization
  const barCount = 7;
  const barMax = maxRevenue;

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft" aria-label="Revenue trend">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-[#F59E0B]" />
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Revenue Trend (Last 7 Days)</h2>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp className={`h-4 w-4 ${trend >= 0 ? "text-[#00E676]" : "text-crimson"}`} />
            <span className={`font-bold ${trend >= 0 ? "text-[#00E676]" : "text-crimson"}`}>
              {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
            </span>
            <span className="text-[#8B949E]">vs previous week</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-xl bg-[#21262D] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">Total Revenue</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">₦{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-[#21262D] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">Total Trips</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{totalTrips.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-[#21262D] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">Daily Average</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">₦{Math.round(avgDailyRevenue).toLocaleString()}</p>
        </div>
      </div>

      {/* CSS-based Bar Chart */}
      <div className="h-64 flex items-end gap-3 px-2" role="img" aria-label="Revenue bar chart for the last 7 days">
        {displayData.map((point, i) => {
          const height = ((point.revenue / barMax) * 160);
          const date = new Date(point.date);
          return (
            <div key={point.date} className="flex-1 flex flex-col items-center">
              <div
                className="w-full max-w-[48px] rounded-xl transition-all duration-500 hover:scale-105"
                style={{
                  backgroundColor: "#00E676",
                  height: `${height}px`,
                  background: "linear-gradient(to top, #00E676, #22C55E)",
                  filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))",
                }}
                aria-label={`${(point.revenue / 1000000).toFixed(1)}M on ${date.toLocaleDateString()}`}
              />
              <span className="mt-2 text-[10px] text-[#8B949E] whitespace-nowrap">
                {date.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}