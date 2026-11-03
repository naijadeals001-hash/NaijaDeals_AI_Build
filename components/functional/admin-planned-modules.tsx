"use client";

import { HeartPulse, GraduationCap, Plane, Calendar, PiggyBank, Sparkles, Info } from "lucide-react";

interface PlannedModule {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const plannedModules: PlannedModule[] = [
  { id: "health", name: "NaijaHealth", description: "Telemedicine and health records", icon: <HeartPulse className="h-5 w-5" />, color: "text-[#EF4444]", bgColor: "bg-[#EF4444]/10" },
  { id: "learn", name: "NaijaLearn", description: "Courses, tutoring and certifications", icon: <GraduationCap className="h-5 w-5" />, color: "text-[#3B82F6]", bgColor: "bg-[#3B82F6]/10" },
  { id: "travel", name: "NaijaTravel", description: "Flights, buses and travel packages", icon: <Plane className="h-5 w-5" />, color: "text-[#8B5CF6]", bgColor: "bg-[#8B5CF6]/10" },
  { id: "events", name: "NaijaEvents", description: "Event discovery and ticketing", icon: <Calendar className="h-5 w-5" />, color: "text-[#EC4899]", bgColor: "bg-[#EC4899]/10" },
  { id: "finance", name: "NaijaFinance", description: "Loans, insurance and credit scoring", icon: <PiggyBank className="h-5 w-5" />, color: "text-[#F59E0B]", bgColor: "bg-[#F59E0B]/10" }
];

/**
 * Roadmap only. No delivery statuses, dates or "propose" controls are shown
 * because no planning system or approval workflow exists in this repository.
 */
export function PlannedModules({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-5 shadow-soft" aria-label="Future modules roadmap">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#A855F7]" aria-hidden="true" />
        <h2 className="font-display text-base font-extrabold text-[#F0F6FC]">Future Modules</h2>
      </div>

      <div className="space-y-2">
        {plannedModules.map((module) => (
          <div key={module.id} className="flex items-start gap-3 rounded-xl p-3 hover:bg-[#21262D]">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${module.bgColor} ${module.color}`}>
              {module.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#F0F6FC]">{module.name}</p>
                <span className="shrink-0 rounded-full bg-[#21262D] px-2 py-0.5 text-[10px] font-bold text-[#8B949E]">
                  Planned
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[#8B949E]">{module.description}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-start gap-2 border-t border-[#21262D] pt-4 text-[11px] text-[#8B949E]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        These modules have no schema, API or workflow in this build. {isSuperAdmin ? "Roadmap dates are not tracked in the repository." : "Roadmap dates are not tracked in the repository."}
      </p>
    </section>
  );
}
