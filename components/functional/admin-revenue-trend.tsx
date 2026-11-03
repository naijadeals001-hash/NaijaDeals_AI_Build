"use client";

import { DollarSign, TrendingUp } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

export interface RevenuePoint {
  date: string;
  revenueKobo: number;
  transactions: number;
}

export function RevenueTrend({ points }: { points: RevenuePoint[] }) {
  const totalKobo = points.reduce((sum, point) => sum + point.revenueKobo, 0);
  const totalTransactions = points.reduce((sum, point) => sum + point.transactions, 0);
  const max = Math.max(...points.map((point) => point.revenueKobo), 0);
  const hasData = totalKobo > 0;

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft" aria-label="Revenue trend">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-[#F59E0B]" aria-hidden="true" />
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Verified Revenue (Last 7 Days)</h2>
        </div>
        <span className="text-xs font-bold text-[#8B949E]">Completed payments only</span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-[#21262D] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">Total verified</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{koboToNaira(totalKobo)}</p>
        </div>
        <div className="rounded-xl bg-[#21262D] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">Completed payments</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">{totalTransactions.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-[#21262D] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">Daily average</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#F0F6FC]">
            {koboToNaira(Math.round(totalKobo / 7))}
          </p>
        </div>
      </div>

      {!hasData ? (
        <p className="py-8 text-center text-sm text-[#8B949E]">
          No completed payments were recorded in the last seven days. The chart will populate when real payments are
          verified.
        </p>
      ) : (
        <div className="flex h-64 items-end gap-3 px-2" role="img" aria-label="Verified revenue bar chart for the last seven days">
          {points.map((point) => {
            const height = max > 0 ? Math.max((point.revenueKobo / max) * 160, point.revenueKobo > 0 ? 6 : 2) : 2;
            const day = new Date(`${point.date}T00:00:00`);
            return (
              <div key={point.date} className="flex flex-1 flex-col items-center">
                <div
                  className="w-full max-w-[48px] rounded-xl bg-gradient-to-t from-[#00E676] to-[#22C55E]"
                  style={{ height: `${height}px` }}
                  aria-label={`${koboToNaira(point.revenueKobo)} from ${point.transactions} payment(s) on ${day.toLocaleDateString("en-NG")}`}
                />
                <span className="mt-2 whitespace-nowrap text-[10px] text-[#8B949E]">
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 border-t border-[#21262D] pt-3 text-xs text-[#8B949E]">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        No week-over-week percentage is shown because the API does not return a previous-period aggregate.
      </p>
    </section>
  );
}
