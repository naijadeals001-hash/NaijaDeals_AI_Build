"use client";

import { MapPin, ExternalLink, Car, ShoppingBag, Utensils, Package, Briefcase, Home, Music, CreditCard, Apple, Sparkles } from "lucide-react";
import { MODULE_TABS, TAB_LABELS, type AdminModule, type AdminTab } from "@/lib/admin/admin-navigation";
import { adminRegionOptions, regionOptionValue, type AdminRegion } from "@/lib/admin/region";

interface ModuleWorkspaceHeaderProps {
  moduleId: AdminModule;
  region: AdminRegion;
  userRoles: string[];
  currentTab: AdminTab;
  isSuperAdmin: boolean;
  onNavigate: (target: { module?: string; tab?: string; geo?: string }) => void;
}

const GEO_OPTIONS = adminRegionOptions();

const moduleConfigs: Record<AdminModule, {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
  bgColor: string;
  geographyOptions: Array<{ value: string; label: string }>;
}> = {
  ecosystem: {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Ecosystem Control Center",
    description: "Unified administration across every module that exists in this build.",
    accentColor: "text-[#00E676]",
    bgColor: "bg-[#00E676]/10",
    geographyOptions: GEO_OPTIONS
  },
  drive: {
    icon: <Car className="h-6 w-6" />,
    title: "NaijaDrive Admin",
    description: "Ride-hailing operations, trips, driver accounts and settlement records.",
    accentColor: "text-[#3B82F6]",
    bgColor: "bg-[#3B82F6]/10",
    geographyOptions: GEO_OPTIONS
  },
  shop: {
    icon: <ShoppingBag className="h-6 w-6" />,
    title: "NaijaShop Admin",
    description: "Marketplace commerce, seller management, products and orders.",
    accentColor: "text-[#F97316]",
    bgColor: "bg-[#F97316]/10",
    geographyOptions: GEO_OPTIONS
  },
  eats: {
    icon: <Utensils className="h-6 w-6" />,
    title: "NaijaEats Admin",
    description: "Food delivery roadmap. No operational data exists in this build.",
    accentColor: "text-[#EF4444]",
    bgColor: "bg-[#EF4444]/10",
    geographyOptions: GEO_OPTIONS
  },
  send: {
    icon: <Package className="h-6 w-6" />,
    title: "NaijaSend Admin",
    description: "Parcel logistics and last-mile delivery records attached to marketplace orders.",
    accentColor: "text-[#8B5CF6]",
    bgColor: "bg-[#8B5CF6]/10",
    geographyOptions: GEO_OPTIONS
  },
  gigs: {
    icon: <Briefcase className="h-6 w-6" />,
    title: "NaijaGigs Admin",
    description: "Services roadmap. No operational data exists in this build.",
    accentColor: "text-[#EC4899]",
    bgColor: "bg-[#EC4899]/10",
    geographyOptions: GEO_OPTIONS
  },
  stay: {
    icon: <Home className="h-6 w-6" />,
    title: "NaijaStay Admin",
    description: "Accommodation roadmap. No operational data exists in this build.",
    accentColor: "text-[#06B6D4]",
    bgColor: "bg-[#06B6D4]/10",
    geographyOptions: GEO_OPTIONS
  },
  stream: {
    icon: <Music className="h-6 w-6" />,
    title: "NaijaStream Admin",
    description: "Streaming roadmap. No operational data exists in this build.",
    accentColor: "text-[#84CC16]",
    bgColor: "bg-[#84CC16]/10",
    geographyOptions: GEO_OPTIONS
  },
  pay: {
    icon: <CreditCard className="h-6 w-6" />,
    title: "NaijaPay Admin",
    description: "Payment records, provider configuration and vendor payouts.",
    accentColor: "text-[#F59E0B]",
    bgColor: "bg-[#F59E0B]/10",
    geographyOptions: GEO_OPTIONS
  },
  fresh: {
    icon: <Apple className="h-6 w-6" />,
    title: "NaijaFresh Admin",
    description: "Quick-commerce roadmap. No operational data exists in this build.",
    accentColor: "text-[#22C55E]",
    bgColor: "bg-[#22C55E]/10",
    geographyOptions: GEO_OPTIONS
  },
  aura: {
    icon: <Sparkles className="h-6 w-6" />,
    title: "Aura AI Admin",
    description: "AI assistant roadmap. No model provider or workflow is configured.",
    accentColor: "text-[#A855F7]",
    bgColor: "bg-[#A855F7]/10",
    geographyOptions: GEO_OPTIONS
  }
};

export function ModuleWorkspaceHeader({
  moduleId,
  region,
  userRoles,
  currentTab,
  isSuperAdmin,
  onNavigate
}: ModuleWorkspaceHeaderProps) {
  const config = moduleConfigs[moduleId];
  const baseTabs = MODULE_TABS[moduleId];
  const tabs = isSuperAdmin ? [...baseTabs, { id: "settings" as AdminTab, label: TAB_LABELS.settings }] : baseTabs;
  const geo = regionOptionValue(region);

  return (
    <header className="min-w-0 max-w-full border-b border-[#21262D] bg-[#161B22]/95 backdrop-blur">
      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${config.bgColor} ${config.accentColor}`} aria-hidden="true">
              {config.icon}
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold text-[#F0F6FC]">{config.title}</h1>
              <p className="text-sm text-[#8B949E]">{config.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#8B949E]" aria-hidden="true" />
              <label htmlFor="workspace-geo" className="sr-only">
                Geographic filter
              </label>
              <span className="sr-only" role="status" aria-live="polite">
                {geo === "all" ? "All regions" : `Filtering module tables to ${config.geographyOptions.find((option) => option.value === geo)?.label ?? geo}`}
              </span>
              <select
                id="workspace-geo"
                value={geo}
                onChange={(event) => onNavigate({ module: moduleId, geo: event.target.value })}
                className="h-9 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 text-sm font-medium text-[#F0F6FC] focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/30"
              >
                {config.geographyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <span className="flex items-center gap-1.5 rounded-full border border-[#21262D] bg-[#0B0E14] px-2.5 py-1 text-xs font-bold text-[#8B949E]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" aria-hidden="true" />
              Local admin workspace
            </span>

            {moduleId === "drive" && (
              <>
                <a
                  href="/naijadrive"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden items-center gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] sm:flex"
                  aria-label="Open the NaijaDrive user app in a new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>User App</span>
                </a>
                <a
                  href="/driver"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden items-center gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D] sm:flex"
                  aria-label="Open the NaijaDrive driver app in a new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Driver App</span>
                </a>
              </>
            )}
          </div>
        </div>

        <nav className="border-t border-[#21262D]" aria-label="Module navigation">
          <div className="flex gap-1 overflow-x-auto px-2 pb-1" role="tablist">
            {tabs.map((tab) => {
              const selected = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onNavigate({ module: moduleId, tab: tab.id })}
                  className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors ${
                    selected
                      ? "bg-[#00E676] text-[#0B0E14] shadow-lift"
                      : "bg-[#21262D] text-[#8B949E] hover:bg-[#30363D] hover:text-[#F0F6FC]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
