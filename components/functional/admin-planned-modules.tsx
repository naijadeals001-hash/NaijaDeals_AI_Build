"use client";

import { Plus, HeartPulse, GraduationCap, Plane, Calendar, PiggyBank, Lock, ArrowRight, Sparkles } from "lucide-react";

interface PlannedModule {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  status: "planning" | "design" | "development" | "beta";
  targetDate?: string;
}

const plannedModules: PlannedModule[] = [
  {
    id: "health",
    name: "NaijaHealth",
    description: "Telemedicine, appointments & health records",
    icon: <HeartPulse className="h-5 w-5" />,
    color: "text-[#EF4444]",
    bgColor: "bg-[#EF4444]/10",
    status: "planning",
    targetDate: "Q3 2025",
  },
  {
    id: "learn",
    name: "NaijaLearn",
    description: "Online courses, tutoring & certifications",
    icon: <GraduationCap className="h-5 w-5" />,
    color: "text-[#3B82F6]",
    bgColor: "bg-[#3B82F6]/10",
    status: "design",
    targetDate: "Q4 2025",
  },
  {
    id: "travel",
    name: "NaijaTravel",
    description: "Flights, buses, trains & travel packages",
    icon: <Plane className="h-5 w-5" />,
    color: "text-[#8B5CF6]",
    bgColor: "bg-[#8B5CF6]/10",
    status: "planning",
    targetDate: "Q1 2026",
  },
  {
    id: "events",
    name: "NaijaEvents",
    description: "Event discovery, ticketing & venue booking",
    icon: <Calendar className="h-5 w-5" />,
    color: "text-[#EC4899]",
    bgColor: "bg-[#EC4899]/10",
    status: "design",
    targetDate: "Q2 2026",
  },
  {
    id: "finance",
    name: "NaijaFinance",
    description: "Loans, insurance, investment & credit scoring",
    icon: <PiggyBank className="h-5 w-5" />,
    color: "text-[#F59E0B]",
    bgColor: "bg-[#F59E0B]/10",
    status: "beta",
    targetDate: "Q3 2026",
  },
];

interface PlannedModulesProps {
  userRoles: string[];
  userActorType?: string;
}

export function PlannedModules({ userRoles, userActorType }: PlannedModulesProps) {
  const isSuperAdmin = userRoles.includes("super_admin") || userActorType === "SUPER_ADMIN";

  const getStatusConfig = (status: PlannedModule["status"]) => {
    switch (status) {
      case "planning":
        return { label: "Planning", color: "text-[#8B949E]", bg: "bg-[#21262D]" };
      case "design":
        return { label: "In Design", color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10" };
      case "development":
        return { label: "In Development", color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" };
      case "beta":
        return { label: "Beta Testing", color: "text-[#00E676]", bg: "bg-[#00E676]/10" };
    }
  };

  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft sticky top-112 lg:top-20" aria-label="Future modules roadmap">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#A855F7]" />
          <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Future Modules (Roadmap)</h2>
        </div>
        {isSuperAdmin && (
          <button className="flex items-center gap-1.5 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]">
            <Plus className="h-3.5 w-3.5" />
            <span>Propose New Module</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        {plannedModules.map((module) => {
          const statusConfig = getStatusConfig(module.status);
          return (
            <div
              key={module.id}
              className="group flex items-start gap-3 rounded-xl p-3 hover:bg-[#21262D] transition-colors"
            >
              <div className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-lg ${module.bgColor} ${module.color}`}>
                {module.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm text-[#F0F6FC] group-hover:text-[#00E676] transition-colors">{module.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusConfig.bg} ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-[#8B949E] truncate">{module.description}</p>
                {module.targetDate && (
                  <p className="mt-1 text-[10px] text-[#484F58]">Target: {module.targetDate}</p>
                )}
              </div>
              {isSuperAdmin && (
                <button className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[#8B949E] hover:text-[#00E676]">
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-[#21262D]">
        <p className="text-[11px] text-[#484F58] text-center">
          Module roadmap is indicative. Timelines subject to change based on market conditions and regulatory approvals.
        </p>
      </div>
    </section>
  );
}