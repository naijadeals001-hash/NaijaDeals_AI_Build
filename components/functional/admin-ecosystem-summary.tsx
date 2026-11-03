"use client";

import { Users, ShoppingBag, DollarSign, ShieldCheck, RotateCcw, BarChart3 } from "lucide-react";

interface SummaryData {
  users: number;
  ordersAndTrips: number;
  grossVerified: string;
  escrowHeld: string;
  refunded: string;
}

export function EcosystemSummary({ data }: { data: SummaryData }) {
  const metrics = [
    { label: "Total users", value: data.users.toLocaleString(), icon: Users, color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10" },
    {
      label: "Orders + trips",
      value: data.ordersAndTrips.toLocaleString(),
      icon: ShoppingBag,
      color: "text-[#00E676]",
      bg: "bg-[#00E676]/10"
    },
    { label: "Verified revenue", value: data.grossVerified, icon: DollarSign, color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" },
    { label: "Escrow held", value: data.escrowHeld, icon: ShieldCheck, color: "text-[#F97316]", bg: "bg-[#F97316]/10" },
    { label: "Refunded", value: data.refunded, icon: RotateCcw, color: "text-[#EC4899]", bg: "bg-[#EC4899]/10" }
  ];

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="Ecosystem summary">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[#00E676]" aria-hidden="true" />
        <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Ecosystem Summary</h2>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center gap-3 rounded-xl p-3 hover:bg-[#21262D]">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${metric.bg} ${metric.color}`}>
              <metric.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-[#8B949E]">{metric.label}</p>
              <p className="truncate font-display text-lg font-extrabold text-[#F0F6FC]">{metric.value}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-[#21262D] pt-3 text-xs text-[#8B949E]">
        Platform commission is not shown because no commission rate is configured and no platform wallet ledger exists yet.
      </p>
    </section>
  );
}
