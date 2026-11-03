"use client";

import {
  ShoppingBag,
  Users,
  UserCheck,
  DollarSign,
  ShieldCheck,
  ClipboardList,
  Car,
  type LucideIcon
} from "lucide-react";

export interface KpiItem {
  label: string;
  value: string;
  icon: "users" | "orders" | "paid" | "money" | "shield" | "applications" | "route";
  accent: "blue" | "green" | "violet" | "amber" | "orange" | "pink";
}

const iconMap: Record<KpiItem["icon"], LucideIcon> = {
  users: Users,
  orders: ShoppingBag,
  paid: UserCheck,
  money: DollarSign,
  shield: ShieldCheck,
  applications: ClipboardList,
  route: Car
};

const accentMap: Record<KpiItem["accent"], { text: string; bg: string }> = {
  blue: { text: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10" },
  green: { text: "text-[#00E676]", bg: "bg-[#00E676]/10" },
  violet: { text: "text-[#8B5CF6]", bg: "bg-[#8B5CF6]/10" },
  amber: { text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" },
  orange: { text: "text-[#F97316]", bg: "bg-[#F97316]/10" },
  pink: { text: "text-[#EC4899]", bg: "bg-[#EC4899]/10" }
};

/**
 * KPI grid fed exclusively by real database aggregates. No trend percentages
 * are shown because the API does not return a comparable previous period.
 */
export function OverviewKpis({ items }: { items: KpiItem[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Key performance indicators">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const accent = accentMap[item.accent];
        return (
          <div key={item.label} className="min-w-0 rounded-2xl border border-[#21262D] bg-[#161B22] p-4 shadow-soft">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent.bg} ${accent.text}`} aria-hidden="true">
              <Icon className="h-4 w-4" />
            </div>
            <p className="mt-2.5 truncate font-display text-xl font-extrabold text-[#F0F6FC]">{item.value}</p>
            <p className="mt-0.5 line-clamp-2 text-[10px] font-black uppercase leading-tight tracking-wide text-[#8B949E]">
              {item.label}
            </p>
          </div>
        );
      })}
    </section>
  );
}
