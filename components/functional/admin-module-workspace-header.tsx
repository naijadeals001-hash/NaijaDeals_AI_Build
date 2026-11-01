"use client";

import { usePathname, useRouter } from "next/navigation";
import { MapPin, Globe, Zap, ExternalLink, Users, Truck, Car, ShoppingBag, Utensils, Package, Briefcase, Home, Music, CreditCard, Apple, Sparkles } from "lucide-react";

interface ModuleWorkspaceHeaderProps {
  moduleId: string;
  userRoles: string[];
}

const moduleConfigs: Record<string, {
  icon: React.ReactNode;
  title: string;
  description: string;
  accentColor: string;
  bgColor: string;
  geographyOptions: { value: string; label: string }[];
}> = {
  ecosystem: {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Ecosystem Overview",
    description: "Unified administration across all NaijaDeals modules, users, payments and operations.",
    accentColor: "text-[#00E676]",
    bgColor: "bg-[#00E676]/10",
    geographyOptions: [
      { value: "all", label: "All Regions" },
      { value: "NG", label: "Nigeria" },
      { value: "GH", label: "Ghana" },
      { value: "KE", label: "Kenya" },
    ],
  },
  drive: {
    icon: <Car className="h-6 w-6" />,
    title: "NaijaDrive Admin",
    description: "Ride-hailing, delivery, micromobility, car-sharing & fleet operations.",
    accentColor: "text-[#3B82F6]",
    bgColor: "bg-[#3B82F6]/10",
    geographyOptions: [
      { value: "NG", label: "Nigeria (All Cities)" },
      { value: "lagos", label: "Lagos" },
      { value: "abuja", label: "Abuja" },
      { value: "ph", label: "Port Harcourt" },
      { value: "ibadan", label: "Ibadan" },
      { value: "kano", label: "Kano" },
    ],
  },
  shop: {
    icon: <ShoppingBag className="h-6 w-6" />,
    title: "NaijaShop Admin",
    description: "Marketplace commerce, seller management, products & orders.",
    accentColor: "text-[#F97316]",
    bgColor: "bg-[#F97316]/10",
    geographyOptions: [
      { value: "all", label: "All Markets" },
      { value: "lagos", label: "Lagos" },
      { value: "abuja", label: "Abuja" },
    ],
  },
  eats: {
    icon: <Utensils className="h-6 w-6" />,
    title: "NaijaEats Admin",
    description: "Food delivery, restaurant partnerships & logistics orchestration.",
    accentColor: "text-[#EF4444]",
    bgColor: "bg-[#EF4444]/10",
    geographyOptions: [
      { value: "all", label: "All Cities" },
      { value: "lagos", label: "Lagos" },
      { value: "abuja", label: "Abuja" },
    ],
  },
  send: {
    icon: <Package className="h-6 w-6" />,
    title: "NaijaSend Admin",
    description: "Parcel logistics, courier network & last-mile delivery.",
    accentColor: "text-[#8B5CF6]",
    bgColor: "bg-[#8B5CF6]/10",
    geographyOptions: [
      { value: "all", label: "All Routes" },
      { value: "NG", label: "Nigeria Domestic" },
      { value: "intl", label: "International" },
    ],
  },
  gigs: {
    icon: <Briefcase className="h-6 w-6" />,
    title: "NaijaGigs Admin",
    description: "Service marketplace, freelancer verification & booking management.",
    accentColor: "text-[#EC4899]",
    bgColor: "bg-[#EC4899]/10",
    geographyOptions: [
      { value: "all", label: "All Regions" },
    ],
  },
  stay: {
    icon: <Home className="h-6 w-6" />,
    title: "NaijaStay Admin",
    description: "Hotel & accommodation listings, bookings & partner management.",
    accentColor: "text-[#06B6D4]",
    bgColor: "bg-[#06B6D4]/10",
    geographyOptions: [
      { value: "all", label: "All Destinations" },
    ],
  },
  stream: {
    icon: <Music className="h-6 w-6" />,
    title: "NaijaStream Admin",
    description: "Content streaming, creator tools & media distribution.",
    accentColor: "text-[#84CC16]",
    bgColor: "bg-[#84CC16]/10",
    geographyOptions: [
      { value: "all", label: "All Regions" },
    ],
  },
  pay: {
    icon: <CreditCard className="h-6 w-6" />,
    title: "NaijaPay Admin",
    description: "Wallet operations, payment processing & financial compliance.",
    accentColor: "text-[#F59E0B]",
    bgColor: "bg-[#F59E0B]/10",
    geographyOptions: [
      { value: "all", label: "All Regions" },
    ],
  },
  fresh: {
    icon: <Apple className="h-6 w-6" />,
    title: "NaijaFresh Admin",
    description: "Grocery delivery, dark stores & quick commerce operations.",
    accentColor: "text-[#22C55E]",
    bgColor: "bg-[#22C55E]/10",
    geographyOptions: [
      { value: "all", label: "All Cities" },
    ],
  },
  aura: {
    icon: <Sparkles className="h-6 w-6" />,
    title: "Aura AI Admin",
    description: "AI copilot, automation workflows & intelligent insights.",
    accentColor: "text-[#A855F7]",
    bgColor: "bg-[#A855F7]/10",
    geographyOptions: [
      { value: "all", label: "All Modules" },
    ],
  },
};

const moduleNavTabs: Record<string, { id: string; label: string; available: boolean }[]> = {
  drive: [
    { id: "overview", label: "Overview", available: true },
    { id: "dispatch", label: "Dispatch", available: true },
    { id: "live-map", label: "Live Map", available: true },
    { id: "trips", label: "Trips", available: true },
    { id: "drivers", label: "Drivers", available: true },
    { id: "vehicles", label: "Vehicles", available: true },
    { id: "fleet", label: "Fleet", available: true },
    { id: "pricing", label: "Pricing", available: true },
    { id: "zones", label: "Zones", available: true },
    { id: "services", label: "Services", available: true },
    { id: "promotions", label: "Promotions", available: true },
    { id: "finance", label: "Finance", available: true },
    { id: "reports", label: "Reports", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  shop: [
    { id: "overview", label: "Overview", available: true },
    { id: "orders", label: "Orders", available: true },
    { id: "products", label: "Products", available: true },
    { id: "sellers", label: "Sellers", available: true },
    { id: "categories", label: "Categories", available: true },
    { id: "promotions", label: "Promotions", available: true },
    { id: "finance", label: "Finance", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  eats: [
    { id: "overview", label: "Overview", available: true },
    { id: "orders", label: "Orders", available: true },
    { id: "restaurants", label: "Restaurants", available: true },
    { id: "couriers", label: "Couriers", available: true },
    { id: "zones", label: "Zones", available: true },
    { id: "promotions", label: "Promotions", available: true },
    { id: "finance", label: "Finance", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  send: [
    { id: "overview", label: "Overview", available: true },
    { id: "parcels", label: "Parcels", available: true },
    { id: "couriers", label: "Couriers", available: true },
    { id: "routes", label: "Routes", available: true },
    { id: "pricing", label: "Pricing", available: true },
    { id: "finance", label: "Finance", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  gigs: [
    { id: "overview", label: "Overview", available: true },
    { id: "services", label: "Services", available: true },
    { id: "freelancers", label: "Freelancers", available: true },
    { id: "bookings", label: "Bookings", available: true },
    { id: "disputes", label: "Disputes", available: true },
    { id: "finance", label: "Finance", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  stay: [
    { id: "overview", label: "Overview", available: true },
    { id: "properties", label: "Properties", available: true },
    { id: "bookings", label: "Bookings", available: true },
    { id: "partners", label: "Partners", available: true },
    { id: "pricing", label: "Pricing", available: true },
    { id: "finance", label: "Finance", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  stream: [
    { id: "overview", label: "Overview", available: true },
    { id: "content", label: "Content", available: true },
    { id: "creators", label: "Creators", available: true },
    { id: "analytics", label: "Analytics", available: true },
    { id: "monetization", label: "Monetization", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  pay: [
    { id: "overview", label: "Overview", available: true },
    { id: "transactions", label: "Transactions", available: true },
    { id: "wallets", label: "Wallets", available: true },
    { id: "providers", label: "Providers", available: true },
    { id: "compliance", label: "Compliance", available: true },
    { id: "settlements", label: "Settlements", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  fresh: [
    { id: "overview", label: "Overview", available: true },
    { id: "orders", label: "Orders", available: true },
    { id: "stores", label: "Dark Stores", available: true },
    { id: "inventory", label: "Inventory", available: true },
    { id: "couriers", label: "Couriers", available: true },
    { id: "settings", label: "Settings", available: true },
  ],
  aura: [
    { id: "overview", label: "Overview", available: true },
    { id: "models", label: "Models", available: false },
    { id: "workflows", label: "Workflows", available: false },
    { id: "analytics", label: "Analytics", available: false },
    { id: "settings", label: "Settings", available: true },
  ],
  ecosystem: [
    { id: "overview", label: "Overview", available: true },
    { id: "analytics", label: "Analytics", available: true },
    { id: "users", label: "Users & Access", available: true },
    { id: "payments", label: "Payments", available: true },
    { id: "settings", label: "System Settings", available: true },
  ],
};

export function ModuleWorkspaceHeader({ moduleId, userRoles }: ModuleWorkspaceHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const config = moduleConfigs[moduleId] || moduleConfigs.ecosystem;
  const navTabs = moduleNavTabs[moduleId] || moduleNavTabs.ecosystem;
  const isSuperAdmin = userRoles.includes("super_admin");

  const getCurrentTab = () => {
    if (!pathname) return "overview";
    const match = pathname.match(/[?&]tab=([a-z-]+)/);
    return match ? match[1] : "overview";
  };

  const currentTab = getCurrentTab();

  const handleGeographyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPath = pathname.replace(/[?&]geo=[^&]*/, "").replace(/\?$/, "");
    const separator = newPath.includes("?") ? "&" : "?";
    router.push(`${newPath}${separator}geo=${e.target.value}`);
  };

  const handleTabClick = (tabId: string) => {
    if (!navTabs.find((t) => t.id === tabId)?.available) return;
    const newPath = pathname.replace(/[?&]tab=[^&]*/, "").replace(/\?$/, "");
    const separator = newPath.includes("?") ? "&" : "?";
    router.push(`${newPath}${separator}tab=${tabId}`);
  };

  return (
    <header className="border-b border-[#21262D] bg-[#161B22]/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4">
          <div className="flex items-center gap-4">
            <div
              className={`shrink-0 flex h-12 w-12 items-center justify-center rounded-xl ${config.bgColor} ${config.accentColor}`}
              aria-hidden="true"
            >
              {config.icon}
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold text-[#F0F6FC]">{config.title}</h1>
              <p className="text-sm text-[#8B949E]">{config.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 hidden sm:flex">
              <MapPin className="h-4 w-4 text-[#8B949E]" aria-hidden="true" />
              <select
                value={new URLSearchParams(pathname?.split("?")[1] || "").get("geo") || config.geographyOptions[0].value}
                onChange={handleGeographyChange}
                className="h-9 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 text-sm font-medium text-[#F0F6FC] focus:outline-none focus:ring-2 focus:ring-[#00E676]/30 focus:border-[#00E676]"
                aria-label="Geographic filter"
              >
                {config.geographyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-[#00E676]/10 px-2.5 py-1 text-xs font-bold text-[#00E676]">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-[#00E676] animate-ping opacity-75" />
                  <span className="relative rounded-full bg-[#00E676]" />
                </span>
                Live Operations
              </span>

              {moduleId === "drive" && (
                <>
                  <button
                    onClick={() => window.open("/drive", "_blank")}
                    className="hidden sm:flex items-center gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
                    aria-label="Launch User App"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>User App</span>
                  </button>
                  <button
                    onClick={() => window.open("/drive/driver", "_blank")}
                    className="hidden sm:flex items-center gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 py-1.5 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
                    aria-label="Launch Driver App"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Driver App</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="border-t border-[#21262D]" aria-label="Module navigation">
          <div className="flex gap-1 overflow-x-auto pb-1 px-2" role="tablist">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={currentTab === tab.id}
                aria-disabled={!tab.available}
                onClick={() => handleTabClick(tab.id)}
                className={`min-h-10 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors ${
                  currentTab === tab.id
                    ? "bg-[#00E676] text-[#0B0E14] shadow-lift"
                    : tab.available
                    ? "bg-[#21262D] text-[#8B949E] hover:bg-[#30363D] hover:text-[#F0F6FC]"
                    : "bg-[#21262D]/50 text-[#484F58] cursor-not-allowed"
                }`}
                disabled={!tab.available}
              >
                {tab.label}
                {!tab.available && (
                  <span className="ml-1.5 text-[10px] opacity-60" aria-hidden="true">Soon</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}