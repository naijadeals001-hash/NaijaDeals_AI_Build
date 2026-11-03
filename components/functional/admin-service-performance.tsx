"use client";

import { BarChart3, Car, Package, ShoppingBag, type LucideIcon } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

export interface ServiceMetric {
  service: string;
  total: number;
  completed: number;
  cancelled: number;
  revenueKobo: number;
}

const icons: LucideIcon[] = [ShoppingBag, Car, Package];

export function ServicePerformance({ metrics }: { metrics: ServiceMetric[] }) {
  const hasData = metrics.some((metric) => metric.total > 0);

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft" aria-label="Service performance">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#00E676]" aria-hidden="true" />
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Service Performance</h2>
        </div>
        <span className="text-xs font-bold text-[#8B949E]">All-time records in this database</span>
      </div>

      {!hasData ? (
        <p className="py-8 text-center text-sm text-[#8B949E]">
          No orders, trips or deliveries exist yet, so there is no service performance to report.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#21262D] bg-[#21262D] text-xs uppercase text-[#8B949E]">
                <th scope="col" className="px-4 py-3">Service</th>
                <th scope="col" className="px-4 py-3 text-right">Total</th>
                <th scope="col" className="px-4 py-3 text-right">Completed</th>
                <th scope="col" className="px-4 py-3 text-right">Cancelled / failed</th>
                <th scope="col" className="px-4 py-3 text-right">Completion</th>
                <th scope="col" className="px-4 py-3 text-right">Recorded value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D]">
              {metrics.map((metric, index) => {
                const Icon = icons[index] ?? ShoppingBag;
                const completion = metric.total > 0 ? ((metric.completed / metric.total) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={metric.service} className="hover:bg-[#21262D]/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#21262D] text-[#00E676]">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="font-bold text-[#F0F6FC]">{metric.service}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#F0F6FC]">{metric.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-[#00E676]">{metric.completed.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-crimson">{metric.cancelled.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#F0F6FC]">{completion}%</td>
                    <td className="px-4 py-3 text-right font-bold text-[#F0F6FC]">{koboToNaira(metric.revenueKobo)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 border-t border-[#21262D] pt-3 text-xs text-[#8B949E]">
        Customer ratings are not stored in this database yet, so no rating column is shown. “Recorded value” is the sum
        of order totals, ride fares or delivery fees actually stored on each record.
      </p>
    </section>
  );
}
